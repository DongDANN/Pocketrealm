/**
 * Deterministic round-based auto-battle. SPD sets turn order; damage is ATK vs DEF with seeded
 * variance and LUCK-driven crits. Bosses telegraph their mechanic one round ahead. Combat
 * terminates at a hard 40-round cap, which counts as a safe retreat with no loss.
 *
 * Gate 1.6 layers: the moveset the run carries supplies up to four active skills (energy, cooldowns)
 * and one passive — its own, or the build's when it names nothing (§7 D.2); statuses
 * (burn/poison/chill/stun/mark/regen) tick every round and clear after combat, each for the rounds its
 * card states;
 * skill attacks carry an element and hit ±25% weakness/resistance (weakness only once the codex
 * knows it, resistance always). Affixes (armored/swift/vampiric/splitting/enraged/thorned/
 * warded/frenzied) modify enemy stats and behavior; bosses enter harder phases at 66%/33% HP
 * with three counters to telegraphed mechanics: guard skills halve them, stun interrupts them,
 * and critical interrupts-telegraph skills cancel them. Boss Study reveals names and tells.
 *
 * Gate 7c-3b adds the Dust ladder's top rung (§7 D.6): `fxAtLevel` folds a catalogue skill's LV5
 * modifier into the same fields the printed fx uses, so the shield fraction, the crit points, the
 * status rounds, the second target a status spreads to, and the floored variance roll are all read from
 * one place by the engine and by the menu that prices it. A build's own skill has no rung to attach and
 * resolves to exactly its printed numbers.
 */

import { hashCombine, hashString, mulberry32, type Rng } from '../rng';
import type { BoonLike } from './data/boons';
import { anyBoonById } from './data/fusions';
import {
  buildById,
  DEFAULT_BUILD,
  treeNodeById,
  type PassiveFx,
  type SkillDef,
} from './data/builds';
import { level5FxOf, type Level5Fx } from './data/skills';
import { potencyMult, reachesLevel5 } from './levels';
import { runMoveset } from './moveset';
import {
  ENRAGE_ATK_MULTIPLIER,
  ENRAGE_HP_PERCENT,
  FRENZY_FOLLOWUP_MULTIPLIER,
  SPLIT_HP_DIVISOR,
  THORN_DAMAGE,
  VAMPIRIC_DRAIN_DIVISOR,
} from './data/affixes';
import {
  BOSSES,
  ELITES,
  bossPhases,
  enemyById,
  mechanicMultiplier,
  scaledStats,
} from './data/enemies';
import { elementMultiplier, type Element } from './data/elements';
import {
  attackBreakdown,
  damageSumText,
  incomingBreakdown,
  type AttackInput,
  type DamageBreakdown,
  type HitRecord,
  type IncomingInput,
} from './damage';
import { masteryLevel } from './mastery';
import {
  STUN_BOSS_RESIST,
  STUN_RECENT_RESIST,
  STUN_RESIST_GRACE,
  statusById,
  type StatusDef,
} from './data/statuses';
import type {
  RunLogEntry,
  RunState,
  StatusInstance,
  TurnDecider,
  TurnOrder,
  TurnState,
} from './types';

export const ROUND_CAP = 40;

export interface CombatModifiers {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  critChance: number;
  critDamageMult: number;
  roomShield: number;
  damageReduction: number;
  healAfterCombat: number;
  /** Extra damage taken by elite enemies (percent). */
  eliteDamageBonus: number;
}

export const BASE_MODIFIERS: CombatModifiers = {
  maxHp: 0,
  atk: 0,
  def: 0,
  spd: 0,
  luck: 0,
  critChance: 0,
  critDamageMult: 1.5,
  roomShield: 0,
  damageReduction: 0,
  healAfterCombat: 0,
  eliteDamageBonus: 0,
};

/** Companion base stats by level. */
export function companionBase(level: number): {
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
} {
  const l = Math.max(1, Math.trunc(level));
  return {
    hp: 60 + 6 * (l - 1),
    maxHp: 60 + 6 * (l - 1),
    atk: 10 + 2 * (l - 1),
    def: 4 + Math.floor((l - 1) / 2),
    spd: 8,
    luck: 5,
  };
}

function countTag(boons: readonly BoonLike[], tag: string): number {
  return boons.filter((x) => x.tag === tag).length;
}

function resolveBoons(ids: readonly string[]): BoonLike[] {
  const out: BoonLike[] = [];
  for (const id of ids) {
    const x = anyBoonById(id);
    if (x) out.push(x);
  }
  return out;
}

function addTreeNodeFx(m: CombatModifiers, buildId: string, nodeId: string): void {
  const fx = treeNodeById(buildId, nodeId)?.fx;
  if (!fx) return;
  if (fx.kind === 'stat') m[fx.stat] += fx.add;
  else if (fx.kind === 'critChance') m.critChance += fx.add;
  else if (fx.kind === 'critDamage') m.critDamageMult += fx.mult;
  else if (fx.kind === 'roomShield') m.roomShield += fx.amount;
  else if (fx.kind === 'damageReduction') m.damageReduction += fx.percent;
  else if (fx.kind === 'healAfterCombat') m.healAfterCombat += fx.percent;
}

/** Sum boon stats, tag bonuses (3/5 thresholds), relics, Forge, build profile/tree, and buffs. */
export function computeModifiers(
  run: RunState,
  forgeTotals: Record<string, number>,
  buffs: { wardHp: number; luckBonus: number },
): CombatModifiers {
  const m: CombatModifiers = { ...BASE_MODIFIERS };
  const boons = resolveBoons(run.boons);
  for (const b of boons) {
    const lvl = run.boonLevels[b.id] ?? 1;
    const fx = b.fx;
    if (fx.kind === 'stat') m[fx.stat] += fx.add * lvl;
    else if (fx.kind === 'critChance') m.critChance += fx.add * lvl;
    else if (fx.kind === 'critDamage') m.critDamageMult += fx.mult * lvl;
    else if (fx.kind === 'roomShield') m.roomShield += fx.amount * lvl;
    else if (fx.kind === 'damageReduction') m.damageReduction += fx.percent * lvl;
    else if (fx.kind === 'healAfterCombat') m.healAfterCombat += fx.percent * lvl;
  }
  const guard = countTag(boons, 'guard');
  const fury = countTag(boons, 'fury');
  const fortune = countTag(boons, 'fortune');
  const vigor = countTag(boons, 'vigor');
  if (guard >= 3) m.roomShield += 8;
  if (guard >= 5) m.def += 4;
  if (fury >= 3) m.atk += 3;
  if (fury >= 5) m.critDamageMult += 0.25;
  if (fortune >= 3) m.luck += 5;
  if (vigor >= 3) m.healAfterCombat += 10;
  if (vigor >= 5) m.maxHp += 12;
  if (run.relics.includes('relic-lanternwick')) m.roomShield += 4;
  if (run.relics.includes('relic-quill')) m.luck += boons.length;
  if (run.relics.includes('relic-matchbook')) m.eliteDamageBonus += 5;
  const build = buildById(run.buildId) ?? buildById(DEFAULT_BUILD);
  if (build) {
    m.maxHp += build.profile.hpAdd;
    m.atk += build.profile.atkAdd;
    m.def += build.profile.defAdd;
    m.spd += build.profile.spdAdd;
    m.luck += build.profile.luckAdd;
    for (const id of run.tree) addTreeNodeFx(m, build.id, id);
  }
  m.maxHp += forgeTotals.maxHp ?? 0;
  m.atk += forgeTotals.atk ?? 0;
  m.def += forgeTotals.def ?? 0;
  m.luck += forgeTotals.luck ?? 0;
  m.luck += buffs.luckBonus;
  m.roomShield += buffs.wardHp;
  if (run.relics.includes('relic-interest')) {
    m.atk += Math.max(0, Math.round(m.atk * 0.02 * Math.max(0, run.floor - 1)));
  }
  return m;
}

/**
 * Apply a status with its stacking rules. Stun rolls boss/recent resistance (seeded).
 *
 * `rounds` is the card's own duration — its table duration with no LV5 rung, the rung's total once the
 * ladder is bought. A Stun ignores it in practice: the skip handler removes the status outright, so its
 * count is inert, which is why §7 D.6 never puts a `statusRounds` rung on a stun skill.
 */
export function applyStatus(
  statuses: StatusInstance[],
  id: string,
  rng: Rng,
  opts: { isBoss?: boolean; roundsSinceStun?: number; rounds?: number } = {},
): StatusInstance[] {
  const def = statusById(id);
  if (!def) return statuses;
  if (id === 'stun') {
    if (opts.isBoss && rng.int(100) < STUN_BOSS_RESIST) return statuses;
    if (
      (opts.roundsSinceStun ?? STUN_RESIST_GRACE) < STUN_RESIST_GRACE &&
      rng.int(100) < STUN_RECENT_RESIST
    ) {
      return statuses;
    }
  }
  const rounds = opts.rounds && opts.rounds > 0 ? opts.rounds : def.duration;
  const maxStacks = def.maxStacks ?? 1;
  const existing = statuses.find((s) => s.id === id);
  if (!existing) {
    const stacks =
      def.stacking === 'add' ? Math.min(def.amount ?? 1, maxStacks) : Math.min(1, maxStacks);
    return [...statuses, { id, stacks, duration: rounds }];
  }
  const stacks =
    def.stacking === 'stack' || def.stacking === 'add'
      ? Math.min(existing.stacks + (def.stacking === 'add' ? (def.amount ?? 1) : 1), maxStacks)
      : existing.stacks;
  return statuses.map((s) => (s.id === id ? { ...s, stacks, duration: rounds } : s));
}

/** SPD while statuses apply (chill halves). */
export function effectiveSpd(spd: number, statuses: readonly StatusInstance[]): number {
  return statuses.some((s) => s.id === 'chill' && s.duration > 0) ? Math.floor(spd / 2) : spd;
}

/** Total absorb from shield statuses (for UI display). */
export function statusShield(statuses: readonly StatusInstance[]): number {
  return statuses.filter((s) => s.id === 'shield').reduce((a, s) => a + s.stacks, 0);
}

function hasStatus(statuses: readonly StatusInstance[], id: string): boolean {
  return statuses.some((s) => s.id === id && s.duration > 0);
}

/** Mark's damage-taken multiplier (1 when the target is unmarked). */
function markDamageMult(target: EnemyState): number {
  return hasStatus(target.statuses, 'mark') ? (statusById('mark')!.perRound!.dmgTakenMult ?? 1) : 1;
}

function isPassiveFx(fx: SkillDef['fx']): fx is PassiveFx {
  return !!fx && 'kind' in fx;
}

/**
 * A skill's printed `fx` with the LV5 rung folded in (§7 D.6). One shape read by the fight, by the
 * menu that prices it, and by anything else that has to state what a swing does, so the top of the
 * Dust ladder can never be true in one place and a promise in another.
 *
 * The folded fields are the ones `Level5Fx` can touch. Everything else about a swing — its power,
 * its element, its energy cost — is exactly what the card prints.
 */
export interface ResolvedSkillFx {
  /** Fraction of the damage dealt that comes back as Shield; 0 when the swing raises none. */
  shieldPercent: number;
  /** Percentage points this swing adds to the crit roll. */
  critPoints: number;
  /** Damage multiplier against an already-burning target; 0 when the swing does not care. */
  burningBonus: number;
  /** A critical with this skill cancels a boss's telegraphed mechanic. */
  interruptsTelegraph: boolean;
  /** The status the hit lands, or undefined for a swing that leaves nothing behind. */
  status?: string;
  /** Rounds `status` lasts: the card's own number, raised by the rung, else the table's duration. */
  statusRounds: number;
  /** True when `status` also lands on one other living enemy, chosen in roster order. */
  spread: boolean;
  /** True when the seeded −1 is refused, so this blow never undercuts its likely number. */
  varianceFloor: boolean;
}

/** The rung on one skill's ladder, or nothing for a skill the catalogue does not hold. */
function level5Of(id: string | undefined, level: number | undefined): Level5Fx | undefined {
  if (!id || !reachesLevel5(level)) return undefined;
  return level5FxOf(id);
}

/** A folded fraction kept to three decimals, so the number the log multiplies is the one the card prints. */
function foldFraction(base: number, add: number): number {
  return Math.round((base + add) * 1000) / 1000;
}

/** The active skill's on-hit effect, with its LV5 modifier applied. Passives and bare attacks are empty. */
export function fxAtLevel(skill: SkillDef | undefined, level: number | undefined): ResolvedSkillFx {
  const printed = skill?.fx;
  const hit = printed && !isPassiveFx(printed) ? printed : undefined;
  const out: ResolvedSkillFx = {
    shieldPercent: hit?.shieldPercent ?? 0,
    critPoints: hit?.bonusCrit ?? 0,
    burningBonus: hit?.bonusIfBurning ?? 0,
    interruptsTelegraph: hit?.interruptsTelegraph ?? false,
    status: hit?.status,
    statusRounds:
      hit?.statusDuration ?? (hit?.status ? (statusById(hit.status)?.duration ?? 0) : 0),
    spread: false,
    varianceFloor: false,
  };
  const rung = level5Of(skill?.id, level);
  if (!rung) return out;
  switch (rung.kind) {
    case 'statusRounds':
      // Only a swing that names a status has rounds to lengthen; on a passive the same rung kind is
      // read by `passiveCritBurnRounds`, against that passive's own Burn.
      if (out.status) out.statusRounds += rung.add;
      break;
    case 'spread':
      out.spread = true;
      break;
    case 'shieldPercent':
      out.shieldPercent = foldFraction(out.shieldPercent, rung.add);
      break;
    case 'critPoints':
      out.critPoints += rung.add;
      break;
    case 'varianceFloor':
      out.varianceFloor = true;
      break;
    case 'openingShield':
      // A passive's opening Shield; read by `passiveShieldAmount` rather than here.
      break;
  }
  return out;
}

/** The Shield a passive opens the fight behind, with its LV5 rung folded in. */
export function passiveShieldAmount(skill: SkillDef, level: number | undefined): number {
  const fx = skill.fx;
  if (!isPassiveFx(fx) || fx.kind !== 'startShield') return 0;
  const rung = level5Of(skill.id, level);
  return fx.amount + (rung?.kind === 'openingShield' ? rung.add : 0);
}

/** Rounds the Burn from a crit-lighting passive lasts, with its LV5 rung folded in. */
export function passiveCritBurnRounds(skill: SkillDef, level: number | undefined): number {
  const fx = skill.fx;
  if (!isPassiveFx(fx) || fx.kind !== 'critBurn') return 0;
  const rung = level5Of(skill.id, level);
  return fx.duration + (rung?.kind === 'statusRounds' ? rung.add : 0);
}

/**
 * The room as the turn loop leaves it when the player has not ordered this round yet (§4 A.1).
 *
 * Only the orders are persisted, never this snapshot: the room is rebuilt by replaying the orders
 * against the same seed, so a saved run carries a decision trail instead of a pile of mutable state —
 * and a trail is what the golden hashes can pin.
 */
export interface CombatPause {
  /** The round being asked about, as the menu sees it. */
  state: TurnState;
  /** The roster at this instant, living and dead, so the readout prices the enemies the fight has. */
  enemies: EnemyState[];
  shield: number;
  /** True when a boss mechanic is armed for this round, so intent pricing agrees with the engine. */
  telegraphArmed: boolean;
  /** The orders already acted on in this room, in order. */
  orders: TurnOrder[];
  /**
   * The room's fight lines so far. Rebuilt by the same replay that rebuilds everything else, so a run
   * resumed from storage can show the round it left off in without the log ever being persisted.
   */
  log: RunLogEntry[];
}

/** One order the rules could honour, resolved into what the round actually does. */
type HonouredOrder = { brace: true } | { brace: false; skill?: SkillDef; target: EnemyState };

export interface CombatResult {
  won: boolean;
  drawn: boolean;
  /** Smoke Scroll: the companion escaped a killing blow at 1 HP (no win, no faint). */
  fled: boolean;
  hpAfter: number;
  maxHp: number;
  rounds: number;
  /** Enemy species killed (mastery XP; splits count for their species). */
  kills: string[];
  /** Consumables spent during this combat (each fires at most once per run). */
  consumablesUsed: Record<string, boolean>;
  log: RunLogEntry[];
  /**
   * The player's orders for this room, in the order they were acted on. A paused room returns the
   * orders it has so far, which is what the run persists and replays.
   */
  orders: TurnOrder[];
  /**
   * Set when the room did not finish because a decider had no order for a round. The caller asks the
   * player and replays; `kills` and the post-fight healing are deliberately not counted while a room
   * is unfinished, so a replay can credit them exactly once.
   */
  pause?: CombatPause;
}

export function combatRng(runId: string, stepIndex: number): Rng {
  return mulberry32(hashCombine(hashString(runId), Math.imul(stepIndex, 7919) ^ 0x5bd1e995));
}

/**
 * The stochastic half of a hit. Always two draws, in this order: a call site that skipped the crit roll
 * because it cannot crit would still shift the stream and re-randomize every seeded run after it.
 */
function damageRoll(
  rng: Rng,
  luck: number,
  critChance: number,
): { variance: number; crit: boolean } {
  const variance = rng.int(3) - 1;
  const crit = rng.int(100) < Math.min(60, luck * 2 + critChance);
  return { variance, crit };
}

export interface EnemyState {
  id: string;
  /** Original enemy id (mastery keys off the species, not the instance). */
  species: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  elite: boolean;
  bossId?: string;
  turn: number;
  /** Boss phase index reached so far (0 = phase 1). */
  phaseIndex: number;
  element?: Element;
  weakness: Element;
  resistance: Element;
  affixes: string[];
  /** True once a Splitting enemy has spawned its copy. */
  split: boolean;
  statuses: StatusInstance[];
  turnsSinceStun: number;
}

/**
 * The roster a room opens with. Split out of `runCombat` so the on-screen threat readout prices the
 * same enemies the fight actually spawns.
 */
export function spawnEnemies(
  room: { enemies: readonly string[]; affixes?: string[] },
  floor: number,
  heat: number,
): EnemyState[] {
  const roomAffixes = room.affixes ?? [];
  const heatAtk = heat >= 1 ? 1.1 : 1; // Heat 1+: stronger enemies
  return room.enemies.map((id, i) => {
    const def = enemyById(id)!;
    const elite = ELITES.some((e) => e.id === id);
    const boss = BOSSES.find((e) => e.id === id);
    const s = scaledStats(def, floor, elite, boss !== undefined);
    const affixes = boss ? [] : roomAffixes;
    const armored = affixes.includes('armored');
    return {
      id: `${id}#${i}`,
      species: id,
      name: def.name,
      hp: s.hp,
      maxHp: s.hp,
      atk: Math.round(s.atk * heatAtk),
      def: armored ? s.def + Math.max(1, Math.round(s.def * 0.3)) : s.def,
      spd: s.spd + (affixes.includes('swift') ? 2 : 0),
      elite,
      bossId: boss?.id,
      turn: 0,
      phaseIndex: 0,
      element: def.element,
      weakness: def.weakness,
      resistance: def.resistance,
      affixes,
      split: false,
      statuses: affixes.includes('warded')
        ? [{ id: 'shield', stacks: 8, duration: Number.POSITIVE_INFINITY }]
        : [],
      turnsSinceStun: STUN_RESIST_GRACE,
    };
  });
}

export interface ShieldPart {
  /** Copy for the combat log. Empty for the room's own ward, which was never announced. */
  label: string;
  amount: number;
}

/**
 * The Shield a fight opens with: the room's ward, then the passive in play, then a Shield Charm.
 *
 * `levels` is the Dust ladder (§7 D.6), so a top-rung passive puts up the Shield its own LV5 line
 * states. An id that is not in the map is LV1 and grants exactly its printed amount.
 */
export function openingShield(
  run: RunState,
  modifiers: CombatModifiers,
  levels: Record<string, number> = {},
): ShieldPart[] {
  const parts: ShieldPart[] = [{ label: '', amount: modifiers.roomShield }];
  const s = runMoveset(run).passive;
  if (s && s.kind === 'passive') {
    const amount = passiveShieldAmount(s, levels[s.id]);
    if (amount > 0) parts.push({ label: `${s.name} grants ${amount} Shield.`, amount });
  }
  if (run.consumables.includes('shield-charm') && !run.consumablesUsed['shield-charm']) {
    parts.push({ label: 'Shield Charm: +8 Shield.', amount: 8 });
  }
  return parts;
}

export interface CombatDefence {
  def: number;
  hp: number;
  maxHp: number;
  damageReduction: number;
  shield: number;
}

/** Everything an enemy swing has to get through on the first action of a fight. */
export function openingDefence(
  run: RunState,
  modifiers: CombatModifiers,
  levels: Record<string, number> = {},
): CombatDefence {
  const base = companionBase(run.companionLevel);
  const maxHp = base.maxHp + modifiers.maxHp;
  let shield = 0;
  for (const part of openingShield(run, modifiers, levels)) shield += part.amount;
  return {
    def: base.def + modifiers.def,
    hp: Math.min(Math.max(0, run.unit.hp), maxHp),
    maxHp,
    damageReduction: modifiers.damageReduction,
    shield,
  };
}

function skillMultiplier(
  target: EnemyState,
  skill: SkillDef,
  knownWeaknesses: readonly Element[],
): number {
  const elem = skill.element;
  if (!elem) return 1;
  return elementMultiplier(
    elem,
    target.weakness,
    target.resistance,
    knownWeaknesses.includes(elem),
  );
}

/**
 * Everything a companion attack is priced from except the roll itself. A preview fills the same
 * shape from the run and the room's live roster, so an option the player was shown and the hit it
 * resolves are one computation rather than two descriptions of it (§4 A.3).
 */
export interface AttackContext {
  atk: number;
  critMult: number;
  eliteBonus: number;
  knownWeaknesses: readonly Element[];
  mastery: Record<string, number>;
  /** Dust levels by skill id (§7 D.6). A skill that is not in here is LV1 and prices unchanged. */
  skillLevels: Record<string, number>;
}

/** The exact inputs one companion attack resolves with; `roll` is the only part a preview guesses. */
export function attackInputFor(
  target: EnemyState,
  skill: SkillDef | null,
  ctx: AttackContext,
  roll: { variance: number; crit: boolean },
): AttackInput {
  const level = skill ? ctx.skillLevels[skill.id] : undefined;
  const fx = skill ? fxAtLevel(skill, level) : undefined;
  const potency = skill ? potencyMult(level ?? 1) : 1;
  return {
    atk: ctx.atk,
    power: skill?.power ?? 1,
    ...(potency > 1 ? { potency } : {}),
    def: target.def,
    variance: roll.variance,
    crit: roll.crit,
    critMult: ctx.critMult,
    burningBonus: fx?.burningBonus ?? 0,
    targetBurning: hasStatus(target.statuses, 'burn'),
    markMult: markDamageMult(target),
    elementMult: skill ? skillMultiplier(target, skill, ctx.knownWeaknesses) : 1,
    masteryLvl: masteryLevel(ctx.mastery[target.species] ?? 0),
    eliteBonus: ctx.eliteBonus,
    targetElite: target.elite,
    shield: statusShield(target.statuses),
    hp: target.hp,
    // Written only when the rung is bought, so an unpaid hit record stays the object it was before.
    ...(fx?.varianceFloor ? { varianceFloor: true } : {}),
  };
}

/**
 * Run one deterministic battle.
 *
 * Every companion action is an order: the loop asks `decide` for one each time and nothing fires
 * that the order did not name (§4 A.1) — energy, cooldowns, rolls, statuses, phases, enemy turns,
 * the `ROUND_CAP` and the log are untouched. A `null` order pauses the room and hands it back; the
 * caller asks the player and replays the stored orders to get here again.
 *
 * `skillLevels` is the Dust ladder's contribution (§7 D.6): an id that is not in the map, or is
 * LV1, prices exactly as it did before the ladder existed.
 */
export function runCombat(
  run: RunState,
  room: { kind?: string; enemies: string[]; affixes?: string[] },
  modifiers: CombatModifiers,
  floor: number,
  knownWeaknesses: readonly Element[] = [],
  studiedBosses: readonly string[] = [],
  mastery: Record<string, number> = {},
  decide: TurnDecider,
  skillLevels: Record<string, number> = {},
): CombatResult {
  const rng = combatRng(run.runId, run.stepIndex);
  const log: RunLogEntry[] = [];
  const step = run.stepIndex;
  const logLine = (text: string, data?: Record<string, unknown>): void => {
    log.push(data ? { step, type: 'combat', text, data } : { step, type: 'combat', text });
  };
  const studied = (id: string): boolean => studiedBosses.includes(id);

  const moveset = runMoveset(run);
  const actives = moveset.actives;
  const critBurn =
    moveset.passive && isPassiveFx(moveset.passive.fx) && moveset.passive.fx.kind === 'critBurn'
      ? moveset.passive
      : undefined;
  /** Rounds the Burn a critical lights, with the passive's own LV5 rung folded in. */
  const burnRounds = critBurn ? passiveCritBurnRounds(critBurn, skillLevels[critBurn.id]) : 0;

  const base = companionBase(run.companionLevel);
  const defence = openingDefence(run, modifiers, skillLevels);
  const maxHp = defence.maxHp;
  let hp = defence.hp;

  let energy = 0;
  const cooldowns: Record<string, number> = {};
  let statuses: StatusInstance[] = [];

  // Consumables: each fires at most once per run (consumablesUsed carries across combats).
  const used: Record<string, boolean> = { ...run.consumablesUsed };
  const hasConsumable = (id: string): boolean => run.consumables.includes(id) && !used[id];
  let fled = false;

  let shield = 0;
  for (const part of openingShield(run, modifiers, skillLevels)) {
    shield += part.amount;
    if (part.label) logLine(part.label);
  }
  if (hasConsumable('shield-charm')) used['shield-charm'] = true;
  const fireOil = hasConsumable('fire-oil');
  if (fireOil) {
    used['fire-oil'] = true;
    logLine('Fire Oil: enemies start Burning.');
  }

  const enemies = spawnEnemies(room, floor, run.heat);
  if (fireOil) {
    for (const e of enemies) e.statuses = applyStatus(e.statuses, 'burn', rng, {});
  }

  const atk = base.atk + modifiers.atk;
  const def = defence.def;
  const spd = base.spd + modifiers.spd;
  const luck = base.luck + modifiers.luck;

  /** Advance boss phases as HP crosses thresholds; studied bosses are named, others hidden. */
  function applyPhases(e: EnemyState): void {
    const boss = e.bossId ? BOSSES.find((b) => b.id === e.bossId) : undefined;
    if (!boss) return;
    const phases = bossPhases(boss, run.heat);
    if (e.phaseIndex >= phases.length) return;
    while (e.phaseIndex < phases.length) {
      const p = phases[e.phaseIndex]!;
      if (e.hp > Math.floor((e.maxHp * p.hpPercent) / 100)) break;
      e.phaseIndex += 1;
      logLine(
        studied(boss.id) ? `${e.name} enters ${p.name} — ${p.detail}!` : `${e.name} shifts stance!`,
      );
    }
  }

  /** Splitting: on death, spawn one copy at half max HP (once). */
  function maybeSplit(e: EnemyState): void {
    if (!e.affixes.includes('splitting') || e.split) return;
    e.split = true;
    const half = Math.max(1, Math.round(e.maxHp / SPLIT_HP_DIVISOR));
    enemies.push({
      ...e,
      id: `${e.id}#${enemies.length}`,
      hp: half,
      maxHp: half,
      statuses: [],
      affixes: e.affixes.filter((a) => a !== 'splitting'),
      split: false,
    });
    logLine(`${e.name} splits into a lesser copy!`);
  }

  /** Attach the itemization to the line the recap and the text log both read from. */
  const hitRecord = (
    side: HitRecord['side'],
    actor: string,
    target: string,
    input: AttackInput | IncomingInput,
    sum: DamageBreakdown,
    skillId?: string,
  ): Record<string, unknown> => {
    const record: HitRecord = { kind: 'hit', side, round, actor, target, input, sum };
    if (skillId) record.skillId = skillId;
    return { ...record };
  };

  /**
   * Land one swing's status. The status table decides the side it belongs to: a healing status mends
   * the companion even though the card reads "applies to the target". A LV5 `spread` rung puts the same
   * status on the first other living enemy, chosen in roster order — deterministic, and for anything
   * but Stun it costs no extra roll.
   */
  function landStatus(target: EnemyState, fx: ResolvedSkillFx): void {
    const id = fx.status;
    const statusDef = id ? statusById(id) : undefined;
    if (!id || !statusDef) return;
    if (statusDef.kind === 'hot') {
      const before = statuses;
      statuses = applyStatus(before, id, rng, { rounds: fx.statusRounds });
      if (statuses !== before) logLine(`You gain ${statusDef.name}.`);
      return;
    }
    const touched: EnemyState[] = [target];
    if (fx.spread) {
      const other = enemies.find((e) => e !== target && e.hp > 0);
      if (other) touched.push(other);
    }
    for (const enemy of touched) {
      const out = applyStatus(enemy.statuses, id, rng, {
        isBoss: enemy.bossId !== undefined,
        roundsSinceStun: enemy.turnsSinceStun,
        rounds: fx.statusRounds,
      });
      if (out !== enemy.statuses) {
        enemy.statuses = out;
        logLine(`${enemy.name} gains ${statusDef.name}.`);
      }
    }
  }

  const hitEnemy = (
    target: EnemyState,
    input: AttackInput,
    skill?: SkillDef,
    fx?: ResolvedSkillFx,
  ): void => {
    const sum = attackBreakdown(input);
    const dmg = sum.dealt;
    if (sum.absorbed > 0) {
      const absorbed = sum.absorbed;
      target.statuses = target.statuses
        .map((s) => (s.id === 'shield' ? { ...s, stacks: s.stacks - absorbed } : s))
        .filter((s) => s.stacks > 0);
      logLine(`${target.name}'s shield absorbs ${absorbed}.`);
    }
    target.hp -= dmg;
    const label = skill ? `use ${skill.name} (${skill.element}) and hit` : 'hit';
    const line = `${sum.crit ? 'CRIT! ' : ''}You ${label} ${target.name} for ${dmg}.`;
    logLine(
      `${line} (${damageSumText(sum)})`,
      hitRecord('player', 'You', target.name, input, sum, skill?.id),
    );
    if (skill?.element) {
      const mult = skillMultiplier(target, skill, knownWeaknesses);
      if (mult > 1) logLine(`Weakness! +25% ${skill.element} damage.`);
    }
    if (fx?.shieldPercent) {
      const gain = Math.round(dmg * fx.shieldPercent);
      shield += gain;
      logLine(`You gain ${gain} Shield.`);
    }
    if (fx?.status) landStatus(target, fx);
    if (sum.crit && critBurn) {
      const out = applyStatus(target.statuses, 'burn', rng, { rounds: burnRounds });
      if (out !== target.statuses) {
        target.statuses = out;
        logLine(`${target.name} gains Burn.`);
      }
    }
    if (bossTelegraph && target.bossId && sum.crit && skill && fx?.interruptsTelegraph) {
      bossTelegraph = false;
      guardActive = false;
      logLine(`${skill.name} interrupts the telegraph!`);
    }
    if (target.affixes.includes('thorned') && dmg > 0 && target.hp > 0) {
      hp -= THORN_DAMAGE;
      logLine(`${target.name}'s thorns cut you for ${THORN_DAMAGE}.`);
    }
    applyPhases(target);
    if (target.hp <= 0) {
      logLine(`${target.name} falls.`);
      maybeSplit(target);
    }
  };

  /**
   * Everything a round decision is allowed to read. The turn loop's menu and the card fallback are
   * priced from this one snapshot, so an option the player was shown and an option the engine could
   * have taken are never two different computations (§4 A.1).
   */
  const menuState = (): TurnState => ({
    round,
    energy,
    hp,
    maxHp,
    // Copies, not the live maps: a decider that keeps the menu it was handed must not watch the fight
    // rewrite it after the fact.
    cooldowns: { ...cooldowns },
    actives,
    targets: enemies
      .filter((e) => e.hp > 0)
      .map((e) => ({
        hp: e.hp,
        maxHp: e.maxHp,
        marked: hasStatus(e.statuses, 'mark'),
        weakness: e.weakness,
      })),
  });

  /**
   * Whether the rules can deliver this order right now, and what they deliver if they can. Nothing is
   * substituted: an order the round cannot honour stops the fight and asks again, because silently
   * swinging something else would make the number the menu printed a lie.
   */
  const honour = (order: TurnOrder): HonouredOrder | null => {
    // No consumable in the game can be activated inside a round yet, so an Item order is refused
    // rather than invented; the Item action needs the rules §4 A.3 assumes but `workshop.ts` lacks.
    if (order.consumableId) return null;
    if (order.guard) {
      // Bracing is the action of the round, so it cannot also name a swing.
      return order.skillId === null ? { brace: true } : null;
    }
    const living = enemies.filter((e) => e.hp > 0);
    const target =
      Number.isInteger(order.targetIndex) &&
      order.targetIndex >= 0 &&
      order.targetIndex < living.length
        ? living[order.targetIndex]
        : undefined;
    if (!target) return null;
    if (order.skillId === null) return { brace: false, target };
    const skill = actives.find((s) => s.id === order.skillId);
    if (!skill) return null;
    if ((cooldowns[skill.id] ?? 0) > 0) return null;
    if (energy < (skill.energyCost ?? 1)) return null;
    return { brace: false, skill, target };
  };

  /** The room, unfinished: the caller asks the player and replays these orders to get back here. */
  const pausedAt = (): CombatResult => ({
    won: false,
    drawn: false,
    fled,
    hpAfter: Math.max(0, hp),
    maxHp,
    rounds: round,
    // A paused room credits nothing. The replay that finishes it reports the kills and the post-fight
    // healing once, which is why the run state stores orders rather than results.
    kills: [],
    consumablesUsed: used,
    log,
    orders: [...ordersTaken],
    pause: {
      state: menuState(),
      enemies: enemies.map((e) => ({ ...e, statuses: [...e.statuses] })),
      shield,
      telegraphArmed: bossTelegraph,
      orders: [...ordersTaken],
      log: [...log],
    },
  });

  let bossTelegraph = false;
  /** True when a guard skill was cast during the current telegraph window. */
  let guardActive = false;
  /**
   * The round the player braced in, or 0 for none. Kept apart from `guardActive` because that one is
   * a boss-mechanic counter and survives rounds until the mechanic lands; a brace the player chose
   * covers every swing in its own round and nothing after it, which the round number makes explicit.
   */
  let bracedRound = 0;
  const ordersTaken: TurnOrder[] = [];
  let round = 1;

  for (; round <= ROUND_CAP; round++) {
    energy += 1;
    const order: ('c' | number)[] = ['c', ...enemies.map((_, i) => i)];
    order.sort((a, b2) => {
      const sa =
        a === 'c'
          ? effectiveSpd(spd, statuses)
          : effectiveSpd(enemies[a as number]!.spd, enemies[a as number]!.statuses);
      const sb =
        b2 === 'c'
          ? effectiveSpd(spd, statuses)
          : effectiveSpd(enemies[b2 as number]!.spd, enemies[b2 as number]!.statuses);
      if (sa !== sb) return sb - sa;
      if (a === 'c') return -1;
      if (b2 === 'c') return 1;
      return (a as number) - (b2 as number);
    });

    for (const actor of order) {
      if (enemies.every((e) => e.hp <= 0) || hp <= 0) break;

      if (actor === 'c') {
        if (hasStatus(statuses, 'stun')) {
          statuses = statuses.filter((s) => s.id !== 'stun');
          logLine('You are stunned and lose your turn.');
          continue;
        }
        const state = menuState();
        const order = decide(state);
        const acted = order === null ? null : honour(order);
        if (!order || !acted) return pausedAt();
        ordersTaken.push(order);
        if (acted.brace) {
          bracedRound = round;
          logLine('You brace, and take half of what lands this round.');
          continue;
        }
        const chosen = acted.skill;
        const target = acted.target;
        const fx = chosen ? fxAtLevel(chosen, skillLevels[chosen.id]) : undefined;
        if (chosen) {
          energy -= chosen.energyCost ?? 1;
          cooldowns[chosen.id] = chosen.cooldown ?? 1;
          if (bossTelegraph && chosen.role === 'guard') {
            guardActive = true;
            logLine('You brace your guard.');
          }
        }
        const roll = damageRoll(rng, luck, modifiers.critChance + (fx?.critPoints ?? 0));
        const input = attackInputFor(
          target,
          chosen ?? null,
          {
            atk,
            critMult: modifiers.critDamageMult,
            eliteBonus: modifiers.eliteDamageBonus,
            knownWeaknesses,
            mastery,
            skillLevels,
          },
          roll,
        );
        hitEnemy(target, input, chosen, fx);
        continue;
      }

      const e = enemies[actor as number]!;
      if (e.hp <= 0) continue;
      if (hasStatus(e.statuses, 'stun')) {
        e.statuses = e.statuses.filter((s) => s.id !== 'stun');
        e.turnsSinceStun = 0;
        e.turn += 1;
        if (bossTelegraph) {
          bossTelegraph = false;
          guardActive = false;
          logLine(`${e.name} is stunned — the mechanic is interrupted!`);
        } else {
          logLine(`${e.name} is stunned and loses its turn.`);
        }
        continue;
      }
      e.turn += 1;
      const boss = e.bossId ? BOSSES.find((b) => b.id === e.bossId) : undefined;
      if (boss && e.turn % boss.mechanicEvery === 0) {
        if (bossTelegraph) {
          const mult = mechanicMultiplier(boss, e.phaseIndex, run.heat);
          const guard = guardActive || bracedRound === round;
          if (guard) logLine('Your guard softens the blow.');
          guardActive = false;
          const input: IncomingInput = {
            atk: e.atk,
            def,
            variance: 0,
            damageReduction: modifiers.damageReduction,
            shield,
            hp,
            mechanic: { multiplier: mult, guard },
          };
          const sum = incomingBreakdown(input);
          shield -= sum.absorbed;
          hp -= sum.dealt;
          logLine(
            `${e.name} unleashes its mechanic! ${sum.absorbed > 0 ? `Shield absorbs ${sum.absorbed}. ` : ''}You take ${sum.dealt}. (${damageSumText(sum)})`,
            hitRecord('enemy', e.name, 'You', input, sum),
          );
          bossTelegraph = false;
        } else {
          bossTelegraph = true;
          logLine(
            studied(boss.id)
              ? `${e.name} telegraphs: next round, ${boss.mechanic}!`
              : `${e.name} telegraphs: a heavy attack is coming next round!`,
          );
        }
        continue;
      }
      const enraged = e.affixes.includes('enraged') && e.hp * 100 < e.maxHp * ENRAGE_HP_PERCENT;
      const atkNow = enraged ? Math.round(e.atk * ENRAGE_ATK_MULTIPLIER) : e.atk;
      const roll = damageRoll(rng, 0, 0);
      const input: IncomingInput = {
        atk: atkNow,
        def,
        variance: roll.variance,
        damageReduction: modifiers.damageReduction,
        shield,
        hp,
        // A brace is the player's choice, so it is recorded only when it actually happened: an
        // unbraced hit stays the exact object the intent forecast predicts.
        ...(bracedRound === round ? { guard: true } : {}),
      };
      const sum = incomingBreakdown(input);
      shield -= sum.absorbed;
      hp -= sum.dealt;
      energy += 1;
      logLine(
        `${e.name} hits for ${sum.dealt}${sum.absorbed > 0 ? ` (shield absorbs ${sum.absorbed})` : ''}. (${damageSumText(sum)})`,
        hitRecord('enemy', e.name, 'You', input, sum),
      );
      if (e.affixes.includes('vampiric') && sum.dealt > 0) {
        const drain = Math.max(1, Math.round(sum.dealt / VAMPIRIC_DRAIN_DIVISOR));
        e.hp = Math.min(e.maxHp, e.hp + drain);
        logLine(`${e.name} drains ${drain} HP.`);
      }
      if (e.affixes.includes('frenzied') && e.hp > 0 && hp > 0) {
        const roll2 = damageRoll(rng, 0, 0);
        const input2: IncomingInput = {
          atk: Math.max(1, Math.round(atkNow * FRENZY_FOLLOWUP_MULTIPLIER)),
          def,
          variance: roll2.variance,
          damageReduction: modifiers.damageReduction,
          shield,
          hp,
          ...(bracedRound === round ? { guard: true } : {}),
        };
        const sum2 = incomingBreakdown(input2);
        shield -= sum2.absorbed;
        hp -= sum2.dealt;
        energy += 1;
        logLine(
          `${e.name} strikes again for ${sum2.dealt}${sum2.absorbed > 0 ? ` (shield absorbs ${sum2.absorbed})` : ''}. (${damageSumText(sum2)})`,
          hitRecord('enemy', e.name, 'You', input2, sum2),
        );
      }
      // Smoke Scroll: a killing blow outside a boss room becomes a 1-HP escape.
      if (hp <= 0 && room.kind !== 'boss' && hasConsumable('smoke-scroll')) {
        hp = 1;
        fled = true;
        used['smoke-scroll'] = true;
        logLine('Smoke Scroll! You vanish in a puff and escape at 1 HP.');
        break;
      }
    }
    if (enemies.every((e) => e.hp <= 0) || hp <= 0 || fled) break;

    // End-of-round ticks: dots/hots fire, durations decrement, cooldowns tick down.
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (e.hp <= 0) continue;
      for (const s of e.statuses) {
        const defn: StatusDef = statusById(s.id)!;
        if (defn.kind === 'dot') {
          const dmg = (defn.perRound!.damage ?? 0) * s.stacks;
          e.hp -= dmg;
          logLine(
            s.id === 'burn'
              ? `${e.name} burns for ${dmg}.`
              : `${e.name} suffers ${dmg} ${defn.name} damage.`,
          );
        } else if (defn.kind === 'hot') {
          const heal = defn.perRound!.heal ?? 0;
          e.hp = Math.min(e.maxHp, e.hp + heal);
          logLine(`${e.name} regenerates ${heal} HP.`);
        }
      }
      applyPhases(e);
      if (e.hp <= 0) {
        logLine(`${e.name} falls.`);
        maybeSplit(e);
      }
      e.statuses = e.statuses
        .map((s) => ({ ...s, duration: s.id === 'stun' ? s.duration : s.duration - 1 }))
        .filter((s) => s.id === 'stun' || s.duration > 0);
      e.turnsSinceStun += 1;
    }
    for (const s of statuses) {
      const defn: StatusDef = statusById(s.id)!;
      if (defn.kind === 'dot') {
        const dmg = (defn.perRound!.damage ?? 0) * s.stacks;
        hp -= dmg;
        logLine(
          s.id === 'burn' ? `You burn for ${dmg}.` : `You suffer ${dmg} ${defn.name} damage.`,
        );
      } else if (defn.kind === 'hot') {
        const heal = defn.perRound!.heal ?? 0;
        hp = Math.min(maxHp, hp + heal);
        logLine(`You regenerate ${heal} HP.`);
      }
    }
    statuses = statuses
      .map((s) => ({ ...s, duration: s.id === 'stun' ? s.duration : s.duration - 1 }))
      .filter((s) => s.id === 'stun' || s.duration > 0);
    // Healing Draught: rescue at or below 30% HP, once per run.
    if (hasConsumable('healing-draught') && hp > 0 && hp <= Math.round(maxHp * 0.3)) {
      const heal = Math.round(maxHp * 0.5);
      hp = Math.min(maxHp, hp + heal);
      used['healing-draught'] = true;
      logLine(`Healing Draught: healed ${heal} HP.`);
    }
    if (hp <= 0 && room.kind !== 'boss' && hasConsumable('smoke-scroll')) {
      hp = 1;
      fled = true;
      used['smoke-scroll'] = true;
      logLine('Smoke Scroll! You vanish in a puff and escape at 1 HP.');
    }
    for (const id of Object.keys(cooldowns)) {
      if (cooldowns[id]! > 0) cooldowns[id]! -= 1;
    }
    if (enemies.every((e) => e.hp <= 0) || hp <= 0 || fled) break;
  }

  const won = enemies.every((e) => e.hp <= 0) && hp > 0 && !fled;
  const drawn = !won && !fled && hp > 0;
  let hpAfter = Math.max(0, hp);
  if (won && modifiers.healAfterCombat > 0) {
    const heal = Math.round((maxHp * modifiers.healAfterCombat) / 100);
    if (heal > 0) {
      hpAfter = Math.min(maxHp, hpAfter + heal);
      logLine(`You recover ${heal} HP after the fight.`);
    }
  }
  if (hasConsumable('healing-draught') && hpAfter > 0 && hpAfter <= Math.round(maxHp * 0.3)) {
    const heal = Math.round(maxHp * 0.5);
    hpAfter = Math.min(maxHp, hpAfter + heal);
    used['healing-draught'] = true;
    logLine(`Healing Draught: healed ${heal} HP.`);
  }
  const kills = enemies.filter((e) => e.hp <= 0).map((e) => e.species);
  return {
    won,
    drawn,
    fled,
    hpAfter,
    maxHp,
    rounds: round,
    kills,
    consumablesUsed: used,
    log,
    orders: ordersTaken,
  };
}
