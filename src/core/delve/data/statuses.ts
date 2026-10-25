/**
 * Status effect table (SPEC §6.11 B). Every status declares its duration, stacking rule, and
 * per-round effect; combat applies them uniformly. Statuses never persist past a combat (cleansing
 * rule: winning, drawing, or fainting clears all statuses). Stun has diminishing returns (a target
 * just unstunned resists the next stun 50%) and bosses resist stun 70% outright.
 */

export type StatusKind = 'dot' | 'hot' | 'skip' | 'absorb' | 'vuln' | 'spd';
export type StatusStacking = 'refresh' | 'stack' | 'add';

export interface StatusDef {
  id: string;
  name: string;
  kind: StatusKind;
  /** Rounds the status lasts (∞ = combat-long, e.g. shield until depleted). */
  duration: number;
  stacking: StatusStacking;
  /** Cap for stackable statuses. */
  maxStacks?: number;
  /** Flat absorb amount for shields. */
  amount?: number;
  /** Per-round effect for dots/hots and constant multipliers. */
  perRound?: { damage?: number; heal?: number; spdMult?: number; dmgTakenMult?: number };
}

export const STATUSES: readonly StatusDef[] = [
  {
    id: 'burn',
    name: 'Burn',
    kind: 'dot',
    duration: 3,
    stacking: 'refresh',
    perRound: { damage: 3 },
  },
  {
    id: 'poison',
    name: 'Poison',
    kind: 'dot',
    duration: 3,
    stacking: 'stack',
    maxStacks: 5,
    perRound: { damage: 2 },
  },
  {
    id: 'chill',
    name: 'Chill',
    kind: 'spd',
    duration: 2,
    stacking: 'refresh',
    perRound: { spdMult: 0.5 },
  },
  {
    id: 'stun',
    name: 'Stun',
    kind: 'skip',
    duration: 1,
    stacking: 'refresh',
  },
  {
    id: 'mark',
    name: 'Mark',
    kind: 'vuln',
    duration: 2,
    stacking: 'refresh',
    perRound: { dmgTakenMult: 1.25 },
  },
  {
    id: 'shield',
    name: 'Shield',
    kind: 'absorb',
    duration: Number.POSITIVE_INFINITY,
    stacking: 'add',
  },
  {
    id: 'regen',
    name: 'Regen',
    kind: 'hot',
    duration: 3,
    stacking: 'refresh',
    perRound: { heal: 4 },
  },
];

export function statusById(id: string): StatusDef | undefined {
  return STATUSES.find((s) => s.id === id);
}

/** Stun resistance: bosses resist 70%; a target unstunned last round resists 50%. */
export const STUN_BOSS_RESIST = 70;
export const STUN_RECENT_RESIST = 50;
/** Rounds of extra stun resistance after a stun wears off. */
export const STUN_RESIST_GRACE = 2;
