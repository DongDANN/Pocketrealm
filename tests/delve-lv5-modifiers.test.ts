/**
 * Gate 7c-3b — the top rung lands in a real fight (DELVE_REDESIGN §7 D.6).
 *
 * §7 D.6 says level 5 attaches a modifier, and `data/skills.ts` narrows that claim to six kinds. A
 * vocabulary nothing can break is not a contract, so each kind is proven twice here: once on the fold
 * (`fxAtLevel` and the two passive helpers, which are what both the engine and the menu read) and once
 * on a room the hand actually plays, where the rung leaves a line in the log or a number on the roster.
 *
 * Three readings worth stating up front, because each is a promise beyond "the number went up":
 *
 * 1. **Nothing attaches before the fifth rung.** Four rungs buy potency only, so a half-bought ladder is
 *    a shorter ladder rather than a different skill.
 * 2. **A build's own skill has no rung to attach.** It prices and resolves exactly as printed at every
 *    level, which keeps §2 invariant 5 honest: choosing Warden over a catalogue build cannot quietly
 *    change what one of its swings does.
 * 3. **The roll is still drawn.** `varianceFloor` refuses the −1's *contribution* and nothing else, and
 *    a spread costs no extra draw, so the seeded stream a stored run replays against is untouched —
 *    which is what §2 invariant 6 needs of a fight that now reaches a second enemy.
 */

import { describe, expect, it } from 'vitest';
import {
  attackBreakdown,
  attackInputFor,
  attackRange,
  BASE_MODIFIERS,
  BUILDS,
  emptyMeta,
  fxAtLevel,
  hitOf,
  openingDefence,
  passiveCritBurnRounds,
  passiveShieldAmount,
  skillLevels,
  spawnEnemies,
  stepRun,
  turnMenu,
  usesFromLog,
  type AttackContext,
  type AttackInput,
  type DelveMeta,
  type EnemyState,
  type HitRecord,
  type RunLogEntry,
  type RunState,
  type StepOutcome,
  type TurnMenu,
  type TurnOrder,
} from '../src/core/delve';
import type { SkillDef } from '../src/core/delve/data/builds';
import { SKILLS, level5FxOf, type CatalogueSkill } from '../src/core/delve/data/skills';
import { mkCtx, NEUTRAL_RULE, NO_SIGNALS, singleRowRun } from './delve-helpers';

const byId = (id: string): CatalogueSkill => SKILLS.find((s) => s.id === id)!;
/** One skill per rung kind, each cheap enough to come ready inside a five-tollbug room. */
const BARK = byId('skill-bark-wall'); // shieldPercent 0.2 → 0.35
const KNOT = byId('skill-knot-guard'); // Chill 2 rounds → 3
const ROPE = byId('skill-slack-rope'); // the Mark spreads to one other enemy
const FLICK = byId('skill-splinter-flick'); // +12 crit points → +20
const DICE = byId('skill-loaded-dice'); // the −1 never lands
const CELLAR = byId('skill-deep-cellar'); // 10 opening Shield → 16
const KIND = byId('skill-kind-blood'); // a critBurn passive's Burn: 2 rounds → 4
const BREATH = byId('skill-deep-breath'); // Regen, a status that mends rather than harms

/** One of the Warden's own swings: priced, resolved, and never given a rung. */
const BASTION = BUILDS.find((b) => b.id === 'warden')!.skills.find(
  (s) => s.id === 'warden-bastion',
)!;

/** The Warden's own actives, so the swing under test is a fourth slot rather than a substitution. */
const WARDEN_ACTIVES = BUILDS.find((b) => b.id === 'warden')!
  .skills.filter((s) => s.kind === 'active')
  .map((s) => s.id);

function held(level: number, ...ids: string[]): DelveMeta {
  const skills: DelveMeta['skills'] = {};
  for (const id of ids) skills[id] = { level, uses: 0, lifetime: 0 };
  return { ...emptyMeta(), skills };
}

/** A room one blow cannot finish, so the swing being read is the swing the hand ordered. */
function roomFor(over: Partial<RunState> = {}): RunState {
  const base = singleRowRun('skirmish', { floorRule: NEUTRAL_RULE, ...over });
  const cell = base.floorPlan.rows[0]![0]!;
  return {
    ...base,
    floorPlan: {
      ...base.floorPlan,
      rows: [[{ ...cell, enemies: ['tollbug', 'tollbug', 'tollbug', 'tollbug', 'tollbug'] }]],
    },
  };
}

/** The fight as it stood right after this skill's first swing. */
interface Swung {
  out: StepOutcome;
  hit: HitRecord;
  lines: string[];
  enemies: EnemyState[];
}

/**
 * Basic attacks fill the rounds before the energy arrives, so LV1 and LV5 of the same `runId` reach the
 * same round with the same draws and only the rung differs. `untilCrit` keeps swinging past the first
 * blow, because a rung that reads the crit roll has to be shown doing it.
 */
function firstSwing(skillId: string, level: number, runId: string, passiveId?: string): Swung {
  const meta = held(level, skillId, ...(passiveId ? [passiveId] : []));
  const run = roomFor({
    runId,
    moveset: [...WARDEN_ACTIVES, skillId],
    ...(passiveId ? { passiveId } : {}),
  });
  let out = stepRun(run, mkCtx(meta));
  for (let round = 0; round < 14; round++) {
    if (!out.pause) break;
    const menu = turnMenu(out.run, meta, NO_SIGNALS, out.pause);
    const ready = !!menu.skills.find((s) => s.id === skillId)?.ready;
    const order: TurnOrder = ready
      ? { skillId, targetIndex: 0, guard: false }
      : { skillId: null, targetIndex: 0, guard: false };
    out = stepRun(out.run, mkCtx(meta, { order }));
    if (!ready) continue;
    const log = out.pause ? out.pause.log : out.run.log;
    const hit = log
      .map(hitOf)
      .find((h): h is HitRecord => !!h && h.side === 'player' && h.skillId === skillId);
    if (hit) return { out, hit, lines: log.map((l) => l.text), enemies: out.pause?.enemies ?? [] };
  }
  throw new Error(`${skillId} never swung at LV${level} in ${runId}`);
}

/**
 * The same room played to its end, every line it printed. A rung that lengthens a status is a rung
 * measured in rounds, so its number only shows up once the room is over rather than at one swing.
 */
function fullRoom(skillId: string, level: number, runId: string): string[] {
  const meta = held(level, skillId);
  let out = stepRun(roomFor({ runId, moveset: [...WARDEN_ACTIVES, skillId] }), mkCtx(meta));
  const lines: string[] = [];
  for (let round = 0; round < 40 && out.pause; round++) {
    const menu = turnMenu(out.run, meta, NO_SIGNALS, out.pause);
    const ready = !!menu.skills.find((s) => s.id === skillId)?.ready;
    out = stepRun(
      out.run,
      mkCtx(meta, {
        order: ready
          ? { skillId, targetIndex: 0, guard: false }
          : { skillId: null, targetIndex: 0, guard: false },
      }),
    );
    const log = (out.pause ? out.pause.log : out.run.log).map((l) => l.text);
    for (const line of log.slice(lines.length)) lines.push(line);
  }
  return lines;
}

function critSwing(skillId: string, level: number, runId: string, passiveId: string): Swung {
  const meta = held(level, skillId, passiveId);
  const run = roomFor({
    runId,
    moveset: [...WARDEN_ACTIVES, skillId],
    passiveId,
  });
  let out = stepRun(run, mkCtx(meta));
  for (let round = 0; round < 30; round++) {
    if (!out.pause) break;
    const menu = turnMenu(out.run, meta, NO_SIGNALS, out.pause);
    const ready = !!menu.skills.find((s) => s.id === skillId)?.ready;
    const order: TurnOrder = ready
      ? { skillId, targetIndex: 0, guard: false }
      : { skillId: null, targetIndex: 0, guard: false };
    out = stepRun(out.run, mkCtx(meta, { order }));
    if (!ready) continue;
    const log = out.pause ? out.pause.log : out.run.log;
    const hit = log
      .map(hitOf)
      .find(
        (h): h is HitRecord => !!h && h.side === 'player' && h.skillId === skillId && h.sum.crit,
      );
    if (hit) return { out, hit, lines: log.map((l) => l.text), enemies: out.pause?.enemies ?? [] };
  }
  throw new Error(`${skillId} never crited at LV${level} in ${runId}`);
}

/** The Shield a swing raises is printed as its own log line, so the fraction is readable. */
function shieldGains(lines: string[]): number[] {
  return lines
    .filter((line) => /^You gain \d+ Shield\.$/.test(line))
    .map((line) => Number(/gain (\d+)/.exec(line)![1]));
}

function durationOf(enemy: EnemyState, statusId: string): number | undefined {
  return enemy.statuses.find((s) => s.id === statusId)?.duration;
}

const tollbug = (): EnemyState => spawnEnemies({ enemies: ['tollbug'] }, 1, 0)[0]!;

/** One priced swing, at whatever level the book holds. */
function ctxAt(level: number): AttackContext {
  return {
    atk: 14,
    critMult: 1.5,
    eliteBonus: 0,
    knownWeaknesses: [],
    mastery: {},
    skillLevels: level === 0 ? {} : { [DICE.id]: level },
  };
}

describe('the fold', () => {
  it('attaches nothing before the fifth rung, for every skill in the catalogue', () => {
    for (const skill of SKILLS) {
      for (const level of [1, 2, 3, 4]) {
        expect(fxAtLevel(skill, level), `${skill.id} at LV${level}`).toEqual(fxAtLevel(skill, 1));
        expect(passiveShieldAmount(skill, level), `${skill.id} shield at LV${level}`).toBe(
          passiveShieldAmount(skill, 1),
        );
        expect(passiveCritBurnRounds(skill, level), `${skill.id} burn at LV${level}`).toBe(
          passiveCritBurnRounds(skill, 1),
        );
      }
    }
  });

  it('moves exactly the field each of the six kinds names', () => {
    expect(fxAtLevel(BARK, 5)).toEqual({ ...fxAtLevel(BARK, 4), shieldPercent: 0.35 });
    expect(fxAtLevel(KNOT, 5)).toEqual({ ...fxAtLevel(KNOT, 4), statusRounds: 3 });
    expect(fxAtLevel(ROPE, 5)).toEqual({ ...fxAtLevel(ROPE, 4), spread: true });
    expect(fxAtLevel(FLICK, 5)).toEqual({ ...fxAtLevel(FLICK, 4), critPoints: 20 });
    expect(fxAtLevel(DICE, 5)).toEqual({ ...fxAtLevel(DICE, 4), varianceFloor: true });
    // A passive's rungs are read by the passive helpers, so `fxAtLevel` keeps its hands off them.
    expect(fxAtLevel(CELLAR, 5)).toEqual(fxAtLevel(CELLAR, 1));
    expect(passiveShieldAmount(CELLAR, 5)).toBe(16);
    expect(passiveCritBurnRounds(KIND, 5)).toBe(4);
    expect(fxAtLevel(KIND, 5).statusRounds).toBe(0);
  });

  it('reads a card that names no duration as the status table writes it', () => {
    const unnamed: SkillDef = {
      id: 'probe-card',
      name: 'Probe Card',
      kind: 'active',
      effect: 'Poisons, for however long the table says.',
      fx: { status: 'poison' },
    };
    expect(fxAtLevel(unnamed, 1).statusRounds).toBe(3);
    expect(
      fxAtLevel({ ...unnamed, fx: { status: 'poison', statusDuration: 5 } }, 1).statusRounds,
    ).toBe(5);
    // A rung on a swing that names no status has no rounds to lengthen, so it stays inert rather than
    // inventing a status — the catalogue test is what refuses that pairing in the data.
    expect(fxAtLevel({ ...unnamed, fx: { shieldPercent: 0.1 } }, 1).statusRounds).toBe(0);
  });

  it('leaves a build’s own skill at exactly its printed numbers, however the book is levelled', () => {
    for (const build of BUILDS) {
      for (const skill of build.skills) {
        expect(level5FxOf(skill.id), `${skill.id} is not a capsule skill`).toBeUndefined();
        expect(fxAtLevel(skill, 5), `${skill.id} at LV5`).toEqual(fxAtLevel(skill, 1));
        expect(fxAtLevel(skill, Number.NaN)).toEqual(fxAtLevel(skill, 1));
        expect(fxAtLevel(skill, 40)).toEqual(fxAtLevel(skill, 1));
      }
    }
    // Potency is still bought — it is the modifier that a build's skill cannot have.
    const bastion = BUILDS.find((b) => b.id === 'warden')!.skills.find(
      (s) => s.id === 'warden-bastion',
    )!;
    expect(fxAtLevel(bastion, 5).shieldPercent).toBe(fxAtLevel(bastion, 1).shieldPercent);
    expect(tollbug().def).toBeGreaterThan(0);
  });

  it('refuses the −1 of a roll it was still dealt, and prices the same blow without a floor', () => {
    const target = tollbug();
    const floored = attackInputFor(target, DICE, ctxAt(5), { variance: -1, crit: false });
    expect(floored.variance).toBe(-1);
    expect(floored.varianceFloor).toBe(true);
    expect(attackBreakdown(floored).dealt).toBe(attackBreakdown({ ...floored, variance: 0 }).dealt);
    const unflored = attackInputFor(target, DICE, ctxAt(0), { variance: -1, crit: false });
    expect(unflored.varianceFloor).toBeUndefined();
    expect(attackBreakdown(unflored).dealt).toBe(
      attackBreakdown({ ...unflored, variance: 0 }).dealt - 1,
    );
    // The span is read with the base at its printed 0, because `attackRange` walks the three variance
    // draws around whatever it is handed — a base already at −1 would price the downside twice.
    const flooredRange = attackRange({ ...floored, variance: 0 });
    expect(flooredRange.min).toBe(flooredRange.likely);
    const openRange = attackRange({ ...unflored, variance: 0 });
    expect(openRange.min).toBe(openRange.likely - 1);
  });
});

describe('the fight lands the rung it was sold', () => {
  it('raises the shield fraction the card states, in the line the log prints', () => {
    const lv1 = firstSwing(BARK.id, 1, 'lv5-shield');
    const lv5 = firstSwing(BARK.id, 5, 'lv5-shield');
    expect(shieldGains(lv1.lines)).toEqual([Math.round(lv1.hit.sum.dealt * 0.2)]);
    expect(shieldGains(lv5.lines)).toEqual([Math.round(lv5.hit.sum.dealt * 0.35)]);
    expect(lv5.hit.sum.dealt).toBeGreaterThan(lv1.hit.sum.dealt);
  });

  it('holds a status one rung longer on the enemy that received it', () => {
    const lv1 = firstSwing(KNOT.id, 1, 'lv5-rounds');
    const lv5 = firstSwing(KNOT.id, 5, 'lv5-rounds');
    expect(durationOf(lv1.enemies[0]!, 'chill')).toBe(2);
    expect(durationOf(lv5.enemies[0]!, 'chill')).toBe(3);
  });

  it('spreads the status to the next living enemy in roster order, and only at LV5', () => {
    const lv1 = firstSwing(ROPE.id, 1, 'lv5-spread');
    const lv5 = firstSwing(ROPE.id, 5, 'lv5-spread');
    expect(lv1.enemies.filter((e) => durationOf(e, 'mark') !== undefined)).toHaveLength(1);
    const marked = lv5.enemies.filter((e) => durationOf(e, 'mark') !== undefined);
    expect(marked).toHaveLength(2);
    expect(marked.map((e) => e.id)).toEqual([lv5.enemies[0]!.id, lv5.enemies[1]!.id]);
    expect(lv5.lines.filter((l) => l.endsWith('gains Mark.'))).toHaveLength(2);
  });

  it('weights the crit roll, so the same seeded swing crits at LV5 and not at LV1', () => {
    // The runId is the witness: both levels draw the same number, and only the threshold moves.
    const lv1 = firstSwing(FLICK.id, 1, 'lv5-crit-6');
    const lv5 = firstSwing(FLICK.id, 5, 'lv5-crit-6');
    expect(lv1.hit.sum.crit).toBe(false);
    expect(lv5.hit.sum.crit).toBe(true);
    // The itemization the player reads says which swing was weighted, in the terms it multiplies.
    expect(lv1.hit.sum.terms.map((t) => t.label)).not.toContain('Critical');
    expect(lv5.hit.sum.terms.map((t) => t.label)).toContain('Critical');
  });

  it('never comes up short of the number it priced', () => {
    const lv1 = firstSwing(DICE.id, 1, 'lv5-floor');
    const lv5 = firstSwing(DICE.id, 5, 'lv5-floor');
    // Both swung a drawn −1 (§2 invariant 6: the same stream), and only LV1 is allowed to spend it.
    expect((lv1.hit.input as AttackInput).variance).toBe(-1);
    expect((lv5.hit.input as AttackInput).variance).toBe(-1);
    expect((lv5.hit.input as AttackInput).varianceFloor).toBe(true);
    expect(lv1.hit.sum.terms.map((t) => t.label)).toContain('Variance');
    expect(lv5.hit.sum.terms.map((t) => t.label)).not.toContain('Variance');
    expect(lv5.hit.sum.dealt).toBe(
      attackBreakdown({ ...(lv5.hit.input as AttackInput), variance: 0 }).dealt,
    );
  });

  it('opens the fight behind the Shield the passive line states', () => {
    for (const [level, amount] of [
      [1, 10],
      [5, 16],
    ] as const) {
      const meta = held(level, CELLAR.id);
      const run = roomFor({ runId: 'lv5-opening', passiveId: CELLAR.id });
      const out = stepRun(run, mkCtx(meta));
      const lines = (out.pause ? out.pause.log : out.run.log).map((l) => l.text);
      expect(
        lines.filter((l) => l.startsWith(`${CELLAR.name} grants ${amount} Shield.`)),
      ).toHaveLength(1);
      expect(out.pause?.shield).toBe(amount);
      expect(openingDefence(run, BASE_MODIFIERS, skillLevels(meta)).shield).toBe(amount);
      expect(openingDefence(run, BASE_MODIFIERS).shield).toBe(10);
    }
  });

  it('lights a crit for the rounds the passive now states', () => {
    const lv1 = critSwing(DICE.id, 1, 'kbw-4', KIND.id);
    const lv5 = critSwing(DICE.id, 5, 'kbw-4', KIND.id);
    expect(lv1.hit.sum.crit).toBe(true);
    expect(lv5.hit.sum.crit).toBe(true);
    expect(durationOf(lv1.enemies[0]!, 'burn')).toBe(2);
    expect(durationOf(lv5.enemies[0]!, 'burn')).toBe(4);
  });

  it('mends the companion with a healing status instead of handing it to the target', () => {
    const lv1 = firstSwing(BREATH.id, 1, 'lv5-hot');
    const lv5 = firstSwing(BREATH.id, 5, 'lv5-hot');
    for (const swung of [lv1, lv5]) {
      expect(swung.lines.filter((l) => l === 'You gain Regen.')).toHaveLength(1);
      for (const enemy of swung.enemies) expect(durationOf(enemy, 'regen')).toBeUndefined();
    }
    // The rung is a round of mending, and a round of it is one more line: the same room mends thrice
    // where it mended twice, because the status now outlives the fight by one round.
    expect(
      fullRoom(BREATH.id, 1, 'lv5-hot').filter((l) => l === 'You regenerate 4 HP.'),
    ).toHaveLength(2);
    expect(
      fullRoom(BREATH.id, 5, 'lv5-hot').filter((l) => l === 'You regenerate 4 HP.'),
    ).toHaveLength(3);
  });
});

describe('the menu prices what the fight will do', () => {
  /** The round-one menu, before any order is given. */
  function menuAt(level: number, skillId: string, runId: string) {
    const meta = held(level, skillId);
    const run = roomFor({ runId, moveset: [...WARDEN_ACTIVES, skillId] });
    const out = stepRun(run, mkCtx(meta));
    return turnMenu(out.run, meta, NO_SIGNALS, out.pause!);
  }

  /** The same menu for a skill the build already owns, so its moveset needs no fourth slot. */
  function buildMenu(level: number, skillId: string, runId: string): TurnMenu {
    const meta = held(level, skillId);
    const out = stepRun(roomFor({ runId }), mkCtx(meta));
    return turnMenu(out.run, meta, NO_SIGNALS, out.pause!);
  }

  it('shows the floored swing as a range with no downside', () => {
    const lv1 = menuAt(1, DICE.id, 'lv5-menu').skills.find((s) => s.id === DICE.id)!;
    const lv5 = menuAt(5, DICE.id, 'lv5-menu').skills.find((s) => s.id === DICE.id)!;
    expect(lv1.targets[0]!.min).toBe(lv1.targets[0]!.likely - 1);
    expect(lv5.targets[0]!.min).toBe(lv5.targets[0]!.likely);
    expect(lv5.targets[0]!.sum.terms.map((t) => t.label)).toContain('Potency');
  });

  it('buys a build’s own skill its potency and no modifier', () => {
    const labels = (menu: TurnMenu, id: string): string[] =>
      menu.skills
        .find((s) => s.id === id)!
        .targets[0]!.sum.terms.map((t) => t.label)
        .filter((label) => label !== 'Potency');
    const lv1 = buildMenu(1, BASTION.id, 'lv5-menu-build');
    const lv5 = buildMenu(5, BASTION.id, 'lv5-menu-build');
    expect(labels(lv5, BASTION.id)).toEqual(labels(lv1, BASTION.id));
    // The −1 a floor rung would refuse is still in the range, because a build's skill has no rung.
    const priced = lv5.skills.find((s) => s.id === BASTION.id)!.targets[0]!;
    expect(priced.min).toBe(priced.likely - 1);
  });
});

describe('a rung survives the run it was bought for', () => {
  it('plays the same room to the same lines twice, spread included', () => {
    const first = firstSwing(ROPE.id, 5, 'lv5-replay');
    const second = firstSwing(ROPE.id, 5, 'lv5-replay');
    expect(second.lines).toEqual(first.lines);
    expect(second.hit).toEqual(first.hit);
  });

  it('carries the floor through storage, where a run is kept as JSON', () => {
    const swung = firstSwing(DICE.id, 5, 'lv5-storage');
    const entry: RunLogEntry = {
      step: 0,
      type: 'combat',
      text: 'You use Loaded Dice and hit Tollbug.',
      data: JSON.parse(JSON.stringify(swung.hit)),
    };
    const back = hitOf(entry)!;
    expect((back.input as AttackInput).varianceFloor).toBe(true);
    expect(back).toEqual(swung.hit);
  });

  it('counts a spread swing once, whatever number of enemies it left marked', () => {
    // §7 D.6 pays per use, not per victim: the rung adds a log line and a status, never a second swing.
    const swung = firstSwing(ROPE.id, 5, 'lv5-dust');
    const log = swung.out.pause?.log ?? swung.out.run.log;
    expect(log.map((l) => l.text).filter((t) => t.endsWith('gains Mark.'))).toHaveLength(2);
    expect(usesFromLog({ ...swung.out.run, log })).toEqual({ [ROPE.id]: 1 });
  });
});
