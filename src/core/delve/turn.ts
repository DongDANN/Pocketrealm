/**
 * The four-action turn menu (DELVE_REDESIGN §4 A.3): every option the player can take this round,
 * priced before they commit.
 *
 * Nothing here reimplements combat. Attacks are priced by `attackInputFor` — the same assembly the
 * engine resolves with — and enemies by `enemyIntent`, the same forecast the pre-room strip reads.
 * The only thing a preview chooses is the roll: the middle of the variance with no crit, which is
 * the number the sum states and the range around it. A brace is priced by applying the engine's own
 * `guard` halving to each forecast blow, so Guard shows exactly what it saves.
 */

import type { Element } from './data/elements';
import { computeModifiers, attackInputFor, companionBase, openingDefence } from './combat';
import type { AttackContext, CombatPause, EnemyState } from './combat';
import {
  attackBreakdown,
  attackRange,
  damageSumText,
  incomingBreakdown,
  type DamageBreakdown,
} from './damage';
import { forgeTotals } from './forge';
import { enemyIntent, type IntentDefence, type IntentLine } from './intent';
import { computeBuffs } from './signals';
import type { SkillDef } from './data/builds';
import type { BudgetSignals, DelveMeta, RunState } from './types';
import { consumableById } from './workshop';

/** One living enemy as the menu lists it. Indices match `TurnOrder.targetIndex`. */
export interface TurnTargetView {
  index: number;
  name: string;
  hp: number;
  maxHp: number;
  def: number;
  marked: boolean;
  weakness: Element;
}

/** What one enemy is about to do, in the same words the pre-room strip uses. */
export interface TurnIntentView {
  targetIndex: number;
  label: string;
  detail: string;
  /** The likely number with its spread: '5 (4–6)'. Empty when nothing lands. */
  span: string;
  /** The arithmetic behind the unbraced number. Empty when nothing lands. */
  sum: string;
  traits: string[];
}

/** One option against one enemy, itemized. */
export interface PricedTarget {
  targetIndex: number;
  name: string;
  hp: number;
  /** The middle of the seeded roll — the number the sum prices. */
  likely: number;
  min: number;
  max: number;
  afterHp: number;
  sum: DamageBreakdown;
  sumText: string;
  notes: string[];
}

/** One of the four actions, priced against every living enemy. */
export interface TurnAction {
  kind: 'skill' | 'attack' | 'guard' | 'item';
  /** Skill or consumable id; null for the basic attack and the brace. */
  id: string | null;
  name: string;
  /** '2 energy', 'free', or empty for an action with no cost to state. */
  cost: string;
  ready: boolean;
  /** Why the action is refused this round; empty when ready. */
  reason: string;
  targets: PricedTarget[];
}

/** One enemy's blow, before and after the brace. */
export interface GuardLine {
  name: string;
  detail: string;
  unbraced: number;
  braced: number;
  /** One braced sum per incoming hit, so the halving is visible. */
  sums: string[];
}

export interface GuardView {
  lines: GuardLine[];
  unbraced: number;
  braced: number;
}

export interface TurnMenu {
  round: number;
  energy: number;
  hp: number;
  maxHp: number;
  shield: number;
  targets: TurnTargetView[];
  intents: TurnIntentView[];
  skills: TurnAction[];
  attack: TurnAction;
  guard: GuardView;
  /** Equipped, unspent consumables. None can be used mid-round until the Item action has rules. */
  items: TurnAction[];
}

function spanText(damage: { min: number; likely: number; max: number } | null): string {
  if (!damage) return '';
  return damage.min === damage.max
    ? `${damage.likely}`
    : `${damage.likely} (${damage.min}–${damage.max})`;
}

function priceTarget(
  target: EnemyState,
  targetIndex: number,
  skill: SkillDef | null,
  ctx: AttackContext,
): PricedTarget {
  const input = attackInputFor(target, skill, ctx, { variance: 0, crit: false });
  const sum = attackBreakdown(input);
  const range = attackRange(input);
  const notes: string[] = [];
  if (skill?.element) {
    if (input.elementMult > 1) notes.push(`Weakness ×${input.elementMult}`);
    else if (input.elementMult < 1) notes.push(`Resist ×${input.elementMult}`);
    else if (skill.element === target.weakness) notes.push(`Weak to ${target.weakness}`);
  }
  if (input.markMult !== 1) notes.push(`Marked ×${input.markMult}`);
  if (input.burningBonus > 0 && input.targetBurning) notes.push('Burning bonus');
  if (input.masteryLvl > 0) notes.push(`Mastery +${input.masteryLvl}%`);
  if (input.shield > 0) notes.push(`${input.shield} Shield first`);
  return {
    targetIndex,
    name: target.name,
    hp: target.hp,
    likely: range.likely,
    min: range.min,
    max: range.max,
    afterHp: sum.hpAfter,
    sum,
    sumText: damageSumText(sum),
    notes,
  };
}

/** All the inputs the engine would price a companion action from, at this instant. */
function attackContext(
  run: RunState,
  meta: DelveMeta,
  signals: BudgetSignals,
): { ctx: AttackContext; def: number; damageReduction: number } {
  const mods = computeModifiers(run, forgeTotals(meta.forge), computeBuffs(signals));
  const base = companionBase(run.companionLevel);
  const opening = openingDefence(run, mods);
  return {
    ctx: {
      atk: base.atk + mods.atk,
      critMult: mods.critDamageMult,
      eliteBonus: mods.eliteDamageBonus,
      knownWeaknesses: meta.knownWeaknesses ?? [],
      mastery: meta.mastery ?? {},
    },
    def: opening.def,
    damageReduction: opening.damageReduction,
  };
}

function guardLine(
  enemy: EnemyState,
  defence: IntentDefence,
  options: { heat: number; studied: boolean; telegraphArmed: boolean },
): GuardLine {
  const intent = enemyIntent(enemy, defence, options);
  const hits = [intent.next, intent.then].filter((l): l is IntentLine => !!l && l.input !== null);
  let unbraced = 0;
  let braced = 0;
  const sums: string[] = [];
  for (const hit of hits) {
    const raw = hit.sum ?? incomingBreakdown(hit.input!);
    const held = incomingBreakdown({ ...hit.input!, guard: true });
    unbraced += raw.dealt;
    braced += held.dealt;
    sums.push(damageSumText(held));
  }
  return {
    name: enemy.name,
    detail: hits.map((hit) => hit.label).join(' + ') || 'Nothing lands this round',
    unbraced,
    braced,
    sums,
  };
}

/**
 * The round's menu, rebuilt from a pause. `pause.enemies` carries the live roster, so the prices
 * reflect the fight as it stands rather than the room as it opened.
 */
export function turnMenu(
  run: RunState,
  meta: DelveMeta,
  signals: BudgetSignals,
  pause: CombatPause,
): TurnMenu {
  const { ctx, def, damageReduction } = attackContext(run, meta, signals);
  const stateHp = pause.state.hp;
  const live: IntentDefence = { def, damageReduction, hp: stateHp, shield: pause.shield };
  const living = pause.enemies.filter((e) => e.hp > 0);
  const studied = (enemy: EnemyState): boolean =>
    enemy.bossId !== undefined && (meta.bossKnowledge ?? []).includes(enemy.bossId);
  const intentOptions = { heat: run.heat, telegraphArmed: pause.telegraphArmed };

  const targets: TurnTargetView[] = living.map((enemy, index) => ({
    index,
    name: enemy.name,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    def: enemy.def,
    marked: pause.state.targets[index]?.marked ?? false,
    weakness: enemy.weakness,
  }));

  const intents: TurnIntentView[] = living.map((enemy, index) => {
    const intent = enemyIntent(enemy, live, { ...intentOptions, studied: studied(enemy) });
    return {
      targetIndex: index,
      label: intent.next.label,
      detail: intent.next.detail,
      span: spanText(intent.next.damage),
      sum: intent.next.sum ? damageSumText(intent.next.sum) : '',
      traits: intent.traits.map((trait) => `${trait.label}: ${trait.detail}`),
    };
  });

  const skills: TurnAction[] = pause.state.actives.map((skill) => {
    const cost = skill.energyCost ?? 1;
    const cooldown = pause.state.cooldowns[skill.id] ?? 0;
    const ready = cooldown <= 0 && pause.state.energy >= cost;
    const reason =
      cooldown > 0
        ? `Ready in ${cooldown} round${cooldown === 1 ? '' : 's'}.`
        : pause.state.energy < cost
          ? `Needs ${cost} energy; ${pause.state.energy} in hand.`
          : '';
    return {
      kind: 'skill' as const,
      id: skill.id,
      name: skill.name,
      cost: `${cost} energy`,
      ready,
      reason,
      targets: living.map((enemy, index) => priceTarget(enemy, index, skill, ctx)),
    };
  });

  const attack: TurnAction = {
    kind: 'attack',
    id: null,
    name: 'Basic attack',
    cost: 'free',
    ready: true,
    reason: '',
    targets: living.map((enemy, index) => priceTarget(enemy, index, null, ctx)),
  };

  const lines = living.map((enemy) =>
    guardLine(enemy, live, { ...intentOptions, studied: studied(enemy) }),
  );
  const guard: GuardView = {
    lines,
    unbraced: lines.reduce((total, line) => total + line.unbraced, 0),
    braced: lines.reduce((total, line) => total + line.braced, 0),
  };

  const items: TurnAction[] = run.consumables
    .filter((id) => !run.consumablesUsed[id])
    .map((id) => itemAction(id));

  return {
    round: pause.state.round,
    energy: pause.state.energy,
    hp: stateHp,
    maxHp: pause.state.maxHp,
    shield: pause.shield,
    targets,
    intents,
    skills,
    attack,
    guard,
    items,
  };
}

function itemAction(id: string): TurnAction {
  return {
    kind: 'item',
    id,
    name: consumableById(id)?.name ?? id,
    cost: '',
    ready: false,
    reason: 'No item can be used mid-round yet.',
    targets: [],
  };
}
