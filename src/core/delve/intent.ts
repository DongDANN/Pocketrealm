/**
 * What an enemy is about to do, before it does it.
 *
 * The Delve asks the player to commit to a room with one tap, so the readout has to answer "what happens
 * if I go in" in numbers. This module derives that from the same inputs the combat engine holds — the
 * enemy's stats and counters, the companion's DEF, damage reduction and shield pool — and prices every
 * action through `incomingBreakdown`, the very function the engine resolves hits with. An intent and a
 * landed hit are therefore the same computation on the same inputs, not two descriptions of one event.
 *
 * It is a pure forecast over a snapshot: nothing here mutates, and every rule it models (the enrage
 * threshold, the frenzy follow-up, the boss mechanic beat) is the rule the engine imports from
 * `data/affixes` and `data/enemies`, so the two cannot drift apart.
 */

import {
  ENRAGE_ATK_MULTIPLIER,
  ENRAGE_HP_PERCENT,
  FRENZY_FOLLOWUP_MULTIPLIER,
  SPLIT_HP_DIVISOR,
  THORN_DAMAGE,
  VAMPIRIC_DRAIN_DIVISOR,
} from './data/affixes';
import { BOSSES, mechanicMultiplier, type BossDef } from './data/enemies';
import { incomingBreakdown, type DamageBreakdown, type IncomingInput } from './damage';
import type { StatusInstance } from './types';

export type IntentKind = 'strike' | 'double' | 'telegraph' | 'mechanic' | 'stunned';

export interface IntentDamage {
  /** The worst swing the seeded variance can roll. */
  min: number;
  /** The middle of the swing — the number the itemized sum prices. */
  likely: number;
  max: number;
}

/** One action: what it is called, what it costs, and the arithmetic behind the cost. */
export interface IntentLine {
  kind: IntentKind;
  label: string;
  detail: string;
  /** Null for actions that deal no damage (a telegraph, a stunned turn). */
  damage: IntentDamage | null;
  /** A mechanic with a guard braced, so the counter is visible next to the threat. */
  guarded: number | null;
  /** The exact input `incomingBreakdown` is priced from — the panel and the engine share it. */
  input: IncomingInput | null;
  sum: DamageBreakdown | null;
}

export interface IntentTrait {
  id: string;
  label: string;
  detail: string;
}

export interface EnemyIntent {
  name: string;
  /** Its next action. */
  next: IntentLine;
  /** A second swing in the same action (Frenzied), or the mechanic a telegraph is promising. */
  then: IntentLine | null;
  /** Standing behaviour that shapes the exchange without being an action. */
  traits: IntentTrait[];
}

/** The fields of a combat enemy this forecast reads; `EnemyState` in combat.ts satisfies it as-is. */
export interface IntentEnemy {
  name: string;
  /** Species id — the bestiary key, used for the flavour verb. */
  species?: string;
  atk: number;
  hp: number;
  maxHp: number;
  /** Actions already taken this fight; the one being forecast is numbered `turn + 1`. */
  turn: number;
  affixes?: readonly string[];
  statuses?: readonly StatusInstance[];
  bossId?: string;
  phaseIndex?: number;
}

/** The companion's side of the same exchange. */
export interface IntentDefence {
  def: number;
  hp: number;
  damageReduction?: number;
  shield?: number;
  /** True when a guard skill is braced for the next mechanic. */
  guard?: boolean;
}

export interface IntentOptions {
  /** Run heat — Heat 3+ appends a boss's extra final phase, which changes its mechanic multiplier. */
  heat?: number;
  /** Boss Study reveals the mechanic's name and tell; unstudied bosses keep them hidden. */
  studied?: boolean;
  /**
   * Whether a mechanic is currently armed. Defaults to the engine's alternation, which a stun can
   * break — pass the live flag when forecasting mid-fight.
   */
  telegraphArmed?: boolean;
}

/** Species-flavoured verbs, so a strip reads "Bites for 5" rather than "Attacks for 5". */
const STRIKE_VERB: Record<string, string> = {
  tollbug: 'Bites',
  mossbite: 'Chews',
  rootsnarl: 'Smashes',
  sparkmoth: 'Zaps',
  cinderbeetle: 'Rams',
  emberjaw: 'Snaps',
  smolderhusk: 'Slams',
  shadewisp: 'Brushes past',
  umbraclaw: 'Rakes',
  voidveil: 'Smothers',
  thornheart: 'Flails',
  cindermaw: 'Roasts',
  veilweaver: 'Stitches',
  thorncrown: 'Lashes',
  ashwrought: 'Strikes',
  umbralmonarch: 'Drags',
};

const ENRAGED = (t: IntentEnemy): boolean => t.hp * 100 < t.maxHp * ENRAGE_HP_PERCENT;

function hasStatus(statuses: readonly StatusInstance[], id: string): boolean {
  return statuses.some((s) => s.id === id && s.duration > 0);
}

function shieldStacks(statuses: readonly StatusInstance[]): number {
  return statuses.filter((s) => s.id === 'shield').reduce((a, s) => a + s.stacks, 0);
}

/** The mechanic name only a studied boss surrenders; its damage is always legible. */
function mechanicName(boss: BossDef, studied: boolean): string {
  return studied ? mechanicTitle(boss, true) : 'A heavy blow';
}

/** The same tell, phrased for the middle of a sentence — what a screen has to say when it is unnamed. */
export function mechanicTitle(boss: BossDef, studied: boolean): string {
  if (!studied) return 'a heavy blow';
  return boss.mechanic.split(':')[0]?.trim() ?? 'a heavy blow';
}

/**
 * The engine arms a telegraph on the first multiple of `mechanicEvery` and lands it on the next, so the
 * boss swings normally in between and the mechanic alternates every other beat.
 */
export function mechanicArmed(actionNumber: number, boss: BossDef): boolean {
  const every = boss.mechanicEvery;
  if (!Number.isFinite(every) || every <= 0 || actionNumber % every !== 0) return false;
  return (actionNumber / every) % 2 === 0;
}

/** True on every beat where the boss either telegraphs or lands its mechanic. */
export function mechanicBeat(actionNumber: number, boss: BossDef): boolean {
  const every = boss.mechanicEvery;
  return Number.isFinite(every) && every > 0 && actionNumber % every === 0;
}

/** Prices one action of one enemy against one companion, over the seeded variance. */
function makePricer(target: IntentEnemy, defence: IntentDefence) {
  /** The ATK the engine will actually strike with on the next action, enrage included. */
  const atkNow =
    target.affixes?.includes('enraged') && ENRAGED(target)
      ? Math.round(target.atk * ENRAGE_ATK_MULTIPLIER)
      : target.atk;

  const input = (
    atk: number,
    variance: number,
    mechanic?: { multiplier: number; guard: boolean },
  ): IncomingInput => ({
    atk,
    def: defence.def,
    variance,
    damageReduction: defence.damageReduction ?? 0,
    shield: defence.shield ?? 0,
    hp: defence.hp,
    ...(mechanic ? { mechanic } : {}),
  });

  const sum = (atk: number, mechanic?: { multiplier: number; guard: boolean }): DamageBreakdown =>
    incomingBreakdown(input(atk, 0, mechanic));

  const damage = (atk: number, mechanic?: { multiplier: number; guard: boolean }): IntentDamage => {
    const likely = sum(atk, mechanic).dealt;
    // A mechanic rolls no variance, so a telegraph is a promise rather than a suggestion.
    if (mechanic) return { min: likely, likely, max: likely };
    return {
      min: incomingBreakdown(input(atk, -1)).dealt,
      likely,
      max: incomingBreakdown(input(atk, 1)).dealt,
    };
  };

  /** The damage as the player reads it: the middle of the swing, with its spread beside it. */
  const span = (atk: number, mechanic?: { multiplier: number; guard: boolean }): string => {
    const d = damage(atk, mechanic);
    return d.min === d.max ? `${d.likely}` : `${d.likely} (${d.min}–${d.max})`;
  };

  return { atkNow, input, sum, damage, span };
}

type Pricer = ReturnType<typeof makePricer>;

export function enemyIntent(
  target: IntentEnemy,
  defence: IntentDefence,
  options: IntentOptions = {},
): EnemyIntent {
  const heat = options.heat ?? 0;
  const studied = options.studied ?? false;
  const statuses = target.statuses ?? [];
  const boss = target.bossId ? BOSSES.find((b) => b.id === target.bossId) : undefined;
  const price = makePricer(target, defence);
  const atk = price.atkNow;
  const action = target.turn + 1;
  const traits = traitsOf(target, statuses, price);

  if (hasStatus(statuses, 'stun')) {
    return {
      name: target.name,
      next: {
        kind: 'stunned',
        label: 'Stunned',
        detail: boss
          ? 'Stunned: it loses this action, and its mechanic is interrupted.'
          : 'Stunned: it loses this action.',
        damage: null,
        guarded: null,
        input: null,
        sum: null,
      },
      then: null,
      traits,
    };
  }

  if (boss && mechanicBeat(action, boss)) {
    const mechanic = {
      multiplier: mechanicMultiplier(boss, target.phaseIndex ?? 0, heat),
      guard: defence.guard ?? false,
    };
    const name = mechanicName(boss, studied);
    const landed: IntentLine = {
      kind: 'mechanic',
      label: name,
      detail: `${name} for ${price.span(atk, mechanic)} — no swing variance.`,
      damage: price.damage(atk, mechanic),
      guarded: price.sum(atk, { ...mechanic, guard: true }).dealt,
      input: price.input(atk, 0, mechanic),
      sum: price.sum(atk, mechanic),
    };
    if (options.telegraphArmed ?? mechanicArmed(action, boss)) {
      return { name: target.name, next: landed, then: null, traits };
    }
    const beat = action + boss.mechanicEvery;
    return {
      name: target.name,
      next: {
        kind: 'telegraph',
        label: `Telegraphs ${name}`,
        detail: studied
          ? `Nothing lands this action; ${name} arrives on its next mechanic beat (action ${beat}).`
          : `Nothing lands this action; a heavy blow arrives on its next mechanic beat (action ${beat}).`,
        damage: null,
        guarded: null,
        input: null,
        sum: null,
      },
      then: {
        ...landed,
        detail: `${name} on action ${beat}: ${price.span(atk, mechanic)} damage. Guard it and it lands for ${landed.guarded}.`,
      },
      traits,
    };
  }

  const verb = STRIKE_VERB[target.species ?? ''] ?? STRIKE_VERB[target.bossId ?? ''] ?? 'Attacks';
  const next: IntentLine = {
    kind: 'strike',
    label: verb,
    detail: `${verb} for ${price.span(atk)}.`,
    damage: price.damage(atk),
    guarded: null,
    input: price.input(atk, 0),
    sum: price.sum(atk),
  };
  if (!target.affixes?.includes('frenzied')) return { name: target.name, next, then: null, traits };

  const follow = Math.max(1, Math.round(atk * FRENZY_FOLLOWUP_MULTIPLIER));
  return {
    name: target.name,
    next,
    then: {
      kind: 'double',
      label: 'Strikes again',
      detail: `A second swing for ${price.span(follow)}.`,
      damage: price.damage(follow),
      guarded: null,
      input: price.input(follow, 0),
      sum: price.sum(follow),
    },
    traits,
  };
}

function traitsOf(
  target: IntentEnemy,
  statuses: readonly StatusInstance[],
  price: Pricer,
): IntentTrait[] {
  const affixes = target.affixes ?? [];
  const atk = price.atkNow;
  const out: IntentTrait[] = [];

  if (affixes.includes('enraged') && !ENRAGED(target)) {
    const threshold = Math.max(0, Math.floor((target.maxHp * ENRAGE_HP_PERCENT - 1) / 100));
    out.push({
      id: 'enraged',
      label: 'Enraged',
      detail: `At ${threshold} HP or less it hits for ${price.span(Math.round(target.atk * ENRAGE_ATK_MULTIPLIER))} instead of ${price.span(target.atk)}.`,
    });
  }
  if (affixes.includes('vampiric')) {
    const dealt = price.sum(atk).dealt;
    out.push({
      id: 'vampiric',
      label: 'Vampiric',
      detail: `Drinks back ${Math.max(1, Math.round(dealt / VAMPIRIC_DRAIN_DIVISOR))} HP from each hit that lands.`,
    });
  }
  if (affixes.includes('thorned')) {
    out.push({
      id: 'thorned',
      label: 'Thorned',
      detail: `Cuts you for ${THORN_DAMAGE} every time you strike it.`,
    });
  }
  const shield = shieldStacks(statuses);
  if (shield > 0) {
    out.push({
      id: 'warded',
      label: 'Shield',
      detail: `${shield} Shield soaks your hits before its HP moves.`,
    });
  }
  if (affixes.includes('splitting')) {
    out.push({
      id: 'splitting',
      label: 'Splitting',
      detail: `On death it leaves a copy at ${Math.max(1, Math.round(target.maxHp / SPLIT_HP_DIVISOR))} HP.`,
    });
  }
  return out;
}
