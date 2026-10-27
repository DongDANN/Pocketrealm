/**
 * The three numbers the Delve screen prints before the player commits: who is in the room, what they
 * will do, and what one of our swings costs them.
 *
 * Every value comes from the engine's own functions. The roster is `spawnEnemies`, the companion's side
 * of the exchange is `openingDefence`, the threat is `enemyIntent`, and both directions of damage are
 * priced by `attackBreakdown` / `incomingBreakdown` — the same calls that resolve a real step. A room
 * therefore cannot disagree with the panel above it, and a panel cannot flatter a dangerous room.
 *
 * What is not known stays unsaid: an unstudied boss keeps its mechanic's name, an unrevealed weakness
 * is listed without promising the +25%.
 */

import {
  BOSSES,
  WEAKNESS_MULT,
  attackBreakdown,
  attackRange,
  companionBase,
  computeBuffs,
  computeModifiers,
  damageSumText,
  enemyIntent,
  forgeTotals,
  hitOf,
  masteryLevel,
  mechanicTitle,
  openingDefence,
  spawnEnemies,
  statusShield,
  type AttackInput,
  type BudgetSignals,
  type DelveMeta,
  type EnemyState,
  type IntentDamage,
  type IntentLine,
  type RunLogEntry,
  type RoomKind,
  type RunState,
} from '../../core/delve';
import { currentRoom } from './delveScene';

const COMBAT_ROOMS: readonly RoomKind[] = ['skirmish', 'elite', 'boss'];

/** Everything the readout needs about the room, computed exactly once per render. */
interface RoomView {
  run: RunState;
  enemies: EnemyState[];
  /** The companion's DEF, HP and Shield as the first enemy action sees them. */
  defence: ReturnType<typeof openingDefence>;
  /** Our ATK after every boon, tree node, forge and signal buff. */
  atk: number;
  critMult: number;
  eliteBonus: number;
  mastery: Record<string, number>;
  studied: (enemy: EnemyState) => boolean;
}

function roomView(run: RunState, meta: DelveMeta, signals: BudgetSignals): RoomView | null {
  const room = currentRoom(run);
  if (!room || !COMBAT_ROOMS.includes(room.kind)) return null;
  const mods = computeModifiers(run, forgeTotals(meta.forge), computeBuffs(signals));
  const base = companionBase(run.companionLevel);
  const knowledge = meta.bossKnowledge ?? [];
  return {
    run,
    enemies: spawnEnemies(room, run.floor, run.heat),
    defence: openingDefence(run, mods),
    atk: base.atk + mods.atk,
    critMult: mods.critDamageMult,
    eliteBonus: mods.eliteDamageBonus,
    mastery: meta.mastery ?? {},
    studied: (enemy) => enemy.bossId !== undefined && knowledge.includes(enemy.bossId),
  };
}

/** The middle of the swing with its spread beside it, or a single number when there is no spread. */
function spanText(damage: IntentDamage | null): string {
  if (!damage) return '';
  return damage.min === damage.max
    ? `${damage.likely}`
    : `${damage.likely} (${damage.min}–${damage.max})`;
}

/** One enemy, and the action it is about to take. */
export interface ThreatRow {
  name: string;
  /** Its HP at the start of the fight. */
  hp: number;
  /** The DEF our attack will subtract. */
  def: number;
  /** What the next action is called: 'Bites', 'Telegraphs Thorn Barrage', 'Stunned'. */
  intent: string;
  /** The damage it most likely deals on that action; 0 when the action deals none. */
  likely: number;
  /** The likely number with its spread: '3 (2–4)'. */
  damage: string;
  /** The arithmetic behind `likely`, e.g. 'ATK 9 −5 DEF −1 Shield = 3'. */
  sum: string;
  /** Our own opening Shield — the pool that soaks this hit before HP moves. */
  shield: number;
  /** A boss, or a mechanic landing on this very action. */
  big: boolean;
  /** The beat after this one: a frenzy follow-up, or the boss rhythm. */
  followUp: string;
  /** Standing behaviour: enrage thresholds, thorns, its own shield. */
  traits: string[];
}

function followUpFor(
  enemy: EnemyState,
  next: IntentLine,
  then: IntentLine | null,
  studied: boolean,
): string {
  const parts: string[] = [];
  const boss = enemy.bossId ? BOSSES.find((b) => b.id === enemy.bossId) : undefined;
  if (boss) {
    const name = mechanicTitle(boss, studied);
    parts.push(
      `Telegraphs ${name} on action ${boss.mechanicEvery}; it lands on action ${boss.mechanicEvery * 2}.`,
    );
  }
  if (then) {
    parts.push(
      then.kind === 'double'
        ? `Then a second swing for ${spanText(then.damage)}.`
        : `Then ${then.detail}`,
    );
  }
  if (next.kind === 'mechanic') parts.push('No telegraph this action — the mechanic lands now.');
  if (next.kind === 'stunned' && boss)
    parts.push('Its mechanic is interrupted while it is stunned.');
  return parts.join(' ');
}

export function roomThreats(run: RunState, meta: DelveMeta, signals: BudgetSignals): ThreatRow[] {
  const view = roomView(run, meta, signals);
  if (!view) return [];
  const defence = {
    def: view.defence.def,
    hp: view.defence.hp,
    damageReduction: view.defence.damageReduction,
    shield: view.defence.shield,
  };

  return view.enemies.map((enemy) => {
    const studied = view.studied(enemy);
    const intent = enemyIntent(enemy, defence, { heat: run.heat, studied });
    const next = intent.next;
    return {
      name: enemy.name,
      hp: enemy.hp,
      def: enemy.def,
      intent: next.label,
      likely: next.damage?.likely ?? 0,
      damage: spanText(next.damage),
      sum: next.sum ? damageSumText(next.sum) : '',
      shield: view.defence.shield,
      big: enemy.bossId !== undefined || next.kind === 'mechanic',
      followUp: followUpFor(enemy, next, intent.then, studied),
      traits: intent.traits.map((t) => `${t.label}: ${t.detail}`),
    };
  });
}

/** What one of our actions would do to one enemy, itemized. */
export interface SwingRow {
  name: string;
  /** The middle, with the worst and best the seed can roll: '12 (11–20)'. */
  total: string;
  likely: number;
  /** The best case: a critical on the high variance. */
  crit: number;
  /** The arithmetic behind `likely`, e.g. 'ATK 14 −2 DEF = 12'. */
  sum: string;
  /** Element and mastery facts about the target. */
  notes: string[];
}

function attackInput(view: RoomView, enemy: EnemyState): AttackInput {
  return {
    atk: view.atk,
    // A basic attack: the floor of what the fight can do, since the build may spend a skill instead.
    power: 1,
    def: enemy.def,
    variance: 0,
    crit: false,
    critMult: view.critMult,
    burningBonus: 0,
    targetBurning: false,
    markMult: 1,
    elementMult: 1,
    masteryLvl: masteryLevel(view.mastery[enemy.species] ?? 0),
    eliteBonus: view.eliteBonus,
    targetElite: enemy.elite,
    shield: statusShield(enemy.statuses),
    hp: enemy.hp,
  };
}

export function roomSwings(run: RunState, meta: DelveMeta, signals: BudgetSignals): SwingRow[] {
  const view = roomView(run, meta, signals);
  if (!view) return [];

  return view.enemies.map((enemy) => {
    const input = attackInput(view, enemy);
    const likely = attackBreakdown(input);
    const range = attackRange(input);
    const weaknessKnown = (meta.knownWeaknesses ?? []).includes(enemy.weakness);
    const notes = [
      weaknessKnown
        ? `Weak to ${enemy.weakness} for +${Math.round((WEAKNESS_MULT - 1) * 100)}%`
        : `Weak to ${enemy.weakness}`,
      `Resists ${enemy.resistance}`,
    ];
    const mastery = masteryLevel(view.mastery[enemy.species] ?? 0);
    if (mastery > 0) notes.push(`Mastery +${mastery}%`);
    if (input.shield > 0) notes.push(`${input.shield} Shield soaks it first`);
    return {
      name: enemy.name,
      total:
        range.min === range.max ? `${range.likely}` : `${range.likely} (${range.min}–${range.max})`,
      likely: range.likely,
      crit: range.max,
      sum: damageSumText(likely),
      notes,
    };
  });
}

/** One landed hit, as the recap prints it. */
export interface RecapRow {
  round: number;
  actor: string;
  target: string;
  /** The same arithmetic the log line carried in parentheses. */
  sum: string;
  dealt: number;
  crit: boolean;
  side: 'player' | 'enemy';
}

export interface Recap {
  rows: RecapRow[];
  /** Beats the limit left out of view. */
  omitted: number;
}

/**
 * The beats the last step produced, newest last. Reads only the structured records the engine attached
 * to its own log lines, so a recap row and the text log can never report different numbers.
 */
export function recapOf(log: readonly RunLogEntry[], limit = 6): Recap {
  const hits = log.map(hitOf).filter((h): h is NonNullable<typeof h> => h !== null);
  const rows: RecapRow[] = hits.map((hit) => ({
    round: hit.round,
    actor: hit.actor,
    target: hit.target,
    sum: damageSumText(hit.sum),
    dealt: hit.sum.dealt,
    crit: hit.sum.crit,
    side: hit.side,
  }));
  return { rows: rows.slice(-limit), omitted: Math.max(0, rows.length - limit) };
}
