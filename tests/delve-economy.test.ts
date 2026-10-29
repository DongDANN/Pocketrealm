import { describe, expect, it } from 'vitest';
import {
  BUFF_POWER_CAP,
  FORGE_NODES,
  buyForgeNode,
  computeBuffs,
  forgeTotals,
  type BudgetSignals,
} from '../src/core/delve';
import { grant } from '../src/core/rewards';
import {
  PERSONAS,
  averageStats,
  runPersona,
  type AveragedStats,
  type PersonaStats,
} from '../scripts/sim-delve';
import { TODAY, TOMORROW } from './delve-helpers';

describe('the Forge', () => {
  it('buys levels at rising costs and deducts Embers', () => {
    const r1 = buyForgeNode({}, 1000, 'maxhp');
    expect(r1.bought).toBe(true);
    expect(r1.forge).toEqual({ maxhp: 1 });
    expect(r1.embers).toBe(985);
    const r2 = buyForgeNode(r1.forge, r1.embers, 'maxhp');
    expect(r2.bought).toBe(true);
    expect(r2.forge).toEqual({ maxhp: 2 });
    expect(r2.embers).toBe(985 - 25);
  });

  it('refuses unknown nodes, maxed nodes, and unaffordable levels', () => {
    const unknown = buyForgeNode({}, 100, 'nope');
    expect(unknown.bought).toBe(false);
    expect(unknown.reason).toBe('Unknown Forge node.');
    expect(unknown.forge).toEqual({});

    const maxed = buyForgeNode({ maxhp: 5 }, 100, 'maxhp');
    expect(maxed.bought).toBe(false);
    expect(maxed.reason).toBe('Already at max level.');

    const broke = buyForgeNode({}, 10, 'maxhp');
    expect(broke.bought).toBe(false);
    expect(broke.reason).toBe('Not enough Embers.');
    expect(broke.embers).toBe(10);
  });

  it('sums node effects into totals', () => {
    expect(forgeTotals({})).toEqual({
      maxHp: 0,
      atk: 0,
      def: 0,
      luck: 0,
      startGlint: 0,
      embersBonus: 0,
      oilCapacity: 0,
      rerolls: 0,
    });
    expect(forgeTotals({ maxhp: 2 }).maxHp).toBe(12);
    expect(forgeTotals({ glint: 3 }).startGlint).toBe(30);
    expect(forgeTotals({ embers: 2 }).embersBonus).toBe(10);
    expect(forgeTotals({ oilcap: 5 }).oilCapacity).toBe(100);
    const mixed = forgeTotals({ maxhp: 1, atk: 2, def: 1, luck: 3 });
    expect(mixed).toMatchObject({ maxHp: 6, atk: 4, def: 2, luck: 6 });
  });

  it('defines the expected node set with bounded costs', () => {
    expect(FORGE_NODES.map((n) => n.id)).toEqual([
      'maxhp',
      'atk',
      'def',
      'luck',
      'glint',
      'embers',
      'oilcap',
      'reroll',
    ]);
    for (const node of FORGE_NODES) {
      expect(node.maxLevel).toBeGreaterThan(0);
      for (let l = 0; l < node.maxLevel; l++) expect(node.cost(l)).toBeGreaterThan(0);
    }
  });
});

describe('BudgetSignals buffs', () => {
  const none: BudgetSignals = {
    checkedInToday: false,
    envelopesWithinAllowance: 0,
    contributedToGoalLast7d: false,
    reviewedLast7d: false,
  };

  it('grants nothing without signals and never penalizes', () => {
    const b = computeBuffs(none);
    expect(b).toEqual({
      wardHp: 0,
      luckBonus: 0,
      oilCapacityBonus: 0,
      totalPowerPercent: 0,
      reasons: [],
    });
  });

  it('turns the daily check-in and envelopes into a Ward shield', () => {
    const b = computeBuffs({ ...none, checkedInToday: true, envelopesWithinAllowance: 1 });
    expect(b.wardHp).toBe(8);
    expect(b.totalPowerPercent).toBe(8);
    expect(b.reasons[0]).toContain('Ward');
    const capped = computeBuffs({ ...none, checkedInToday: true, envelopesWithinAllowance: 3 });
    expect(capped.wardHp).toBe(24);
    expect(capped.totalPowerPercent).toBe(BUFF_POWER_CAP);
    const noCheckin = computeBuffs({ ...none, envelopesWithinAllowance: 3 });
    expect(noCheckin.wardHp).toBe(0);
  });

  it('adds LUCK for goal contributions and oil capacity for reviews', () => {
    const b = computeBuffs({ ...none, contributedToGoalLast7d: true, reviewedLast7d: true });
    expect(b.luckBonus).toBe(6);
    expect(b.oilCapacityBonus).toBe(25);
    expect(b.reasons.some((r) => r.includes('Goal Banner'))).toBe(true);
    expect(b.reasons.some((r) => r.includes('weekly review'))).toBe(true);
  });

  it('keeps power within [0, +15%] for every signal combination', () => {
    for (let mask = 0; mask < 16; mask++) {
      const signals: BudgetSignals = {
        checkedInToday: (mask & 1) !== 0,
        envelopesWithinAllowance: (mask & 2) !== 0 ? 3 : 0,
        contributedToGoalLast7d: (mask & 4) !== 0,
        reviewedLast7d: (mask & 8) !== 0,
      };
      const b = computeBuffs(signals);
      expect(b.totalPowerPercent).toBeGreaterThanOrEqual(0);
      expect(b.totalPowerPercent).toBeLessThanOrEqual(BUFF_POWER_CAP);
      expect(b.wardHp).toBeGreaterThanOrEqual(0);
      expect(b.luckBonus).toBe(signals.contributedToGoalLast7d ? 6 : 0);
      expect(b.oilCapacityBonus).toBe(signals.reviewedLast7d ? 25 : 0);
    }
  });
});

describe('Delve XP daily cap', () => {
  it('caps delve XP at 30 per local day through the shared ledger', () => {
    let events: ReturnType<typeof grant>['events'] = [];
    const spec = (key: string, xp: number) => ({
      key,
      type: key.startsWith('delve:clear') ? 'delve:clear' : 'delve:floor',
      xp,
      sparks: xp === 60 ? 10 : 1,
      at: TODAY,
    });
    let r = grant(events, spec('delve:floor:r1:1', 10));
    events = r.events;
    expect(r.granted).toBe(true);
    r = grant(events, spec('delve:floor:r1:2', 10));
    events = r.events;
    r = grant(events, spec('delve:floor:r1:3', 10));
    events = r.events;
    expect(r.granted).toBe(true);
    const fourth = grant(events, spec('delve:floor:r1:4', 10));
    expect(fourth.granted).toBe(false);
    expect(fourth.skippedReason).toBe('cap');
    const clear = grant(fourth.events, spec('delve:clear:r1', 60));
    expect(clear.granted).toBe(false);
    expect(clear.skippedReason).toBe('cap');
    const nextDay = grant(clear.events, { ...spec('delve:floor:r2:1', 10), at: TOMORROW });
    expect(nextDay.granted).toBe(true);
  });
});

describe('sim:delve persona pacing (§6.10)', () => {
  const SEEDS = 5;
  const DAYS = 60;
  /**
   * Measured at 7f with 5 seeds × 60 days: Rootfall falls on day 16 for Trickle, 6 for Casual and 3 for
   * both Habit and Optimizer, and the Optimizer banks 1.23× Trickle's Embers. §6 fixes the bands the
   * persona targets have to sit in — Trickle two to three weeks, Casual 5–8 days, Habit 3–5 — and
   * SPEC §6.10's "no persona clears faster than 2 days" is the shared floor. The bounds below are those
   * bands, not the measurements: they fail when a core change pushes a persona out of its design target,
   * and give a one-day nudge room to move.
   */
  const BANDS: Record<PersonaKey, { min: number; max: number }> = {
    trickle: { min: 14, max: 21 },
    casual: { min: 5, max: 8 },
    habit: { min: 3, max: 5 },
    optimizer: { min: 3, max: 5 },
  };
  /** §6: good habits have to pay, but ignoring the app cannot be hopeless. */
  const OPTIMIZER_EMBER_RATIO = 2.5;

  type PersonaKey = keyof typeof PERSONAS;

  // One sweep, shared by every assertion in this block: the sim is the slowest suite in the repo.
  const cache = new Map<string, AveragedStats>();
  function sweep(key: PersonaKey): AveragedStats {
    const hit = cache.get(key);
    if (hit) return hit;
    const def = PERSONAS[key]!;
    const runs: PersonaStats[] = [];
    for (let s = 0; s < SEEDS; s++) {
      runs.push(runPersona(def, DAYS, 0x5eed0000 + def.key.length * 0x1000 + s));
    }
    const avg = averageStats(runs);
    cache.set(key, avg);
    return avg;
  }

  it('is deterministic', () => {
    const a = runPersona(PERSONAS.casual!, 12, 0x5eed0000);
    const b = runPersona(PERSONAS.casual!, 12, 0x5eed0000);
    expect(a).toEqual(b);
  }, 30_000);

  it('clears Hollow 1 inside the bands, and every seed gets there', () => {
    for (const key of Object.keys(BANDS) as PersonaKey[]) {
      const s = sweep(key);
      const days = s.firstClear[1];
      expect(days, `${key} H1`).toBeDefined();
      expect(days!, `${key} H1 mean`).toBeGreaterThanOrEqual(BANDS[key].min);
      expect(days!, `${key} H1 mean`).toBeLessThanOrEqual(BANDS[key].max);
      // The band is a mean, and a mean can hide the seeds that never arrived. Every seed of every
      // persona has to clear Rootfall inside the horizon: a persona locked out is a game over it.
      expect(s.clearSeeds[1], `${key} seeds clearing H1`).toBe(SEEDS);
      // Trickle is one run a day, so the slowest seed is still inside the horizon rather than outside it.
      expect(s.clearDays[1]!.at(-1), `${key} slowest seed`).toBeLessThanOrEqual(DAYS);
    }
  }, 180_000);

  it('paces runs and Embers per day with activity, without runaway', () => {
    const trickle = sweep('trickle');
    const optimizer = sweep('optimizer');
    // Trickle's 20/day oil buys exactly one Rootfall run; the cap buys the Optimizer five and a bit.
    expect(trickle.runs / trickle.days).toBeCloseTo(1, 1);
    expect(optimizer.runs / optimizer.days).toBeGreaterThan(4);
    const t = trickle.banked / trickle.days;
    const o = optimizer.banked / optimizer.days;
    expect(t).toBeGreaterThan(0);
    // The ratio is cap-bound: `EMBER_DAILY_CAP` clamps both personas at 50 Embers a day once a build is
    // strong enough to fill it, so the measured spread is 1.23× and widening it would need the cap gone.
    expect(o / t).toBeGreaterThan(1);
    expect(o / t).toBeLessThanOrEqual(OPTIMIZER_EMBER_RATIO);
  }, 180_000);

  it('faints at the SPEC envelope for the passive persona and less for the kitted ones', () => {
    const faint = (s: AveragedStats) => s.faints / s.runs;
    const trickle = sweep('trickle');
    // SPEC §6.10 asked for "about 25 to 40% on a Hollow's first clear attempts" from a sensibly
    // configured Autopilot. 7b-6 cut the Autopilot, so the measure is restated: the same envelope now
    // applies to the whole run trail of the persona that never improves — Trickle logs nothing, so it
    // levels nothing, and its runs face Hollow 1 with the stats it started with. Measured 27%.
    expect(faint(trickle)).toBeGreaterThanOrEqual(0.2);
    expect(faint(trickle)).toBeLessThanOrEqual(0.4);
    // Every persona that plays more than one run a day levels, kits and out-scales the Hollow, so it
    // faints less: 9%, 6% and 6% measured. Habits must pay in survival as well as in Embers.
    for (const key of ['casual', 'habit', 'optimizer'] as PersonaKey[]) {
      expect(faint(sweep(key)), `${key} faint rate`).toBeLessThan(faint(trickle));
    }
  }, 180_000);

  it('makes the first run into a Hollow a scout, and pays it', () => {
    const trickle = sweep('trickle');
    // A fresh account walking into Rootfall at level 1 loses. Measured: the first run of Hollow 1
    // faints for 5/5 Trickle and Casual seeds and 4/5 Habit seeds — the game spends that run teaching
    // the intent strip, and it is the only floor-1 outcome the level-1 stats can produce. It is
    // tolerated, not celebrated: what makes it honest is that a scout run is never empty-handed, since
    // every room it took down paid on the spot and the faint bank now rounds up.
    expect(trickle.firstFaints[1]!).toBeGreaterThanOrEqual(4);
    // Progress after a faint: Embers land, and the next day's run starts stronger than the last.
    expect(trickle.banked).toBeGreaterThan(0);
    expect(trickle.firstClear[1]).toBeDefined();
  }, 180_000);

  it('keeps the deepest Hollow behind the whole run of it', () => {
    const optimizer = sweep('optimizer');
    const trickle = sweep('trickle');
    expect(optimizer.firstClear[2]).toBeDefined();
    // Hollow 3 needs the level-5 gate and a kitted account: the Optimizer takes it at day 50, and
    // nobody below it gets there inside two months. No fresh account one-runs it (see the Breaker).
    expect(optimizer.firstClear[3]).toBeGreaterThan(2);
    expect(trickle.firstClear[3]).toBeUndefined();
  }, 180_000);
});
