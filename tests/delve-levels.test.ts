/**
 * Gate 7c-3 — Skill Dust, the level ladder, and what a level actually buys (DELVE_REDESIGN §7 D.6).
 *
 * Three rules are pinned here, because each is the kind that rots quietly when it only lives in prose:
 *
 * 1. **A level buys one thing.** A flat +8% on the skill's own potency per rung above LV1, applied
 *    inside `attackBreakdown`, so the itemized sum the player reads *is* the arithmetic that ran and
 *    LV1 prices exactly the number the Codex prints.
 * 2. **Dust has two sources and one sink.** A duplicate pays on the spot (pinned in
 *    `delve-capsules.test.ts`); a swung skill pays per ten *lifetime* uses when the run settles. The
 *    remainder carries, so a retreat keeps the nine swings that did not finish a ten — §2 invariant 5
 *    says ending a run is never a loss, and discarding unfinished progress would contradict it.
 * 3. **A rung cannot be bought for a skill the book does not hold.** Holding one comes from a capsule
 *    or from swinging it, which makes the ladder a collection progression rather than a shop.
 *
 * The last block is the anti-drift proof: over the five golden seeds, the dust and the lifetime totals
 * the book reports always equal that run's own player skill hits, and a room that never resolved pays
 * nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  attackBreakdown,
  attackInputFor,
  attackRange,
  buildById,
  builtinDecider,
  DUST_TO_LEVEL,
  dustToLevel,
  emptyMeta,
  hitOf,
  isLeveled,
  levelUpSkill,
  MAX_SKILL_LEVEL,
  newDailyRun,
  potencyMult,
  potencyPercent,
  POTENCY_PER_LEVEL,
  settleSkillUses,
  skillLevels,
  stepRun,
  turnMenu,
  USES_PER_DUST,
  usesFromLog,
  type AttackInput,
  type DelveMeta,
  type HitRecord,
  type RoomKind,
  type RunLogEntry,
  type RunState,
  type StepOutcome,
  type TurnOrder,
} from '../src/core/delve';
import {
  mkCtx,
  NO_SIGNALS,
  playOne,
  playToEnd,
  singleRowRun,
  TODAY,
  type PlayState,
} from './delve-helpers';

const BASTION = buildById('warden')!.skills.find((s) => s.id === 'warden-bastion')!;
const SHIELDBASH = buildById('warden')!.skills.find((s) => s.id === 'warden-shieldbash')!;

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), ...over };
}

function held(level: number, lifetime = 0): DelveMeta {
  return metaWith({ skills: { [BASTION.id]: { level, uses: lifetime % 10, lifetime } } });
}

/** A plain hit at LV1 pricing, so each test moves exactly one input. */
function input(over: Partial<AttackInput> = {}): AttackInput {
  return {
    atk: 20,
    power: 1.05,
    def: 6,
    variance: 0,
    crit: false,
    critMult: 1.5,
    burningBonus: 0,
    targetBurning: false,
    markMult: 1,
    elementMult: 1,
    masteryLvl: 0,
    eliteBonus: 0,
    targetElite: false,
    shield: 0,
    hp: 999,
    ...over,
  };
}

/** The one-row room from the helpers, with its roster replaced. */
function roomWith(kind: RoomKind, enemies: string[], over: Partial<RunState> = {}): RunState {
  const base = singleRowRun(kind, over);
  const room = base.floorPlan.rows[0]![0]!;
  return { ...base, floorPlan: { ...base.floorPlan, rows: [[{ ...room, enemies }]] } };
}

function ctxFor(levels: Record<string, number>) {
  return {
    atk: 20,
    critMult: 1.5,
    eliteBonus: 0,
    knownWeaknesses: [] as const,
    mastery: {},
    skillLevels: levels,
  };
}

/** A skirmish one blow cannot finish, so a paused room stays paused and the skill can come ready. */
function openRoom(meta: DelveMeta, id = 'levels-1'): { run: RunState; out: StepOutcome } {
  const run = roomWith('skirmish', ['tollbug', 'tollbug', 'tollbug', 'tollbug', 'tollbug'], {
    runId: id,
  });
  const out = stepRun(run, mkCtx(meta));
  expect(out.pause).toBeDefined();
  return { run, out };
}

/**
 * The first Bastion swing this room resolves, priced at whatever level the book holds.
 *
 * Energy is what gates the skill, so the hand feeds basic attacks until the round can afford it and
 * then gives the order — the same shape a player waits through, and the only way to show the engine,
 * not just the pure function, reads the ladder.
 */
function firstBastionRecord(meta: DelveMeta, runId: string): HitRecord {
  const opened = openRoom(meta, runId);
  let run = opened.run;
  let pause = opened.out.pause!;
  const basic: TurnOrder = { skillId: null, targetIndex: 0, guard: false };
  for (let round = 0; round < 12; round++) {
    const state = pause.state;
    const ready =
      (state.cooldowns[BASTION.id] ?? 0) === 0 && state.energy >= (BASTION.energyCost ?? 1);
    const order: TurnOrder = ready ? { skillId: BASTION.id, targetIndex: 0, guard: false } : basic;
    const out = stepRun(run, mkCtx(meta, { order }));
    run = out.run;
    const source = out.pause ? out.pause.log : run.log;
    const hit = source
      .map(hitOf)
      .find((h): h is HitRecord => !!h && h.side === 'player' && h.skillId === BASTION.id);
    if (hit) return hit;
    if (!out.pause) break;
    pause = out.pause;
  }
  throw new Error(`${runId}: Bastion never came ready`);
}

describe('the potency curve', () => {
  it('is one at LV1 and adds eight percent per rung above it', () => {
    expect(potencyMult(1)).toBe(1);
    expect(potencyMult(2)).toBeCloseTo(1.08, 10);
    expect(potencyMult(3)).toBeCloseTo(1.16, 10);
    expect(potencyMult(4)).toBeCloseTo(1.24, 10);
    expect(potencyMult(5)).toBeCloseTo(1.32, 10);
    expect([1, 2, 3, 4, 5].map(potencyPercent)).toEqual([0, 8, 16, 24, 32]);
  });

  it('reads a level the book should not hold as the rung the skill arrived at', () => {
    expect(potencyMult(undefined)).toBe(1);
    expect(potencyMult(0)).toBe(1);
    expect(potencyMult(-3)).toBe(1);
    expect(potencyMult(Number.NaN)).toBe(1);
    expect(potencyMult(MAX_SKILL_LEVEL + 4)).toBeCloseTo(potencyMult(MAX_SKILL_LEVEL), 10);
    expect(isLeveled(undefined)).toBe(false);
    expect(isLeveled(1)).toBe(false);
    expect(isLeveled(2)).toBe(true);
  });

  it('prices the ladder in flat steps, never compounded', () => {
    // §7 D.6 says a flat +8% per level: LV5 is four steps of eight, not 1.08 to the fourth power.
    expect(potencyMult(MAX_SKILL_LEVEL)).toBeCloseTo(1 + POTENCY_PER_LEVEL * 4, 10);
  });

  it('names the four rungs that are for sale', () => {
    expect(dustToLevel(1)).toBeNull();
    expect([dustToLevel(2), dustToLevel(3), dustToLevel(4), dustToLevel(5)]).toEqual([
      5, 15, 40, 90,
    ]);
    expect(dustToLevel(6)).toBeNull();
    expect(DUST_TO_LEVEL.slice(2, 6)).toEqual([5, 15, 40, 90]);
  });
});

describe('the damage sum carries the ladder', () => {
  it('multiplies the skill power before DEF and prints the term', () => {
    const sum = attackBreakdown(input({ potency: 1.16 }));
    expect(sum.damage).toBe(Math.max(1, Math.round(Math.round(20 * 1.05) * 1.16) - 6));
    expect(sum.terms.map((t) => t.label)).toEqual(['ATK', 'Power', 'Potency', 'DEF']);
    expect(sum.terms[2]).toMatchObject({ op: 'mult', value: 1.16 });
  });

  it('leaves an input with no potency priced exactly as before the ladder existed', () => {
    const plain = attackBreakdown(input());
    expect(attackBreakdown(input({ potency: 1 }))).toEqual(plain);
    expect(plain.terms.map((t) => t.label)).not.toContain('Potency');
  });

  it('rounds the rung once, in the place the sum says it rounds', () => {
    const terms = attackBreakdown(input({ potency: 1.32 })).terms.map((t) => t.label);
    expect(terms.indexOf('Potency')).toBeLessThan(terms.indexOf('DEF'));
    expect(attackBreakdown(input({ potency: 1.32, crit: true })).terms.map((t) => t.label)).toEqual(
      ['ATK', 'Power', 'Potency', 'DEF', 'Critical'],
    );
  });

  it('widens the range the screen prints along with the hit', () => {
    const lv1 = attackRange(input());
    const lv5 = attackRange(input({ potency: potencyMult(5) }));
    expect(lv5.likely).toBe(attackBreakdown(input({ potency: potencyMult(5) })).dealt);
    expect(lv5.likely).toBeGreaterThan(lv1.likely);
    expect(lv5.min).toBeGreaterThanOrEqual(lv1.min);
    expect(lv5.max).toBeGreaterThanOrEqual(lv1.max);
  });
});

describe('the engine reads the book when it prices a swing', () => {
  it('carries no potency for an LV1 skill', () => {
    const { out } = openRoom(emptyMeta());
    const hit = attackInputFor(out.pause!.enemies[0]!, BASTION, ctxFor(skillLevels(emptyMeta())), {
      variance: 0,
      crit: false,
    });
    expect(hit.potency).toBeUndefined();
    expect(hit.power).toBe(BASTION.power);
  });

  it('carries the rung for a levelled skill', () => {
    const { out } = openRoom(held(3));
    const hit = attackInputFor(out.pause!.enemies[0]!, BASTION, ctxFor(skillLevels(held(3))), {
      variance: 0,
      crit: false,
    });
    expect(hit.potency).toBeCloseTo(1.16, 10);
  });

  it('never potencies a basic attack, however high the skill beside it is', () => {
    const { out } = openRoom(held(5));
    const hit = attackInputFor(out.pause!.enemies[0]!, null, ctxFor(skillLevels(held(5))), {
      variance: 0,
      crit: false,
    });
    expect(hit.potency).toBeUndefined();
    expect(hit.power).toBe(1);
  });

  it('leaves a skill the book does not hold at its printed number', () => {
    const { out } = openRoom(emptyMeta());
    const hit = attackInputFor(out.pause!.enemies[0]!, BASTION, ctxFor({ [SHIELDBASH.id]: 5 }), {
      variance: 0,
      crit: false,
    });
    expect(hit.potency).toBeUndefined();
  });

  it('lists every held skill with its level for the menu and the fight alike', () => {
    const meta = metaWith({
      skills: { a: { level: 4, uses: 0, lifetime: 0 }, b: { level: 1, uses: 0, lifetime: 0 } },
    });
    expect(skillLevels(meta)).toEqual({ a: 4, b: 1 });
  });

  it('hits harder at LV5 than at LV1 for the same room and the same order', () => {
    // One runId, so both books watch the same variance and crit roll and only the rung differs.
    const lv1 = firstBastionRecord(emptyMeta(), 'ladder');
    const lv5 = firstBastionRecord(held(5), 'ladder');
    const base = lv1.input as AttackInput;
    expect(base.potency).toBeUndefined();
    expect((lv5.input as AttackInput).potency).toBeCloseTo(potencyMult(5), 10);
    expect(lv5.sum.terms.map((t) => t.label)).toContain('Potency');
    expect(lv5.sum).toEqual(attackBreakdown({ ...base, potency: potencyMult(5) }));
    expect(lv5.sum.dealt).toBeGreaterThan(lv1.sum.dealt);
  });

  it('prices that swing the same way in the menu the player reads', () => {
    const meta = held(5);
    const opened = openRoom(meta, 'ladder-menu');
    const menu = turnMenu(opened.run, meta, NO_SIGNALS, opened.out.pause!);
    const option = menu.skills.find((s) => s.id === BASTION.id);
    expect(option).toBeDefined();
    const priced = option!.targets[0]!;
    expect(priced.notes.some((n) => n.startsWith('LV5 +32'))).toBe(true);
    expect(priced.sum.terms.map((t) => t.label)).toContain('Potency');
  });
});

describe('buying a rung', () => {
  it('refuses a skill the companion does not hold', () => {
    const meta = metaWith({ dust: 90 });
    const out = levelUpSkill(meta, BASTION.id);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('does not hold');
    expect(out.meta).toBe(meta);
  });

  it('refuses to overspend and says what the rung costs', () => {
    const meta = held(1);
    const out = levelUpSkill(meta, BASTION.id);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('LV2 costs 5 Skill Dust');
    expect(out.reason).toContain('has 0');
    expect(out.meta).toBe(meta);
  });

  it('walks the whole ladder for the sum of its four rungs', () => {
    let meta = { ...held(1), dust: 150 };
    let spent = 0;
    for (const level of [2, 3, 4, 5]) {
      const cost = dustToLevel(level)!;
      const out = levelUpSkill(meta, BASTION.id);
      expect(out.ok, `LV${level}`).toBe(true);
      expect(out.reason).toContain(`LV${level}`);
      spent += cost;
      meta = out.meta;
      expect(meta.skills[BASTION.id]!.level).toBe(level);
      expect(meta.dust).toBe(150 - spent);
    }
    const beyond = levelUpSkill(meta, BASTION.id);
    expect(beyond.ok).toBe(false);
    expect(beyond.reason).toContain(`LV${MAX_SKILL_LEVEL}`);
    expect(beyond.meta).toBe(meta);
  });

  it('buys one skill without touching the rest of the book', () => {
    const meta = metaWith({
      dust: 20,
      skills: {
        [BASTION.id]: { level: 1, uses: 7, lifetime: 27 },
        [SHIELDBASH.id]: { level: 2, uses: 3, lifetime: 13 },
      },
    });
    const out = levelUpSkill(meta, BASTION.id);
    expect(out.ok).toBe(true);
    expect(out.meta.skills[BASTION.id]).toEqual({ level: 2, uses: 7, lifetime: 27 });
    expect(out.meta.skills[SHIELDBASH.id]).toEqual({ level: 2, uses: 3, lifetime: 13 });
    expect(out.meta.dust).toBe(15);
  });
});

describe('counting uses', () => {
  /** One real player skill hit, with the log entry that carried it. */
  function realHit(): { entry: RunLogEntry; record: HitRecord } {
    let state: PlayState = (() => {
      const opened = openRoom(emptyMeta(), 'real-hit');
      return {
        run: opened.run,
        meta: emptyMeta(),
        pause: opened.out.pause ?? null,
        ledger: [],
        signals: NO_SIGNALS,
      };
    })();
    let guard = 0;
    while (state.pause && guard < 40) {
      guard += 1;
      state = playOne(state);
    }
    const entry = state.run.log.find(
      (e) => !!hitOf(e) && hitOf(e)!.side === 'player' && !!hitOf(e)!.skillId,
    );
    expect(entry, 'the built-in decider should swing at least one skill').toBeDefined();
    return { entry: entry!, record: hitOf(entry!)! };
  }

  it('counts the swings that landed and nothing else', () => {
    const { entry, record } = realHit();
    const other = record.skillId === BASTION.id ? SHIELDBASH.id : BASTION.id;
    const data = (over: Partial<HitRecord>): Record<string, unknown> => ({
      ...record,
      ...over,
    });
    const run: RunState = {
      ...singleRowRun('skirmish'),
      log: [
        entry,
        entry,
        { ...entry, data: data({ side: 'enemy' }) },
        { ...entry, data: data({ skillId: undefined }) },
        { step: 1, type: 'info', text: 'A room line, not a hit.' },
        { ...entry, data: data({ skillId: other }) },
      ],
    };
    expect(usesFromLog(run)).toEqual({ [record.skillId!]: 2, [other]: 1 });
  });

  it('pays nothing for a room that never resolved', () => {
    const meta = emptyMeta();
    const opened = openRoom(meta, 'unresolved');
    const after = stepRun(
      opened.run,
      mkCtx(meta, { order: builtinDecider(opened.out.pause!.state) }),
    );
    // The room is still waiting, so its orders are not yet a room the run has walked.
    expect(after.run.pendingTurn).toBe(true);
    expect(after.pause).toBeDefined();
    expect(
      after.pause!.log.some((e) => !!hitOf(e) && hitOf(e)!.side === 'player'),
      'the round should have swung something',
    ).toBe(true);
    expect(usesFromLog(after.run)).toEqual({});
  });
});

describe('settling a run end', () => {
  it('keeps the unfinished ten instead of discarding it', () => {
    const first = settleSkillUses(emptyMeta(), { [BASTION.id]: 7 });
    expect(first.dustGained).toBe(0);
    expect(first.meta.skills[BASTION.id]).toEqual({ level: 1, uses: 7, lifetime: 7 });

    const second = settleSkillUses(first.meta, { [BASTION.id]: 3 });
    expect(second.dustGained).toBe(1);
    expect(second.meta.dust).toBe(1);
    expect(second.meta.skills[BASTION.id]).toEqual({ level: 1, uses: 0, lifetime: 10 });

    const third = settleSkillUses(second.meta, { [BASTION.id]: 13 });
    expect(third.dustGained).toBe(1);
    expect(third.meta.dust).toBe(2);
    expect(third.meta.skills[BASTION.id]).toEqual({ level: 1, uses: 3, lifetime: 23 });
  });

  it('writes the entry the first swing creates, at LV1', () => {
    const out = settleSkillUses(emptyMeta(), { [SHIELDBASH.id]: 4 });
    expect(out.dustGained).toBe(0);
    expect(out.meta.skills[SHIELDBASH.id]).toEqual({ level: 1, uses: 4, lifetime: 4 });
    expect(out.meta.dust).toBe(0);
  });

  it('pays every skill the run swung and never spends a level it was given', () => {
    const meta = metaWith({
      dust: 5,
      skills: { [BASTION.id]: { level: 4, uses: 8, lifetime: 28 } },
    });
    const out = settleSkillUses(meta, { [BASTION.id]: 6, [SHIELDBASH.id]: 11 });
    expect(out.dustGained).toBe(2);
    expect(out.meta.dust).toBe(7);
    expect(out.meta.skills[BASTION.id]).toEqual({ level: 4, uses: 4, lifetime: 34 });
    expect(out.meta.skills[SHIELDBASH.id]).toEqual({ level: 1, uses: 1, lifetime: 11 });
  });

  it('leaves a run that swung no skill entirely alone', () => {
    const meta = metaWith({ dust: 12 });
    const out = settleSkillUses(meta, {});
    expect(out.dustGained).toBe(0);
    expect(out.meta.dust).toBe(12);
    expect(out.meta.skills).toEqual({});
  });

  it('pays ten uses at a time and never pays one use twice', () => {
    let meta = emptyMeta();
    let paid = 0;
    for (let i = 0; i < 100; i++) {
      const out = settleSkillUses(meta, { [BASTION.id]: 1 });
      meta = out.meta;
      paid += out.dustGained;
      expect(meta.skills[BASTION.id]!.lifetime).toBe(i + 1);
      expect(meta.skills[BASTION.id]!.uses).toBe((i + 1) % USES_PER_DUST);
    }
    expect(paid).toBe(10);
    expect(meta.dust).toBe(10);
  });
});

describe('a finished run pays its dust', () => {
  /** The five golden scenarios, replayed to their ends by the headless hand. */
  const GOLDEN = [
    { seed: 12345, hollow: 1 as const, level: 5 },
    { seed: 0x9e3779b1, hollow: 2 as const, level: 6 },
    { seed: 777, hollow: 3 as const, level: 8 },
    { seed: 4242, hollow: 2 as const, level: 9 },
    { seed: 20261025, hollow: 3 as const, level: 12 },
  ];

  it('matches the swings in that run log, for every golden seed', () => {
    for (const c of GOLDEN) {
      const { run, meta } = playToEnd(c.seed, c.hollow, c.level);
      const uses = usesFromLog(run);
      const swung = Object.keys(uses);
      expect(swung.length, `seed ${c.seed} swung no skill at all`).toBeGreaterThan(0);
      let expected = 0;
      for (const id of swung) {
        const state = meta.skills[id];
        expect(state, `seed ${c.seed} left ${id} out of the book`).toBeDefined();
        expect(state!.lifetime, id).toBe(uses[id]);
        expect(state!.uses, id).toBe(uses[id] % USES_PER_DUST);
        expected += Math.floor(uses[id] / USES_PER_DUST);
      }
      expect(meta.dust, `seed ${c.seed}`).toBe(expected);
      const lines = run.log.filter((e) => e.text.startsWith('Skill Dust from use'));
      expect(lines.length, `seed ${c.seed} explained its dust ${lines.length} times`).toBe(
        expected > 0 ? 1 : 0,
      );
      if (expected > 0) expect(lines[0]!.text).toBe(`Skill Dust from use: +${expected}.`);
    }
  });

  it('levels nothing on its own, so a fresh book still starts every skill at LV1', () => {
    const { run, meta } = playToEnd(12345, 1, 5);
    expect(Object.values(meta.skills).length).toBeGreaterThan(0);
    for (const state of Object.values(meta.skills)) expect(state.level).toBe(1);
    expect(run.result).not.toBe('active');
  });

  it('keeps a Daily Challenge out of the ladder entirely', () => {
    const created = newDailyRun(TODAY, emptyMeta());
    expect('run' in created).toBe(true);
    if (!('run' in created)) return;
    let state: PlayState = {
      run: created.run,
      meta: created.meta,
      pause: null,
      ledger: [],
      signals: NO_SIGNALS,
    };
    let guard = 0;
    while (state.run.result === 'active' && guard < 2000) {
      guard += 1;
      state = playOne(state);
    }
    expect(state.run.result).not.toBe('active');
    expect(Object.keys(usesFromLog(state.run)).length).toBeGreaterThan(0);
    expect(state.meta.dust).toBe(0);
    expect(state.meta.skills).toEqual({});
  });
});
