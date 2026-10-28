/**
 * The built-in headless policy. The player-facing Habit Cards feature is gone (DELVE_REDESIGN §5):
 * there is no deck to edit and no screen that reaches this module. What remains is one fixed set of
 * rules that turns a `TurnState` into a `TurnOrder`, so the fuzz, golden and simulation suites can
 * play a run without a human and still go through the same decision seam the player uses.
 */

import type { TurnOrder, TurnState } from '../types';
import type { SkillDef } from './builds';
import type { Element } from './elements';

export type CardCondition =
  | { kind: 'hpBelow'; percent: number }
  | { kind: 'roundOne' }
  | { kind: 'markedTarget' }
  | { kind: 'targetHpBelow'; percent: number }
  | { kind: 'enemyWeakTo'; element: Element }
  | { kind: 'energyAbove'; amount: number }
  | { kind: 'always' };

export type CardAction =
  | { kind: 'prefer'; role: 'guard' | 'burst' | 'strongest' | 'offCooldown' }
  | { kind: 'element'; element: Element }
  | { kind: 'attackMarked' }
  | { kind: 'basic' };

export interface CardDef {
  id: string;
  name: string;
  condition: CardCondition;
  action: CardAction;
  effect: string;
}

/**
 * The one deck: brace when badly hurt, open with the strongest skill, otherwise keep a skill on
 * cooldown. Ordered by urgency — the first rule whose condition and action both hold wins.
 */
export const BUILTIN_DECK: readonly CardDef[] = [
  {
    id: 'rainy-day',
    name: 'Rainy Day',
    condition: { kind: 'hpBelow', percent: 35 },
    action: { kind: 'prefer', role: 'guard' },
    effect: 'If HP is below 35%, use the guard skill.',
  },
  {
    id: 'opening-move',
    name: 'Opening Move',
    condition: { kind: 'roundOne' },
    action: { kind: 'prefer', role: 'strongest' },
    effect: 'Use the strongest skill in round 1.',
  },
  {
    id: 'steady-hand',
    name: 'Steady Hand',
    condition: { kind: 'always' },
    action: { kind: 'prefer', role: 'offCooldown' },
    effect: 'Use any skill that is off cooldown.',
  },
];

/**
 * The state a card is evaluated against is `TurnState` in `../types` — the same snapshot the turn
 * loop hands the player, so the headless policy and the human are never priced from two shapes.
 */
export interface CardDecision {
  fired: CardDef | null;
  skipped: { name: string; reason: string }[];
}

/** null when the condition holds; otherwise a human-readable reason it was skipped. */
function conditionReason(c: CardCondition, s: TurnState): string | null {
  switch (c.kind) {
    case 'hpBelow': {
      const pct = Math.floor((100 * s.hp) / s.maxHp);
      return s.hp * 100 < s.maxHp * c.percent ? null : `HP ${pct}% ≥ ${c.percent}%`;
    }
    case 'roundOne':
      return s.round === 1 ? null : `round ${s.round}`;
    case 'markedTarget':
      return s.targets.some((t) => t.marked) ? null : 'no marked enemy';
    case 'targetHpBelow': {
      const t = s.targets[0];
      if (!t) return 'no target';
      const pct = Math.floor((100 * t.hp) / t.maxHp);
      return t.hp * 100 < t.maxHp * c.percent ? null : `target at ${pct}%`;
    }
    case 'enemyWeakTo': {
      const t = s.targets[0];
      return t && t.weakness === c.element ? null : `target not weak to ${c.element}`;
    }
    case 'energyAbove':
      return s.energy >= c.amount ? null : `energy ${s.energy} < ${c.amount}`;
    case 'always':
      return null;
  }
}

function readySkills(s: TurnState): SkillDef[] {
  return s.actives.filter(
    (sk) => (s.cooldowns[sk.id] ?? 0) <= 0 && s.energy >= (sk.energyCost ?? 1),
  );
}

function highestPower(list: readonly SkillDef[]): SkillDef | undefined {
  let best: SkillDef | undefined;
  for (const sk of list) if (!best || (sk.power ?? 1) > (best.power ?? 1)) best = sk;
  return best;
}

export interface ResolvedAction {
  skill?: SkillDef;
  attackMarked?: boolean;
  basic?: boolean;
  reason?: string;
}

/** Resolve a card action against combat state; availability failures carry a reason. */
export function resolveCardAction(action: CardAction, s: TurnState): ResolvedAction {
  const ready = readySkills(s);
  switch (action.kind) {
    case 'prefer': {
      if (action.role === 'offCooldown') {
        return ready.length > 0 ? { skill: ready[0] } : { reason: 'no ready skill' };
      }
      const pool =
        action.role === 'guard' || action.role === 'burst'
          ? ready.filter((sk) => sk.role === action.role)
          : ready;
      const pick = highestPower(pool);
      return pick ? { skill: pick } : { reason: 'no ready skill' };
    }
    case 'element': {
      const pick = highestPower(ready.filter((sk) => sk.element === action.element));
      return pick ? { skill: pick } : { reason: `no ${action.element} skill ready` };
    }
    case 'attackMarked':
      return s.targets.some((t) => t.marked)
        ? { attackMarked: true }
        : { reason: 'no marked target' };
    case 'basic':
      return { basic: true };
  }
}

/** Evaluate cards top to bottom; the first available card wins. */
export function evaluateCards(cards: readonly CardDef[], state: TurnState): CardDecision {
  const skipped: CardDecision['skipped'] = [];
  for (const c of cards) {
    const cond = conditionReason(c.condition, state);
    if (cond) {
      skipped.push({ name: c.name, reason: cond });
      continue;
    }
    const res = resolveCardAction(c.action, state);
    if (!res.skill && !res.attackMarked && !res.basic) {
      skipped.push({ name: c.name, reason: res.reason ?? 'unavailable' });
      continue;
    }
    return { fired: c, skipped };
  }
  return { fired: null, skipped };
}

/** The headless decider: the built-in deck's answer for this round, with no randomness of its own. */
export function builtinDecider(state: TurnState): TurnOrder {
  const decision = evaluateCards(BUILTIN_DECK, state);
  const action = decision.fired ? resolveCardAction(decision.fired.action, state) : { basic: true };
  const marked = state.targets.findIndex((t) => t.marked);
  return {
    skillId: action.skill?.id ?? null,
    targetIndex: action.attackMarked && marked >= 0 ? marked : 0,
    guard: false,
  };
}
