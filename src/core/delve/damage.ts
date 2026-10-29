/**
 * The arithmetic behind every combat number, in one place.
 *
 * Combat used to fold this chain into `rollDamage` and `hitEnemy`, so a screen that wanted to explain
 * a number had to reimplement it and could not be trusted. Both now call these two functions, which
 * return the answer *and* the list of factors that produced it — the sum a panel shows is the sum that
 * was computed, including where the engine rounds.
 *
 * The stochastic part (variance and the crit roll) is an input, never a draw, so a preview can enumerate
 * it and a recap can replay the exact roll the engine happened to make.
 */

import type { RunLogEntry } from './types';

export type DamageTermOp = 'start' | 'mult' | 'add' | 'sub' | 'floor' | 'absorb';
export interface DamageTerm {
  label: string;
  op: DamageTermOp;
  value: number;
}

export interface DamageBreakdown {
  terms: DamageTerm[];
  /** Damage after DEF (and after the crit), before the status multipliers. */
  raw: number;
  /** Damage before the receiver's shield absorbs any of it. */
  damage: number;
  absorbed: number;
  /** HP the receiver actually loses. */
  dealt: number;
  hpAfter: number;
  crit: boolean;
  /** True when the hit would have been 0 or less and the engine floored it at 1. */
  clamped: boolean;
}

export interface AttackInput {
  /** Companion ATK after every modifier. */
  atk: number;
  /** Skill power multiplier; 1 for a basic attack. */
  power: number;
  /**
   * The Dust ladder's multiplier on this skill's own potency (§7 D.6): 1 at LV1, +8% per rung. Absent
   * reads as 1, because a hit record written before the ladder exists is still a valid input.
   */
  potency?: number;
  /** The target's DEF. */
  def: number;
  /** The seeded −1 / 0 / +1 roll. */
  variance: number;
  crit: boolean;
  critMult: number;
  /** `bonusIfBurning` from the skill, in percent as a fraction (0.4 = +40%). */
  burningBonus: number;
  targetBurning: boolean;
  /** Mark's damage-taken multiplier (1 when the target is unmarked). */
  markMult: number;
  /** Element multiplier against this target: 1.25 weakness, 0.75 resistance, 1 otherwise. */
  elementMult: number;
  /** Mastery level 0–10 for the species: +1% damage per level. */
  masteryLvl: number;
  /** Percent extra damage against elites (the Matchbook relic). */
  eliteBonus: number;
  targetElite: boolean;
  /** The target's remaining shield stacks. */
  shield: number;
  /** The target's HP before the hit. */
  hp: number;
  /**
   * A skill whose LV5 rung floors the roll (§7 D.6): the −1 of the seeded variance is spent, so the
   * hit never comes in under its likely number. Absent reads as no floor. The roll is still drawn —
   * only its contribution to the sum is refused — so the seeded stream a replay depends on is untouched.
   */
  varianceFloor?: boolean;
}

export interface IncomingInput {
  /** The enemy's ATK, already heat- and rage-scaled. */
  atk: number;
  /** Companion DEF. */
  def: number;
  variance: number;
  /** Damage reduction in percent (boons, tree nodes). */
  damageReduction: number;
  /** The companion's remaining shield pool. */
  shield: number;
  /** The companion's HP before the hit. */
  hp: number;
  /**
   * Mark's damage-taken multiplier when the companion is the marked one (a `marks-you` boss phase,
   * §8 E.2). Absent reads as 1, so every input written before the rule existed prices unchanged.
   */
  markMult?: number;
  /** A telegraphed boss mechanic: no variance, a flat +2, and a guard that halves it. */
  mechanic?: { multiplier: number; guard: boolean };
  /**
   * The player braced this round (§4 A.3). It halves the blow exactly as bracing against a mechanic
   * does — the same factor, so Guard has one price in the game rather than two.
   */
  guard?: boolean;
}

const mult = (value: number): number => Math.round(value * 100) / 100;

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${Math.round(n * 100) / 100}`;
}

/**
 * Resolve one player attack. The order of operations — power, then the skill's own potency from the
 * Dust ladder, then variance and DEF, then the crit, then burning, then mark and element on one
 * rounding, then mastery, then the elite bonus, then shield — is copied line for line from the combat
 * engine.
 */
export function attackBreakdown(input: AttackInput): DamageBreakdown {
  const terms: DamageTerm[] = [{ label: 'ATK', op: 'start', value: input.atk }];
  const power = input.power === 1 ? input.atk : Math.round(input.atk * input.power);
  if (input.power !== 1) terms.push({ label: 'Power', op: 'mult', value: input.power });

  let beforeDef = power;
  const potency = input.potency ?? 1;
  if (potency !== 1) {
    beforeDef = Math.round(beforeDef * potency);
    terms.push({ label: 'Potency', op: 'mult', value: mult(potency) });
  }
  // A floored skill spends the low end of the roll: the −1 is drawn and refused, so the sum it
  // produces is the likely number and the itemization never shows a Variance term going down.
  const variance = input.varianceFloor ? Math.max(0, input.variance) : input.variance;
  if (variance !== 0) {
    beforeDef += variance;
    terms.push({ label: 'Variance', op: 'add', value: variance });
  }
  beforeDef -= input.def;
  terms.push({ label: 'DEF', op: 'sub', value: input.def });

  const clamped = beforeDef < 1;
  if (clamped) terms.push({ label: 'Minimum', op: 'floor', value: 1 });
  let raw = Math.max(1, beforeDef);

  if (input.crit) {
    const hit = Math.round(raw * input.critMult);
    if (hit > raw) terms.push({ label: 'Critical', op: 'mult', value: input.critMult });
    raw = Math.max(raw, hit);
  }

  let damage = raw;
  if (input.burningBonus > 0 && input.targetBurning) {
    damage = Math.round(damage * (1 + input.burningBonus));
    terms.push({ label: 'Burning', op: 'mult', value: mult(1 + input.burningBonus) });
  }
  if (input.markMult !== 1 || input.elementMult !== 1) {
    damage = Math.round(damage * input.markMult * input.elementMult);
    if (input.markMult !== 1) terms.push({ label: 'Mark', op: 'mult', value: input.markMult });
    if (input.elementMult !== 1)
      terms.push({
        label: input.elementMult > 1 ? 'Weakness' : 'Resist',
        op: 'mult',
        value: input.elementMult,
      });
  }
  if (input.masteryLvl > 0) {
    damage = Math.round((damage * (100 + input.masteryLvl)) / 100);
    terms.push({ label: 'Mastery', op: 'mult', value: mult(1 + input.masteryLvl / 100) });
  }
  if (input.targetElite && input.eliteBonus > 0) {
    damage = Math.round((damage * (100 + input.eliteBonus)) / 100);
    terms.push({ label: 'Elite', op: 'mult', value: mult(1 + input.eliteBonus / 100) });
  }

  const absorbed = Math.min(input.shield, damage);
  if (absorbed > 0) terms.push({ label: 'Shield', op: 'absorb', value: absorbed });
  const dealt = damage - absorbed;

  return {
    terms,
    raw,
    damage,
    absorbed,
    dealt,
    hpAfter: Math.max(0, input.hp - dealt),
    crit: input.crit,
    clamped,
  };
}

/** Resolve one enemy hit on the companion, in the same style. */
export function incomingBreakdown(input: IncomingInput): DamageBreakdown {
  const terms: DamageTerm[] = [{ label: 'ATK', op: 'start', value: input.atk }];
  const m = input.mechanic;
  let value: number;

  if (m) {
    value = Math.round(input.atk * m.multiplier);
    terms.push({ label: 'Mechanic', op: 'mult', value: m.multiplier });
    value += 2;
    terms.push({ label: 'Telegraph', op: 'add', value: 2 });
  } else {
    value = input.atk;
    if (input.variance !== 0) {
      value += input.variance;
      terms.push({ label: 'Variance', op: 'add', value: input.variance });
    }
  }
  value -= input.def;
  terms.push({ label: 'DEF', op: 'sub', value: input.def });

  const clamped = value < 1;
  if (clamped) terms.push({ label: 'Minimum', op: 'floor', value: 1 });
  const raw = Math.max(1, value);

  let damage = raw;
  // One halving, whichever route raised the guard: a brace against a mechanic is not halved twice.
  if (m?.guard || input.guard) {
    damage = Math.round(damage / 2);
    terms.push({ label: 'Guard', op: 'mult', value: 0.5 });
  }
  const mark = input.markMult ?? 1;
  if (mark !== 1) {
    damage = Math.round(damage * mark);
    terms.push({ label: 'Mark', op: 'mult', value: mark });
  }
  if (input.damageReduction > 0) {
    damage = Math.round((damage * (100 - input.damageReduction)) / 100);
    terms.push({
      label: 'Reduction',
      op: 'mult',
      value: mult((100 - input.damageReduction) / 100),
    });
  }

  const absorbed = Math.min(input.shield, damage);
  if (absorbed > 0) terms.push({ label: 'Shield', op: 'absorb', value: absorbed });
  const dealt = damage - absorbed;

  return {
    terms,
    raw,
    damage,
    absorbed,
    dealt,
    hpAfter: Math.max(0, input.hp - dealt),
    crit: false,
    clamped,
  };
}

/** The span the engine can roll for an attack, over variance and the crit. */
export function attackRange(over: Partial<AttackInput> = {}): {
  min: number;
  max: number;
  likely: number;
} {
  const base: AttackInput = {
    atk: 10,
    power: 1,
    def: 0,
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
    hp: Number.MAX_SAFE_INTEGER,
    ...over,
  };
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const variance of [-1, 0, 1]) {
    for (const crit of [false, true]) {
      const dealt = attackBreakdown({ ...base, variance, crit }).dealt;
      if (dealt < min) min = dealt;
      if (dealt > max) max = dealt;
    }
  }
  return { min, max, likely: attackBreakdown(base).dealt };
}

/** One readable arithmetic line: every factor that changed the number, then the result. */
export function damageSumText(b: DamageBreakdown): string {
  const parts = b.terms.map((t) => {
    switch (t.op) {
      case 'start':
        return `${t.label} ${fmt(t.value)}`;
      case 'mult':
        return `×${fmt(t.value)} ${t.label}`;
      case 'add':
        return `${t.value > 0 ? '+' : '−'}${fmt(Math.abs(t.value))} ${t.label}`;
      case 'sub':
        return `−${fmt(t.value)} ${t.label}`;
      case 'absorb':
        return `−${fmt(t.value)} ${t.label}`;
      case 'floor':
        return `Minimum ${fmt(t.value)}`;
    }
  });
  return `${parts.join(' ')} = ${b.dealt}`;
}

/**
 * One landed hit, itemized. The engine writes this into the log entry it already emits, so the recap
 * and the text log read from the same record — and so `sum` can be re-derived from `input` at any time.
 */
export interface HitRecord {
  kind: 'hit';
  side: 'player' | 'enemy';
  round: number;
  actor: string;
  target: string;
  skillId?: string;
  input: AttackInput | IncomingInput;
  sum: DamageBreakdown;
}

/** The itemized record on a combat log entry, or null when the line was not a hit. */
export function hitOf(entry: RunLogEntry): HitRecord | null {
  const data = entry.data as HitRecord | undefined;
  return data && data.kind === 'hit' ? data : null;
}
