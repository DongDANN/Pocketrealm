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
import { PERSONAS, runPersona, type PersonaStats } from '../scripts/sim-delve';
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
  // Measured at 7b-4 with oil buying the run: Trickle gets one Rootfall run a day and first clears
  // H1 on day 27; the Optimizer (≈6 runs a day) banks 3.2× Trickle's Embers. DELVE_REDESIGN §6
  // states the destination bands (Trickle 2–3 weeks, Optimizer ≤2.5×) for the skill economy that
  // arrives in 7c; 7f re-tunes these interim bounds against it.
  const TRICKLE_H1 = { min: 18, max: 32 };
  const OPTIMIZER_EMBER_RATIO = 3.5;

  function average(key: keyof typeof PERSONAS): PersonaStats {
    const def = PERSONAS[key]!;
    const runs: PersonaStats[] = [];
    for (let s = 0; s < SEEDS; s++) {
      runs.push(runPersona(def, DAYS, 0x5eed0000 + def.key.length * 0x1000 + s));
    }
    const avg: PersonaStats = {
      days: DAYS,
      runs: 0,
      clears: 0,
      faints: 0,
      retreats: 0,
      embers: 0,
      totalFloors: 0,
      firstClear: {},
      firstAttempts: {},
    };
    for (const r of runs) {
      avg.runs += r.runs;
      avg.clears += r.clears;
      avg.faints += r.faints;
      avg.retreats += r.retreats;
      avg.embers += r.embers;
      avg.totalFloors += r.totalFloors;
    }
    for (const hollow of [1, 2, 3] as const) {
      const days_ = runs
        .map((r) => r.firstClear[hollow])
        .filter((d): d is number => d !== undefined);
      if (days_.length > 0)
        avg.firstClear[hollow] = Math.round(days_.reduce((a, b) => a + b, 0) / days_.length);
      const faints = runs.reduce((sum, r) => sum + (r.firstAttempts[hollow]?.faints ?? 0), 0);
      const attempts = runs.reduce((sum, r) => sum + (r.firstAttempts[hollow]?.attempts ?? 0), 0);
      if (attempts > 0) avg.firstAttempts[hollow] = { faints, attempts };
    }
    return avg;
  }

  it('is deterministic', () => {
    const a = runPersona(PERSONAS.casual!, 12, 0x5eed0000);
    const b = runPersona(PERSONAS.casual!, 12, 0x5eed0000);
    expect(a).toEqual(b);
  }, 30_000);

  it('clears Hollow 1 within the bands of the run-start economy', () => {
    const trickle = average('trickle');
    const casual = average('casual');
    const habit = average('habit');
    const optimizer = average('optimizer');
    const h1 = (s: PersonaStats) => s.firstClear[1];
    expect(h1(trickle), 'trickle H1').toBeGreaterThanOrEqual(TRICKLE_H1.min);
    expect(h1(trickle), 'trickle H1').toBeLessThanOrEqual(TRICKLE_H1.max);
    expect(h1(casual), 'casual H1').toBeGreaterThanOrEqual(4);
    expect(h1(casual), 'casual H1').toBeLessThanOrEqual(11);
    expect(h1(habit), 'habit H1').toBeGreaterThanOrEqual(2);
    expect(h1(habit), 'habit H1').toBeLessThanOrEqual(8);
    expect(h1(optimizer), 'optimizer H1').toBeGreaterThanOrEqual(2);
  }, 180_000);

  it('keeps Optimizer Embers per day within a bounded multiple of Trickle', () => {
    const trickle = average('trickle');
    const optimizer = average('optimizer');
    const t = trickle.embers / trickle.days;
    const o = optimizer.embers / optimizer.days;
    expect(t).toBeGreaterThan(0);
    expect(o / t).toBeLessThanOrEqual(OPTIMIZER_EMBER_RATIO);
  }, 180_000);

  it('keeps first-attempt faint rates near the 25-40% band and paces run counts', () => {
    const stats: Record<string, PersonaStats> = {};
    for (const key of Object.keys(PERSONAS)) stats[key] = average(key as keyof typeof PERSONAS);
    // SPEC §6.10: "faint rate ... about 25 to 40% on a Hollow's first clear attempts".
    // Tuned values with builds (5 seeds x 60 days): trickle 30%, casual 34%, habit 32%, optimizer 29%.
    // The band below allows the measured seed noise (±10 points on small attempt counts).
    const firstAttempt = (s: PersonaStats) => {
      const fa = s.firstAttempts[1];
      if (!fa || fa.attempts === 0) return 0;
      return (fa.faints / fa.attempts) * 100;
    };
    for (const key of Object.keys(stats)) {
      const s = stats[key]!;
      expect(firstAttempt(s), `${key} first-attempt faint rate`).toBeGreaterThanOrEqual(18);
      expect(firstAttempt(s), `${key} first-attempt faint rate`).toBeLessThanOrEqual(45);
      expect(s.clears, `${key} clears`).toBeGreaterThan(0);
    }
    expect(stats.optimizer!.runs).toBeGreaterThan(stats.trickle!.runs);
    expect(stats.optimizer!.firstClear[2]).toBeDefined();
  }, 180_000);
});
