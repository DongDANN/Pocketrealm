import { describe, expect, it } from 'vitest';
import {
  applySteps,
  autopilotBoon,
  autopilotEvent,
  autopilotFork,
  boonById,
  catchUpChunks,
  catchUpStepCount,
  companionBase,
  elapsedSteps,
  emptyMeta,
  hollowUnlocked,
  newRun,
  oilCapacity,
  resolveChoice,
  stepRun,
  type DelveMeta,
  type HollowId,
  type RoomDef,
  type RunState,
} from '../src/core/delve';
import { OIL_STORAGE_CAP } from '../src/core/rewards';
import {
  CAMP_POLICY,
  mkCtx,
  NO_SIGNALS,
  POLICY,
  TODAY,
  TOMORROW,
  playToEnd,
  singleRowRun,
} from './delve-helpers';

const STEP_MS = 30_000;
const CAP_MS = 12 * 60 * 60 * 1000;

function stepwise(seed: number, hollow: HollowId, level: number) {
  let meta = emptyMeta();
  let run = newRun(seed, hollow, level, meta);
  const keys: string[] = [];
  let guard = 0;
  while (guard < 2000) {
    guard += 1;
    const out = stepRun(run, mkCtx(meta));
    run = out.run;
    meta = out.meta;
    for (const e of out.ledger) keys.push(e.key);
    if (run.result !== 'active') break;
  }
  return { run, meta, keys };
}

function chunked(seed: number, hollow: HollowId, level: number, chunk: number) {
  const meta0 = emptyMeta();
  const run0 = newRun(seed, hollow, level, meta0);
  const it = catchUpChunks(run0, mkCtx(meta0), 2000, chunk);
  let cur = it.next();
  let last = cur.value;
  while (!cur.done) {
    last = cur.value;
    cur = it.next();
  }
  return { run: last.run, meta: last.meta, keys: last.ledger.map((e) => e.key) };
}

describe('run setup', () => {
  it('builds a fresh run with the right ids and base stats', () => {
    const meta = emptyMeta();
    const run = newRun(7, 1, 4, meta);
    expect(run.runId).toBe(`d1-${(7).toString(16)}-${meta.runsStarted + 1}`);
    expect(run.hollowId).toBe(1);
    expect(run.companionLevel).toBe(4);
    expect(run.unit).toMatchObject(companionBase(4));
    expect(run.floorPlan.floor).toBe(1);
    expect(run.result).toBe('active');
    expect(run.boons).toEqual([]);
    expect(run.glint).toBe(0);
    expect(run.embersEarned).toBe(0);
    expect(run.pendingChoice).toBeNull();
  });

  it('gates hollow unlocks by clears and companion level', () => {
    const meta = emptyMeta();
    expect(hollowUnlocked(1, meta, 1)).toBe(true);
    expect(hollowUnlocked(2, meta, 9)).toBe(false);
    const cleared1: DelveMeta = { ...meta, clearedHollows: [1] };
    expect(hollowUnlocked(2, cleared1, 2)).toBe(false);
    expect(hollowUnlocked(2, cleared1, 3)).toBe(true);
    const cleared2: DelveMeta = { ...meta, clearedHollows: [1, 2] };
    expect(hollowUnlocked(3, cleared2, 4)).toBe(false);
    expect(hollowUnlocked(3, cleared2, 5)).toBe(true);
  });
});

describe('determinism and step equivalence', () => {
  it('replays a full Autopilot run identically', () => {
    const a = playToEnd(42, 1, 6);
    const b = playToEnd(42, 1, 6);
    expect(a.run).toEqual(b.run);
    expect(a.meta).toEqual(b.meta);
    expect(a.ledger).toEqual(b.ledger);
  });

  it('matches stepwise play, batch apply, and chunked catch-up across seeds', () => {
    const seeds = [0, 1, 2, 3, 4, 5, 7, 11, 99, 12345];
    const hollows: HollowId[] = [1, 2, 3];
    const chunks = [1, 2, 7, 32, 500];
    for (const seed of seeds) {
      for (const hollow of hollows) {
        const sw = stepwise(seed, hollow, 6);
        for (const chunk of chunks) {
          const ch = chunked(seed, hollow, 6, chunk);
          expect(ch.run, `seed ${seed} hollow ${hollow} chunk ${chunk}`).toEqual(sw.run);
          expect(ch.meta, `seed ${seed} hollow ${hollow} chunk ${chunk}`).toEqual(sw.meta);
          expect(ch.keys, `seed ${seed} hollow ${hollow} chunk ${chunk}`).toEqual(sw.keys);
        }
      }
    }
  });

  it('reports progress through onStep and stops at maxSteps', () => {
    const meta = emptyMeta();
    const run = newRun(3, 1, 4, meta);
    const seen: number[] = [];
    const result = applySteps(run, mkCtx(meta, { oil: 999 }), 3, (r, i) => {
      seen.push(i);
      expect(r.stepIndex).toBe(i + 1);
    });
    expect(result.applied).toBe(3);
    expect(seen).toEqual([0, 1, 2]);
    expect(result.run.result).toBe('active');
  });
});

describe('Lantern Oil', () => {
  it('steps on an empty lamp once the run has started', () => {
    const meta = emptyMeta();
    const run = newRun(1, 1, 4, meta);
    for (const oil of [0, 0.9, 1.5]) {
      const out = stepRun(run, mkCtx(meta, { oil }));
      expect(out.run.stepIndex).toBe(1);
      expect(out.run.result).toBe('active');
      expect(out.run.roomsVisited).toHaveLength(1);
    }
  });

  it('computes capacity from the storage cap, Forge, and review buff', () => {
    const meta = emptyMeta();
    expect(oilCapacity(meta, false)).toBe(OIL_STORAGE_CAP);
    expect(oilCapacity({ ...meta, forge: { oilcap: 2 } }, false)).toBe(OIL_STORAGE_CAP + 40);
    expect(oilCapacity({ ...meta, forge: { oilcap: 2 } }, true)).toBe(OIL_STORAGE_CAP + 40 + 25);
  });
});

describe('clock defense and catch-up', () => {
  it('grants no steps for a backwards or paused clock', () => {
    const last = 1_000_000;
    expect(elapsedSteps(last, last - 1)).toBe(0);
    expect(elapsedSteps(last, last)).toBe(0);
    expect(elapsedSteps(last, last + STEP_MS - 1)).toBe(0);
  });

  it('counts one step per 30 s and caps at 12 hours', () => {
    const last = 1_000_000;
    expect(elapsedSteps(last, last + STEP_MS)).toBe(1);
    expect(elapsedSteps(last, last + 2 * STEP_MS + 1000)).toBe(2);
    expect(elapsedSteps(last, last + CAP_MS + 5 * STEP_MS)).toBe(CAP_MS / STEP_MS);
  });

  it('bounds catch-up by elapsed time alone, since rooms are free', () => {
    const last = 1_000_000;
    const now = last + 100 * STEP_MS;
    expect(catchUpStepCount(last, now)).toBe(100);
    expect(catchUpStepCount(last, last)).toBe(0);
    expect(catchUpStepCount(last, now - 200 * STEP_MS)).toBe(0);
  });
});

describe('ledger hooks', () => {
  it('emits unique floor and clear keys with SPEC-fixed rewards on a clear', () => {
    const { run, meta, ledger } = playToEnd(1, 1, 50);
    expect(run.result).toBe('cleared');
    expect(meta.clearedHollows).toEqual([1]);
    expect(meta.runsCleared).toBe(1);
    expect(meta.lastClearDate[1]).toBe(TODAY);
    const keys = ledger.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (let f = 1; f <= 6; f++) {
      const entry = ledger.find((e) => e.key === `delve:floor:d1-1-1:${f}`);
      expect(entry).toMatchObject({ type: 'delve:floor', xp: 10, sparks: 1 });
    }
    const clear = ledger.find((e) => e.key === `delve:clear:d1-1-1`);
    expect(clear).toMatchObject({ type: 'delve:clear', xp: 60, sparks: 10 });
    // The daily refinement cap clamps what a single clear banks.
    expect(meta.embers).toBe(50);
    expect(meta.embersToday).toBe(50);
    expect(run.embersEarned).toBeGreaterThanOrEqual(70);
  });

  it('replays the same step keys exactly once (no double claims)', () => {
    const meta = emptyMeta();
    const run = newRun(9, 1, 4, meta);
    const ctx = mkCtx(meta, { oil: 999 });
    const a = applySteps(run, ctx, 40);
    const b = applySteps(run, ctx, 40);
    expect(a.ledger.map((e) => e.key)).toEqual(b.ledger.map((e) => e.key));
    expect(new Set(a.ledger.map((e) => e.key)).size).toBe(a.ledger.length);
  });
});

describe('Autopilot', () => {
  it('makes deterministic, explained choices', () => {
    for (const seed of [0, 5, 42, 77]) {
      const { run } = playToEnd(seed, 1, 6);
      const choices = run.log.filter((l) => l.type === 'choice');
      expect(choices.length).toBeGreaterThan(0);
      for (const c of choices) expect(c.text.includes('Autopilot:')).toBe(true);
    }
  });

  it('picks the first offered boon matching the priority tag', () => {
    const offer = [
      boonById('guard-ironhide')!,
      boonById('fury-sharpquill')!,
      boonById('fortune-luckyclover')!,
    ];
    const pick = autopilotBoon(
      { ...POLICY, tagPriority: ['fortune', 'fury', 'guard', 'vigor', 'thrift'] },
      offer,
    );
    expect(pick.boon.id).toBe('fortune-luckyclover');
    expect(pick.reason).toContain('fortune');
    expect(offer).toContain(pick.boon);
  });

  it('falls back to highest rarity and says so', () => {
    const offer = [boonById('guard-ironhide')!, boonById('fury-sharpquill')!];
    const pick = autopilotBoon({ ...POLICY, tagPriority: ['thrift', 'vigor', 'fortune'] }, offer);
    expect(offer).toContain(pick.boon);
    expect(pick.reason).toContain('highest rarity');
  });

  it('routes forks by policy and avoids danger at low HP', () => {
    const base = newRun(5, 1, 3, emptyMeta());
    const rooms: RoomDef[] = [
      { id: 'e', kind: 'elite', enemies: ['thornheart'], optionSeed: 0 },
      { id: 'r', kind: 'rest', enemies: [], optionSeed: 0 },
      { id: 't', kind: 'treasure', enemies: [], optionSeed: 0 },
    ];
    const safe = autopilotFork(base, { ...POLICY, route: 'safe' }, rooms);
    expect(safe.room.id).toBe('r');
    expect(safe.reason).toContain('safe');
    const greedy = autopilotFork(base, { ...POLICY, route: 'greedy' }, [rooms[1]!, rooms[0]!]);
    expect(greedy.room.id).toBe('e');
    expect(greedy.reason).toContain('greedy');
    const balanced = autopilotFork(base, POLICY, rooms);
    expect(rooms.map((r) => r.id)).toContain(balanced.room.id);
    expect(balanced.reason).toContain('balanced');
    // Low HP: balanced seeks rest first, then avoids elites.
    const low = { ...base, unit: { ...base.unit, hp: 10 } };
    const seek = autopilotFork(low, POLICY, rooms);
    expect(seek.room.id).toBe('r');
    expect(seek.reason).toContain('HP at');
    const mid = { ...base, unit: { ...base.unit, hp: 30 } };
    const avoid = autopilotFork(mid, POLICY, [rooms[0]!, rooms[2]!]);
    expect(avoid.room.id).toBe('t');
    expect(avoid.reason).toContain('avoiding elites');
    // Above 65% HP the balanced route is willing to gamble on an elite.
    const fresh = { ...base, unit: { ...base.unit, hp: 55 } };
    const picks = new Set<string>();
    for (let i = 0; i < 20; i++)
      picks.add(autopilotFork({ ...fresh, stepIndex: i }, POLICY, [rooms[0]!, rooms[2]!]).room.id);
    expect(picks.has('e')).toBe(true);
    // Between 35% and 65% HP it still avoids elites.
    const wary = { ...base, unit: { ...base.unit, hp: 45 } };
    const avoid2 = autopilotFork(wary, POLICY, [rooms[0]!, rooms[2]!]);
    expect(avoid2.room.id).toBe('t');
    expect(avoid2.reason).toContain('avoiding elites');
  });

  it('picks event options by route with reasons', () => {
    const base = newRun(5, 1, 3, emptyMeta());
    const options = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];
    const safe = autopilotEvent(base, { ...POLICY, route: 'safe' }, { options });
    expect(safe.optionId).toBe('a');
    expect(safe.reason).toContain('A');
    const greedy = autopilotEvent(base, { ...POLICY, route: 'greedy' }, { options });
    expect(greedy.optionId).toBe('c');
    const balanced = autopilotEvent(base, POLICY, { options });
    expect(options.map((o) => o.id)).toContain(balanced.optionId);
    expect(balanced.reason).toContain('balanced');
  });
});

describe('camp mode choice flow', () => {
  it('stops at a fork and walks the chosen room next', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    let out = stepRun(newRun(11, 1, 3, meta), ctx);
    const row1 = out.run.floorPlan.rows[1]!;
    expect(row1.length).toBeGreaterThan(1);
    // The first skirmish may raise a boon offer; resolve it before the row-1 fork.
    let guard = 0;
    while (out.run.pendingChoice?.kind !== 'fork' && guard < 10) {
      guard += 1;
      if (out.run.pendingChoice) {
        out = resolveChoice(out.run, ctx, out.run.pendingChoice.options[0]!.id);
        continue;
      }
      out = stepRun(out.run, ctx);
    }
    expect(out.run.pendingChoice?.kind).toBe('fork');
    const pickId = out.run.pendingChoice!.options[0]!.id;
    const resolved = resolveChoice(out.run, ctx, pickId);
    expect(resolved.run.path[1]).toBe(0);
    expect(resolved.run.pendingChoice).toBeNull();
    const walked = stepRun(resolved.run, ctx);
    expect(walked.run.roomsVisited.at(-1)).toBe(pickId);
  });

  it('never steps while a choice is pending', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    const first = stepRun(singleRowRun('rest'), ctx);
    expect(first.run.pendingChoice?.kind).toBe('rest');
    const second = stepRun(first.run, ctx);
    expect(second.run).toEqual(first.run);
  });

  it('offers the shop and applies purchases', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    const entered = stepRun(singleRowRun('shop'), ctx);
    expect(entered.run.pendingChoice?.kind).toBe('shop');
    expect(entered.run.pendingChoice!.options).toHaveLength(5);
    const hurt = { ...entered.run, unit: { ...entered.run.unit, hp: 40 }, glint: 500 };
    const healed = resolveChoice(hurt, ctx, 'heal');
    expect(healed.run.unit.hp).toBe(62);
    expect(healed.run.glint).toBe(460);
  });

  it('offers events, filters unaffordable costs, and applies outcomes', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    // h1-toll (optionSeed 1): pay 20 Glint vs sneak (12 damage).
    const toll = stepRun(
      singleRowRun('event', {
        floorPlan: { floor: 1, rows: [[{ id: 'x', kind: 'event', enemies: [], optionSeed: 1 }]] },
      }),
      ctx,
    );
    expect(toll.run.pendingChoice?.kind).toBe('event');
    expect(toll.run.pendingChoice!.options).toHaveLength(1); // broke: only 'sneak'
    const sneaked = resolveChoice(toll.run, ctx, 'sneak');
    expect(sneaked.run.unit.hp).toBe(toll.run.unit.hp - 12);
    // h1-ember (optionSeed 3): feed → +6 Embers.
    const ember = stepRun(
      singleRowRun('event', {
        floorPlan: { floor: 1, rows: [[{ id: 'x', kind: 'event', enemies: [], optionSeed: 3 }]] },
      }),
      ctx,
    );
    const fed = resolveChoice(ember.run, ctx, 'feed');
    expect(fed.run.embersEarned).toBe(11); // 6 from the event + 5 floor reward
  });

  it('turns an event boon outcome into a follow-up boon choice', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    // h1-roots (optionSeed 0): 'burn' grants a boon.
    const entered = stepRun(singleRowRun('event'), ctx);
    const offered = resolveChoice(entered.run, ctx, 'burn');
    expect(offered.ended).toBe(false);
    expect(offered.run.pendingChoice?.kind).toBe('boon');
    const optionId = offered.run.pendingChoice!.options[0]!.id;
    const picked = resolveChoice(offered.run, ctx, optionId);
    expect(picked.run.boons).toEqual([optionId]);
    expect(picked.run.pendingChoice).toBeNull();
  });

  it('heals or retreats from a rest room', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    const hurt = singleRowRun('rest', {
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Warden',
        hp: 40,
        maxHp: 72,
        atk: 14,
        def: 5,
        spd: 8,
        luck: 5,
      },
    });
    const entered = stepRun(hurt, ctx);
    expect(entered.run.pendingChoice?.kind).toBe('rest');
    const rested = resolveChoice(entered.run, ctx, 'rest');
    expect(rested.run.unit.hp).toBe(69); // 40 + 40% of 72
    expect(rested.run.result).toBe('active');
  });
});

describe('ending runs and Ember banking', () => {
  it('banks 100% on retreat', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta, { policy: CAMP_POLICY });
    const run = singleRowRun('rest', { embersEarned: 40 });
    const entered = stepRun(run, ctx);
    const out = resolveChoice(entered.run, ctx, 'retreat');
    expect(out.ended).toBe(true);
    expect(out.run.result).toBe('retreated');
    expect(out.meta.embers).toBe(40);
    expect(out.meta.runsRetreated).toBe(1);
    expect(out.run.log.some((l) => l.text.includes('Retreat: 40 of 40'))).toBe(true);
  });

  it('banks 60% on faint and 70% with the Safe Box relic', () => {
    const weak = {
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Warden',
        hp: 1,
        maxHp: 72,
        atk: 1,
        def: 0,
        spd: 8,
        luck: 5,
      },
      embersEarned: 40,
    };
    const bossRoom = {
      floor: 1,
      rows: [[{ id: 'x', kind: 'skirmish' as const, enemies: ['thorncrown'], optionSeed: 0 }]],
    };
    const meta = emptyMeta();
    const fainted = stepRun(
      singleRowRun('skirmish', { ...weak, floorPlan: bossRoom }),
      mkCtx(meta),
    );
    expect(fainted.run.result).toBe('fainted');
    expect(fainted.meta.embers).toBe(24);
    expect(fainted.meta.runsFainted).toBe(1);
    expect(
      fainted.run.log.some((l) => l.text.includes('Faint: 24 of 24 Embers banked (60%)')),
    ).toBe(true);

    const meta2 = emptyMeta();
    const safebox = stepRun(
      singleRowRun('skirmish', { ...weak, relics: ['relic-safebox'], floorPlan: bossRoom }),
      mkCtx(meta2),
    );
    expect(safebox.meta.embers).toBe(28);
    expect(
      safebox.run.log.some((l) => l.text.includes('Faint: 28 of 28 Embers banked (70%)')),
    ).toBe(true);
  });

  it('clamps daily Ember refinement to the cap and resets per local day', () => {
    const base: DelveMeta = { ...emptyMeta(), embersDay: TODAY, embersToday: 45, embers: 45 };
    const ctx = mkCtx(base, { policy: CAMP_POLICY });
    const run = singleRowRun('rest', { embersEarned: 100 });
    const entered = stepRun(run, ctx);
    const out = resolveChoice(entered.run, ctx, 'retreat');
    expect(out.meta.embers).toBe(50);
    expect(out.run.log.some((l) => l.text.includes('Retreat: 5 of 100'))).toBe(true);

    const ctxNext = mkCtx({ ...base, embersDay: TOMORROW }, { policy: CAMP_POLICY });
    const outNext = resolveChoice(
      stepRun(singleRowRun('rest', { embersEarned: 100 }), ctxNext).run,
      ctxNext,
      'retreat',
    );
    expect(outNext.meta.embers).toBe(45 + 50);
  });

  it('pays a fatigued 25% floor reward on same-day re-clears', () => {
    const fresh = stepRun(singleRowRun('treasure'), mkCtx(emptyMeta()));
    expect(fresh.run.embersEarned).toBe(5); // floor 1 reward, no fatigue

    const sameDay: DelveMeta = { ...emptyMeta(), lastClearDate: { 1: TODAY } };
    const tired = stepRun(singleRowRun('treasure'), mkCtx(sameDay));
    expect(tired.run.embersEarned).toBe(1); // 25% of 5
  });
});

describe('boon slot cap', () => {
  it('never holds more than 8 boons across many runs', () => {
    for (const seed of [0, 1, 2, 3, 4, 6, 8, 13, 21, 55]) {
      const meta = emptyMeta();
      const run = newRun(seed, 1, 8, meta);
      applySteps(run, mkCtx(meta, { oil: 999 }), 500, (r) => {
        expect(r.boons.length).toBeLessThanOrEqual(8);
      });
    }
  });

  it('refuses shop boons at the cap without charging Glint', () => {
    const ids = [
      'guard-ironhide',
      'guard-rootshell',
      'guard-lanternbuckler',
      'guard-doorstop',
      'guard-secondledger',
      'guard-hollowward',
      'guard-copperplate',
      'guard-vaultdoor',
    ];
    const run: RunState = {
      ...newRun(1, 1, 3, emptyMeta()),
      boons: ids,
      glint: 1000,
      pendingChoice: { kind: 'shop', options: [], reason: 'Browse the shop.', stepIndex: 0 },
    };
    const out = resolveChoice(run, mkCtx(emptyMeta(), { policy: CAMP_POLICY }), 'boon');
    expect(out.run.glint).toBe(1000);
    expect(out.run.boons).toHaveLength(8);
  });
});

describe('budget signals integrity', () => {
  it('never mutates the signals snapshot, even when frozen', () => {
    const signals = Object.freeze({
      checkedInToday: true,
      envelopesWithinAllowance: 3,
      contributedToGoalLast7d: true,
      reviewedLast7d: true,
    });
    const meta = emptyMeta();
    const run = newRun(3, 1, 6, meta);
    const before = { ...signals };
    const result = applySteps(run, mkCtx(meta, { oil: 999, signals }), 500);
    expect(result.run.result).not.toBe('active');
    expect({ ...signals }).toEqual(before);
    expect(NO_SIGNALS).toEqual({
      checkedInToday: false,
      envelopesWithinAllowance: 0,
      contributedToGoalLast7d: false,
      reviewedLast7d: false,
    });
  });
});
