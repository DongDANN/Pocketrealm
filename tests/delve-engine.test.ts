import { describe, expect, it } from 'vitest';
import {
  BOONS,
  companionBase,
  emptyMeta,
  hollowUnlocked,
  newRun,
  oilCapacity,
  resolveChoice,
  stepRun,
  type DelveMeta,
  type RunState,
} from '../src/core/delve';
import { OIL_STORAGE_CAP } from '../src/core/rewards';
import {
  answerChoice,
  mkCtx,
  NO_SIGNALS,
  playOne,
  playToEnd,
  singleRowRun,
  startRun,
  TODAY,
  TOMORROW,
  type PlayState,
} from './delve-helpers';

/** Play one room to its end (a fatal room ends the run there). */
function playRoom(run: RunState, meta: DelveMeta = emptyMeta()): PlayState {
  let state: PlayState = { run, meta, pause: null, ledger: [], signals: NO_SIGNALS };
  let guard = 0;
  while (state.run.result === 'active' && guard < 200) {
    state = playOne(state);
    guard += 1;
  }
  return state;
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
    expect(run.orders).toEqual([]);
    expect(run.pendingTurn).toBeUndefined();
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

describe('determinism and the order trail', () => {
  it('replays a full hand-played run identically', () => {
    const a = playToEnd(42, 1, 6);
    const b = playToEnd(42, 1, 6);
    expect(a.run).toEqual(b.run);
    expect(a.meta).toEqual(b.meta);
    expect(a.ledger).toEqual(b.ledger);
  });

  it('waits for the player before a fight resolves and rebuilds it from its orders', () => {
    const meta = emptyMeta();
    const entered = stepRun(singleRowRun('skirmish'), mkCtx(meta));
    expect(entered.pause).toBeDefined();
    expect(entered.run.pendingTurn).toBe(true);
    // A step with no order only rebuilds the menu; nothing is fought and nothing is spent.
    const rebuilt = stepRun(entered.run, mkCtx(meta));
    expect(rebuilt.pause!.state).toEqual(entered.pause!.state);
    expect(rebuilt.pause!.orders).toEqual([]);
    expect(rebuilt.run.orders).toEqual([]);
    expect(rebuilt.run.pendingTurn).toBe(true);
  });

  it('appends every order to the trail, one round each', () => {
    const state = startRun(11, 1, 3, NO_SIGNALS);
    let paused = playOne({ ...state, run: singleRowRun('skirmish') });
    expect(paused.pause).not.toBeNull();
    const first = paused.run.orders.length;
    paused = playOne(paused);
    const grown = paused.run.orders.length;
    expect(grown).toBe(first + 1);
    expect(paused.run.orders.slice(0, first)).toEqual(paused.pause?.orders.slice(0, first) ?? []);
  });
});

describe('room entry', () => {
  it('enters one room per step and writes nothing to the wallet', () => {
    const meta = emptyMeta();
    const run = newRun(1, 1, 4, meta);
    const out = stepRun(run, mkCtx(meta));
    expect(out.run.stepIndex).toBe(1);
    expect(out.run.roomsVisited).toHaveLength(1);
    expect(out.meta).toEqual(meta);
  });

  it('computes oil capacity from the storage cap, Forge, and review buff', () => {
    const meta = emptyMeta();
    expect(oilCapacity(meta, false)).toBe(OIL_STORAGE_CAP);
    expect(oilCapacity({ ...meta, forge: { oilcap: 2 } }, false)).toBe(OIL_STORAGE_CAP + 40);
    expect(oilCapacity({ ...meta, forge: { oilcap: 2 } }, true)).toBe(OIL_STORAGE_CAP + 40 + 25);
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

  it('emits each step key exactly once on a full run', () => {
    const { ledger } = playToEnd(9, 1, 4);
    const keys = ledger.map((e) => e.key);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the player’s choices', () => {
  it('records the choice each room asked for', () => {
    const { run } = playToEnd(42, 1, 6);
    const texts = run.log.filter((l) => l.type === 'choice').map((l) => l.text);
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.some((t) => t.startsWith('Chose '))).toBe(true);
  });

  it('holds the boon picked from an offer', () => {
    // h1-roots (optionSeed 0): the 'burn' outcome raises a boon offer.
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
    const entered = stepRun(singleRowRun('event'), ctx);
    const offered = resolveChoice(entered.run, ctx, 'burn');
    expect(offered.run.pendingChoice?.kind).toBe('boon');
    const picked = resolveChoice(offered.run, ctx, offered.run.pendingChoice!.options[0]!.id);
    expect(picked.run.boons).toHaveLength(1);
    expect(picked.run.pendingChoice).toBeNull();
  });
});

describe('choice flow', () => {
  it('stops at a fork and walks the chosen room next', () => {
    let state = startRun(11, 1, 3);
    let guard = 0;
    while (
      state.run.pendingChoice?.kind !== 'fork' &&
      state.run.result === 'active' &&
      guard < 80
    ) {
      state = playOne(state);
      guard += 1;
    }
    expect(state.run.pendingChoice?.kind).toBe('fork');
    const pickId = state.run.pendingChoice!.options[0]!.id;
    const resolved = resolveChoice(state.run, mkCtx(state.meta), pickId);
    expect(resolved.run.path[1]).toBe(0);
    expect(resolved.run.pendingChoice).toBeNull();
    const walked = stepRun(resolved.run, mkCtx(resolved.meta));
    expect(walked.run.roomsVisited.at(-1)).toBe(pickId);
  });

  it('never steps while a choice is pending', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
    const first = stepRun(singleRowRun('rest'), ctx);
    expect(first.run.pendingChoice?.kind).toBe('rest');
    const second = stepRun(first.run, ctx);
    expect(second.run).toEqual(first.run);
  });

  it('offers the shop and applies purchases', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
    const entered = stepRun(singleRowRun('shop'), ctx);
    expect(entered.run.pendingChoice?.kind).toBe('shop');
    expect(entered.run.pendingChoice!.options).toHaveLength(5);
    const hurt = { ...entered.run, unit: { ...entered.run.unit, hp: 40 }, glint: 500 };
    const healed = resolveChoice(hurt, ctx, 'heal');
    expect(healed.run.unit.hp).toBe(62);
    expect(healed.run.glint).toBe(460);
  });

  it('keeps a boon it cannot sell off the shop shelf', () => {
    const ctx = mkCtx(emptyMeta());
    // Eight boons is the cap, so the wandering boon would be a button that does nothing: an offer the
    // run cannot take stays off the shelf, exactly as an unaffordable event cost does.
    const full = singleRowRun('shop', { glint: 500, boons: BOONS.slice(0, 8).map((b) => b.id) });
    const entered = stepRun(full, ctx);
    expect(entered.run.pendingChoice!.options.map((o) => o.id)).toEqual([
      'heal',
      'maxhp',
      'relic',
      'leave',
    ]);
  });

  it('offers events, filters unaffordable costs, and applies outcomes', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
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
    const ctx = mkCtx(meta);
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

  it('closes a boon event when the boon slots are already full', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
    // h1-roots (optionSeed 0) again, this time at the boon cap. No offer can open, but the room must
    // still let the player leave: an event choice that re-arms itself is a stall, not a refusal.
    const full = singleRowRun('event', { boons: BOONS.slice(0, 8).map((b) => b.id) });
    const entered = stepRun(full, ctx);
    expect(entered.run.pendingChoice?.kind).toBe('event');
    const burned = resolveChoice(entered.run, ctx, 'burn');
    expect(burned.run.pendingChoice).toBeNull();
    expect(burned.run.boons).toHaveLength(8);
  });

  it('heals or retreats from a rest room', () => {
    const meta = emptyMeta();
    const ctx = mkCtx(meta);
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
    const ctx = mkCtx(meta);
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
    const room = {
      floor: 1,
      rows: [[{ id: 'x', kind: 'skirmish' as const, enemies: ['thorncrown'], optionSeed: 0 }]],
    };
    const fainted = playRoom(singleRowRun('skirmish', { ...weak, floorPlan: room }), emptyMeta());
    expect(fainted.run.result).toBe('fainted');
    expect(fainted.meta.embers).toBe(24);
    expect(fainted.meta.runsFainted).toBe(1);
    expect(
      fainted.run.log.some((l) => l.text.includes('Faint: 24 of 24 Embers banked (60%)')),
    ).toBe(true);

    const safebox = playRoom(
      singleRowRun('skirmish', { ...weak, relics: ['relic-safebox'], floorPlan: room }),
      emptyMeta(),
    );
    expect(safebox.meta.embers).toBe(28);
    expect(
      safebox.run.log.some((l) => l.text.includes('Faint: 28 of 28 Embers banked (70%)')),
    ).toBe(true);
  });

  it('clamps daily Ember refinement to the cap and resets per local day', () => {
    const base: DelveMeta = { ...emptyMeta(), embersDay: TODAY, embersToday: 45, embers: 45 };
    const ctx = mkCtx(base);
    const run = singleRowRun('rest', { embersEarned: 100 });
    const entered = stepRun(run, ctx);
    const out = resolveChoice(entered.run, ctx, 'retreat');
    expect(out.meta.embers).toBe(50);
    expect(out.run.log.some((l) => l.text.includes('Retreat: 5 of 100'))).toBe(true);

    const ctxNext = mkCtx({ ...base, embersDay: TOMORROW });
    const outNext = resolveChoice(
      stepRun(singleRowRun('rest', { embersEarned: 100 }), ctxNext).run,
      ctxNext,
      'retreat',
    );
    expect(outNext.meta.embers).toBe(45 + 50);
  });

  it('pays a fatigued 25% floor reward on same-day re-clears', () => {
    // A treasure room can hold a boon offer between the loot and the floor reward, so the reward is
    // only on the run once the player has answered. One answer, then the same step advances.
    const cleared = (meta: DelveMeta) => {
      const ctx = mkCtx(meta);
      const entered = stepRun(singleRowRun('treasure'), ctx);
      return entered.run.pendingChoice ? answerChoice(entered.run, ctx).run : entered.run;
    };
    expect(cleared(emptyMeta()).embersEarned).toBe(5); // floor 1 reward, no fatigue

    const sameDay: DelveMeta = { ...emptyMeta(), lastClearDate: { 1: TODAY } };
    expect(cleared(sameDay).embersEarned).toBe(1); // 25% of 5
  });
});

describe('boon slot cap', () => {
  it('never holds more than 8 boons across many runs', () => {
    for (const seed of [0, 1, 2, 3, 4, 6, 8, 13, 21, 55]) {
      let state = startRun(seed, 1, 8);
      let guard = 0;
      while (state.run.result === 'active' && guard < 2000) {
        state = playOne(state);
        guard += 1;
        expect(state.run.boons.length).toBeLessThanOrEqual(8);
      }
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
    const out = resolveChoice(run, mkCtx(emptyMeta()), 'boon');
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
    const before = { ...signals };
    const result = playToEnd(3, 1, 6, signals);
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
