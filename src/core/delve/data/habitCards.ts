/**
 * Habit Cards (SPEC §6.11 C): a priority-based combat rules engine for Autopilot. Up to three
 * equipped cards are evaluated top to bottom; the first card whose condition is true AND whose
 * action is available (cooldown, energy, valid target) fires, otherwise the companion falls back
 * to a basic attack. The combat log records which card fired and why others were skipped.
 */

import type { HollowId, TurnState } from '../types';
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
  unlock:
    | { kind: 'always' }
    | { kind: 'level'; value: number }
    | { kind: 'hollowClear'; value: HollowId };
  effect: string;
}

export const CARDS: readonly CardDef[] = [
  {
    id: 'rainy-day',
    name: 'Rainy Day',
    condition: { kind: 'hpBelow', percent: 35 },
    action: { kind: 'prefer', role: 'guard' },
    unlock: { kind: 'always' },
    effect: 'If HP is below 35%, use the guard skill.',
  },
  {
    id: 'opening-move',
    name: 'Opening Move',
    condition: { kind: 'roundOne' },
    action: { kind: 'prefer', role: 'strongest' },
    unlock: { kind: 'always' },
    effect: 'Use the strongest skill in round 1.',
  },
  {
    id: 'mark-hunter',
    name: 'Mark Hunter',
    condition: { kind: 'markedTarget' },
    action: { kind: 'attackMarked' },
    unlock: { kind: 'level', value: 5 },
    effect: 'Attack marked enemies first.',
  },
  {
    id: 'steady-hand',
    name: 'Steady Hand',
    condition: { kind: 'always' },
    action: { kind: 'prefer', role: 'offCooldown' },
    unlock: { kind: 'always' },
    effect: 'Use any skill that is off cooldown.',
  },
  {
    id: 'finisher',
    name: 'Finisher',
    condition: { kind: 'targetHpBelow', percent: 30 },
    action: { kind: 'prefer', role: 'burst' },
    unlock: { kind: 'level', value: 3 },
    effect: 'Use a burst skill when the target is below 30% HP.',
  },
  {
    id: 'shield-up',
    name: 'Shield Up',
    condition: { kind: 'hpBelow', percent: 60 },
    action: { kind: 'prefer', role: 'guard' },
    unlock: { kind: 'level', value: 3 },
    effect: 'If HP is below 60%, use the guard skill.',
  },
  {
    id: 'cool-off',
    name: 'Cool Off',
    condition: { kind: 'energyAbove', amount: 5 },
    action: { kind: 'prefer', role: 'strongest' },
    unlock: { kind: 'level', value: 5 },
    effect: 'At 5 or more energy, spend it on the strongest skill.',
  },
  {
    id: 'ember-first',
    name: 'Ember First',
    condition: { kind: 'enemyWeakTo', element: 'ember' },
    action: { kind: 'element', element: 'ember' },
    unlock: { kind: 'hollowClear', value: 1 },
    effect: 'Use an Ember skill against enemies weak to Ember.',
  },
  {
    id: 'frost-first',
    name: 'Frost First',
    condition: { kind: 'enemyWeakTo', element: 'frost' },
    action: { kind: 'element', element: 'frost' },
    unlock: { kind: 'hollowClear', value: 2 },
    effect: 'Use a Frost skill against enemies weak to Frost.',
  },
  {
    id: 'basic-discipline',
    name: 'Basic Discipline',
    condition: { kind: 'always' },
    action: { kind: 'basic' },
    unlock: { kind: 'always' },
    effect: 'Always use a basic attack.',
  },
];

export function cardById(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}

export function cardUnlocked(
  id: string,
  meta: { clearedHollows: readonly HollowId[] },
  companionLevel: number,
): boolean {
  const c = cardById(id);
  if (!c) return false;
  switch (c.unlock.kind) {
    case 'always':
      return true;
    case 'level':
      return companionLevel >= c.unlock.value;
    case 'hollowClear':
      return meta.clearedHollows.includes(c.unlock.value);
  }
}

/**
 * The state a card is evaluated against is `TurnState` in `../types` — the same snapshot the turn
 * loop hands the player, so the fallback policy and the human are never priced from two shapes.
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
