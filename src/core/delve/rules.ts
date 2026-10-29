/**
 * Floor rules (DELVE_REDESIGN §8 E.1): one seeded rule per floor, announced when the floor begins,
 * with the next floor's rule printed in the map header.
 *
 * The table is the whole vocabulary. Every rule is a sentence the player can read, an id the run
 * stores in `floorRule`, and one pure helper the engine calls at the exact place the rule talks
 * about — energy, rest healing, shop prices, drops, crits, Guard, elements, targeting, Mark, boons,
 * spawn stats. Nothing here reimplements a subsystem; the helpers only answer "how much" so the
 * engine and the menus that price it cannot disagree.
 *
 * Selection uses its own RNG stream, keyed off the same floor seed under a different salt. Drawing
 * the rule from the map generator's stream would shift every room after it, so a player who compares
 * two builds would also be comparing two different floors.
 *
 * One rule is adapted to the hand-played turn model. §8 E.1 says "only the first action each round
 * may target the leader"; a round is exactly one player order here, so the literal line would allow
 * every order. The rule keeps its intent — the leader is shielded by its escort — by refusing the
 * leader as a target while any other enemy stands. The printed line says exactly that.
 *
 * Boss phases use the sibling vocabulary at the bottom: each phase adds a `BossRuleId` instead of a
 * damage multiplier (§8 E.2). `marks-you` is applied by combat; the other three attach behaviour the
 * affix table already owns, so a boss rule and an enemy affix can never mean two different things.
 */

import { hashCombine, hashString, mulberry32 } from '../rng';
import { HOLLOW_FLOORS, floorSeed } from './map';
import type { BoonEffect } from './data/boons';
import type { HollowId } from './types';

export type FloorRuleId =
  | 'no-ward-boons'
  | 'skills-cost-two'
  | 'crits-heal'
  | 'leader-guarded'
  | 'no-rest-heal'
  | 'mark-one-round'
  | 'swift-weak'
  | 'market-flip'
  | 'guard-reflects'
  | 'elements-invert';

export interface FloorRuleDef {
  id: FloorRuleId;
  /** The header word: what the run prints beside the floor number. */
  label: string;
  /** The full sentence: what the rule does, in the player's terms. */
  detail: string;
}

export const FLOOR_RULES: readonly FloorRuleDef[] = [
  {
    id: 'no-ward-boons',
    label: 'No Ward boons',
    detail: 'no boon that raises a room Shield can be offered this floor',
  },
  {
    id: 'skills-cost-two',
    label: 'Skills cost 2',
    detail: 'every skill costs 2 energy this floor',
  },
  {
    id: 'crits-heal',
    label: 'Crits heal them',
    detail: 'a critical no longer doubles; the enemy drinks back half the blow',
  },
  {
    id: 'leader-guarded',
    label: 'Leader guarded',
    detail: 'the leader cannot be targeted while any other enemy stands',
  },
  {
    id: 'no-rest-heal',
    label: 'No rest healing',
    detail: 'Rest rooms do not heal this floor',
  },
  {
    id: 'mark-one-round',
    label: 'Mark fades fast',
    detail: 'Mark expires in one round this floor',
  },
  {
    id: 'swift-weak',
    label: 'Swift, not strong',
    detail: 'enemies gain +4 SPD and lose 2 ATK this floor',
  },
  {
    id: 'market-flip',
    label: 'Market flips',
    detail: 'shop prices are doubled and material drops are doubled',
  },
  {
    id: 'guard-reflects',
    label: 'Guard reflects',
    detail: 'a brace also reflects 25% of the damage it takes',
  },
  {
    id: 'elements-invert',
    label: 'Elements invert',
    detail: 'weakness and resistance trade places this floor',
  },
];

export function floorRuleById(id: string | null | undefined): FloorRuleDef | undefined {
  return FLOOR_RULES.find((rule) => rule.id === id);
}

/**
 * What a floor may draw. The first floor of a Hollow is where an under-kitted account walks in — a
 * fresh companion at level 1 with no Forge, no boons and no relics — so the two rules that take away
 * the resources it has no substitute for are held back: Rest is the only heal a first floor can offer,
 * and energy is the only thing a hand-played round spends. Both rules stay live from the second floor
 * on, where the run has had a room or two to earn a Shield, a relic or a cheaper skill.
 */
const FIRST_FLOOR_EXCLUDED: readonly FloorRuleId[] = ['no-rest-heal', 'skills-cost-two'];

/** The rule a floor carries, drawn from its own stream so floor layouts never move. */
export function floorRuleFor(userSeed: number, hollowId: HollowId, floor: number): FloorRuleId {
  const rng = mulberry32(
    hashCombine(floorSeed(userSeed, hollowId, floor), hashString('floor-rule')),
  );
  const pool =
    floor <= 1
      ? FLOOR_RULES.filter((rule) => !FIRST_FLOOR_EXCLUDED.includes(rule.id))
      : FLOOR_RULES.slice();
  return pool[rng.int(pool.length)]!.id;
}

/** The rule the floor after this one carries, or null when this is the Hollow's last floor. */
export function nextFloorRuleId(
  userSeed: number,
  hollowId: HollowId,
  floor: number,
): FloorRuleId | null {
  if (floor >= HOLLOW_FLOORS[hollowId]) return null;
  return floorRuleFor(userSeed, hollowId, floor + 1);
}

export function ruleLabel(id: string | null | undefined): string {
  return floorRuleById(id)?.label ?? 'No rule';
}

export function ruleDetail(id: string | null | undefined): string {
  return floorRuleById(id)?.detail ?? 'the floor adds no condition';
}

/** Energy a skill costs under the floor's rule. The card's own cost is the base. */
export function skillEnergyCost(
  rule: string | null | undefined,
  skill: { energyCost?: number },
): number {
  return rule === 'skills-cost-two' ? 2 : (skill.energyCost ?? 1);
}

/** Rest heal percentage under the floor's rule (the Night Light relic is folded into `base`). */
export function restHealPercent(rule: string | null | undefined, base: number): number {
  return rule === 'no-rest-heal' ? 0 : base;
}

/** Price multiplier for shop rows. */
export function shopPriceMultiplier(rule: string | null | undefined): number {
  return rule === 'market-flip' ? 2 : 1;
}

/** Material drop multiplier after a won fight. */
export function dropMultiplier(rule: string | null | undefined): number {
  return rule === 'market-flip' ? 2 : 1;
}

/** A Ward boon is one that raises a room Shield. The rule keeps every other boon offerable. */
export function boonAllowed(rule: string | null | undefined, boon: { fx: BoonEffect }): boolean {
  if (rule !== 'no-ward-boons') return true;
  return boon.fx.kind !== 'roomShield';
}

/**
 * Rounds a Mark lasts under the floor's rule. Mark is the only status the rule touches, and it
 * clamps at application so every route — a skill rung, a boss rule, a future source — pays the same
 * price rather than each caller remembering the rule.
 */
export function markRounds(rule: string | null | undefined, rounds: number): number {
  return rule === 'mark-one-round' ? Math.min(rounds, 1) : rounds;
}

/** Enemy stat shift applied once, where the roster is spawned. */
export function enemyStatShift(rule: string | null | undefined): { atk: number; spd: number } {
  return rule === 'swift-weak' ? { atk: -2, spd: 4 } : { atk: 0, spd: 0 };
}

/** True when a critical no longer multiplies and instead heals the target. */
export function critsHeal(rule: string | null | undefined): boolean {
  return rule === 'crits-heal';
}

/** The crit multiplier the fight and every preview use. A crit still happens; it just pays nothing. */
export function critMultiplier(rule: string | null | undefined, base: number): number {
  return rule === 'crits-heal' ? 1 : base;
}

/** HP a braced blow gives back to the enemy's side: 25% of the damage the companion took. */
export function guardReflect(rule: string | null | undefined, dealt: number): number {
  if (rule !== 'guard-reflects' || dealt <= 0) return 0;
  return Math.max(1, Math.round(dealt * 0.25));
}

/** True when the leader cannot be targeted while another enemy stands. */
export function leaderGuarded(rule: string | null | undefined): boolean {
  return rule === 'leader-guarded';
}

/** True when weakness and resistance trade places. */
export function elementsInverted(rule: string | null | undefined): boolean {
  return rule === 'elements-invert';
}

// --- Boss phase rules (§8 E.2) -------------------------------------------------------------

export type BossRuleId = 'marks-you' | 'strikes-twice' | 'shields-itself' | 'drains' | 'thorns';

export interface BossRuleDef {
  id: BossRuleId;
  /** What the studied phase line calls the rule. */
  label: string;
  /** The mechanical sentence, so the phase log can state it without borrowing combat code. */
  detail: string;
}

export const BOSS_RULES: Record<BossRuleId, BossRuleDef> = {
  'marks-you': {
    id: 'marks-you',
    label: 'Marks you',
    detail: 'every blow it lands leaves you Marked — you take 25% more until it fades',
  },
  'strikes-twice': {
    id: 'strikes-twice',
    label: 'Strikes twice',
    detail: 'every action it takes swings a second, lighter blow',
  },
  'shields-itself': {
    id: 'shields-itself',
    label: 'Shields itself',
    detail: 'it enters the phase behind 8 Shield that must be broken first',
  },
  drains: {
    id: 'drains',
    label: 'Drains',
    detail: 'it drinks back a share of every blow that lands on you',
  },
  thorns: {
    id: 'thorns',
    label: 'Thorns',
    detail: 'striking it cuts you for 2 in return',
  },
};

/**
 * Boss rules the affix table already implements. Attaching the affix is how the phase adds a rule
 * without adding a second copy of Frenzied/Vampiric/Thorned to the engine.
 */
export const BOSS_RULE_AFFIX: Partial<Record<BossRuleId, string>> = {
  'strikes-twice': 'frenzied',
  drains: 'vampiric',
  thorns: 'thorned',
};

/** Shield a `shields-itself` phase puts up on entry. */
export const BOSS_RULE_SHIELD = 8;
