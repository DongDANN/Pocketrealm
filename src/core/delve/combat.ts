/**
 * Deterministic round-based auto-battle. SPD sets turn order; damage is ATK vs DEF with seeded
 * variance and LUCK-driven crits. Bosses telegraph their mechanic one round ahead. Combat
 * terminates at a hard 40-round cap, which counts as a safe retreat with no loss.
 *
 * Gate 1.6 layers: the selected build supplies two active skills (energy, cooldowns) and a
 * passive; statuses (burn/poison/chill/stun/mark/regen) tick every round and clear after combat;
 * skill attacks carry an element and hit ±25% weakness/resistance (weakness only once the codex
 * knows it, resistance always). Affixes (armored/swift/vampiric/splitting/enraged/thorned/
 * warded/frenzied) modify enemy stats and behavior; bosses enter harder phases at 66%/33% HP
 * with three counters to telegraphed mechanics: guard skills halve them, stun interrupts them,
 * and critical interrupts-telegraph skills cancel them. Boss Study reveals names and tells.
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
import {
  BOSSES,
  ELITES,
  enemyById,
  scaledStats,
  type BossDef,
  type BossPhase,
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
import {
  cardById,
  evaluateCards,
  resolveCardAction,
  type CardCombatState,
  type CardDef,
} from './data/habitCards';
import {
  STUN_BOSS_RESIST,
  STUN_RECENT_RESIST,
  STUN_RESIST_GRACE,
  statusById,
  type StatusDef,
} from './data/statuses';
import type { RunLogEntry, RunState, StatusInstance } from './types';

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

/** Apply a status with its stacking rules. Stun rolls boss/recent resistance (seeded). */
export function applyStatus(
  statuses: StatusInstance[],
  id: string,
  rng: Rng,
  opts: { isBoss?: boolean; roundsSinceStun?: number } = {},
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
  const maxStacks = def.maxStacks ?? 1;
  const existing = statuses.find((s) => s.id === id);
  if (!existing) {
    const stacks =
      def.stacking === 'add' ? Math.min(def.amount ?? 1, maxStacks) : Math.min(1, maxStacks);
    return [...statuses, { id, stacks, duration: def.duration }];
  }
  const stacks =
    def.stacking === 'stack' || def.stacking === 'add'
      ? Math.min(existing.stacks + (def.stacking === 'add' ? (def.amount ?? 1) : 1), maxStacks)
      : existing.stacks;
  return statuses.map((s) => (s.id === id ? { ...s, stacks, duration: def.duration } : s));
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

function isPassiveFx(fx: SkillDef['fx']): fx is PassiveFx {
  return !!fx && 'kind' in fx;
}

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

interface EnemyState {
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

/** Run one deterministic battle. Companion casts ready skills (most expensive first), else basics. */
export function runCombat(
  run: RunState,
  room: { kind?: string; enemies: string[]; affixes?: string[] },
  modifiers: CombatModifiers,
  floor: number,
  knownWeaknesses: readonly Element[] = [],
  studiedBosses: readonly string[] = [],
  mastery: Record<string, number> = {},
): CombatResult {
  const rng = combatRng(run.runId, run.stepIndex);
  const log: RunLogEntry[] = [];
  const step = run.stepIndex;
  const logLine = (text: string, data?: Record<string, unknown>): void => {
    log.push(data ? { step, type: 'combat', text, data } : { step, type: 'combat', text });
  };
  const studied = (id: string): boolean => studiedBosses.includes(id);

  const build = buildById(run.buildId) ?? buildById(DEFAULT_BUILD)!;
  const actives = build.skills.filter((s): s is SkillDef => s.kind === 'active');
  const critBurn = build.skills.find(
    (s) => s.kind === 'passive' && isPassiveFx(s.fx) && s.fx.kind === 'critBurn',
  );

  const base = companionBase(run.companionLevel);
  const maxHp = base.maxHp + modifiers.maxHp;
  let hp = Math.min(Math.max(0, run.unit.hp), maxHp);
  let shield = modifiers.roomShield;
  for (const s of build.skills) {
    if (s.kind === 'passive' && isPassiveFx(s.fx) && s.fx.kind === 'startShield') {
      shield += s.fx.amount;
      logLine(`${s.name} grants ${s.fx.amount} Shield.`);
    }
  }

  let energy = 0;
  const cooldowns: Record<string, number> = {};
  let statuses: StatusInstance[] = [];

  // Consumables: each fires at most once per run (consumablesUsed carries across combats).
  const used: Record<string, boolean> = { ...run.consumablesUsed };
  const hasConsumable = (id: string): boolean => run.consumables.includes(id) && !used[id];
  let fled = false;

  if (hasConsumable('shield-charm')) {
    shield += 8;
    used['shield-charm'] = true;
    logLine('Shield Charm: +8 Shield.');
  }
  const fireOil = hasConsumable('fire-oil');
  if (fireOil) {
    used['fire-oil'] = true;
    logLine('Fire Oil: enemies start Burning.');
  }

  const roomAffixes = room.affixes ?? [];
  const heatAtk = run.heat >= 1 ? 1.1 : 1; // Heat 1+: stronger enemies
  const enemies: EnemyState[] = room.enemies.map((id, i) => {
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
  if (fireOil) {
    for (const e of enemies) e.statuses = applyStatus(e.statuses, 'burn', rng, {});
  }

  const atk = base.atk + modifiers.atk;
  const def = base.def + modifiers.def;
  const spd = base.spd + modifiers.spd;
  const luck = base.luck + modifiers.luck;

  const markMultOf = (target: EnemyState): number =>
    hasStatus(target.statuses, 'mark') ? (statusById('mark')!.perRound!.dmgTakenMult ?? 1) : 1;

  /** Boss phases for this fight: Heat 3+ appends the boss's extra final phase. */
  const bossPhasesOf = (boss: BossDef): BossPhase[] => {
    const base = boss.phases ?? [];
    return run.heat >= 3 && boss.heatPhase ? [...base, boss.heatPhase] : base;
  };

  /** Advance boss phases as HP crosses thresholds; studied bosses are named, others hidden. */
  function applyPhases(e: EnemyState): void {
    const boss = e.bossId ? BOSSES.find((b) => b.id === e.bossId) : undefined;
    if (!boss) return;
    const phases = bossPhasesOf(boss);
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
    const half = Math.max(1, Math.round(e.maxHp / 2));
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

  const hitEnemy = (target: EnemyState, input: AttackInput, skill?: SkillDef): void => {
    const sum = attackBreakdown(input);
    const dmg = sum.dealt;
    const fx = skill?.fx;
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
    if (fx && !isPassiveFx(fx) && fx.shieldPercent) {
      const gain = Math.round(dmg * fx.shieldPercent);
      shield += gain;
      logLine(`You gain ${gain} Shield.`);
    }
    if (fx && !isPassiveFx(fx) && fx.status) {
      const out = applyStatus(target.statuses, fx.status, rng, {
        isBoss: target.bossId !== undefined,
        roundsSinceStun: target.turnsSinceStun,
      });
      if (out !== target.statuses) {
        target.statuses = out;
        const def = statusById(fx.status)!;
        logLine(`${target.name} gains ${def.name}.`);
      }
    }
    if (sum.crit && critBurn && isPassiveFx(critBurn.fx) && critBurn.fx.kind === 'critBurn') {
      const out = applyStatus(target.statuses, 'burn', rng, {});
      if (out !== target.statuses) {
        target.statuses = out;
        logLine(`${target.name} gains Burn.`);
      }
    }
    if (
      bossTelegraph &&
      target.bossId &&
      sum.crit &&
      skill &&
      fx &&
      !isPassiveFx(fx) &&
      fx.interruptsTelegraph
    ) {
      bossTelegraph = false;
      guardActive = false;
      logLine(`${skill.name} interrupts the telegraph!`);
    }
    if (target.affixes.includes('thorned') && dmg > 0 && target.hp > 0) {
      hp -= 2;
      logLine(`${target.name}'s thorns cut you for 2.`);
    }
    applyPhases(target);
    if (target.hp <= 0) {
      logLine(`${target.name} falls.`);
      maybeSplit(target);
    }
  };

  let bossTelegraph = false;
  /** True when a guard skill was cast during the current telegraph window. */
  let guardActive = false;
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
        const equipped = (run.cards ?? [])
          .map((id) => cardById(id))
          .filter((c): c is CardDef => c !== undefined)
          .slice(0, 3);
        let chosen: SkillDef | undefined;
        let attackMarked = false;
        if (equipped.length > 0) {
          const state: CardCombatState = {
            round,
            energy,
            hp,
            maxHp,
            cooldowns,
            actives,
            targets: enemies
              .filter((e) => e.hp > 0)
              .map((e) => ({
                hp: e.hp,
                maxHp: e.maxHp,
                marked: hasStatus(e.statuses, 'mark'),
                weakness: e.weakness,
              })),
          };
          const decision = evaluateCards(equipped, state);
          const skippedTxt = decision.skipped.map((s) => `${s.name} (${s.reason})`).join(', ');
          if (decision.fired) {
            logLine(
              `Cards: fired ${decision.fired.name}${skippedTxt ? `; skipped ${skippedTxt}` : ''}.`,
            );
            const res = resolveCardAction(decision.fired.action, state);
            chosen = res.skill;
            attackMarked = !!res.attackMarked;
          } else {
            logLine(`Cards: none fired${skippedTxt ? `; skipped ${skippedTxt}` : ''}.`);
          }
        } else {
          const ready = actives.filter(
            (s) => (cooldowns[s.id] ?? 0) <= 0 && energy >= (s.energyCost ?? 1),
          );
          for (const s of ready) {
            if (!chosen || (s.energyCost ?? 1) > (chosen.energyCost ?? 1)) chosen = s;
          }
        }
        const target = attackMarked
          ? (enemies.find((e) => e.hp > 0 && hasStatus(e.statuses, 'mark')) ??
            enemies.find((e) => e.hp > 0)!)
          : enemies.find((e) => e.hp > 0)!;
        const fx = chosen?.fx;
        const bonusCrit = fx && !isPassiveFx(fx) ? (fx.bonusCrit ?? 0) : 0;
        if (chosen) {
          energy -= chosen.energyCost ?? 1;
          cooldowns[chosen.id] = chosen.cooldown ?? 1;
          if (bossTelegraph && chosen.role === 'guard') {
            guardActive = true;
            logLine('You brace your guard.');
          }
        }
        const roll = damageRoll(rng, luck, modifiers.critChance + bonusCrit);
        const input: AttackInput = {
          atk,
          power: chosen?.power ?? 1,
          def: target.def,
          variance: roll.variance,
          crit: roll.crit,
          critMult: modifiers.critDamageMult,
          burningBonus: fx && !isPassiveFx(fx) ? (fx.bonusIfBurning ?? 0) : 0,
          targetBurning: hasStatus(target.statuses, 'burn'),
          markMult: markMultOf(target),
          elementMult: chosen ? skillMultiplier(target, chosen, knownWeaknesses) : 1,
          masteryLvl: Math.min(10, Math.floor((mastery[target.species] ?? 0) / 10)),
          eliteBonus: modifiers.eliteDamageBonus,
          targetElite: target.elite,
          shield: statusShield(target.statuses),
          hp: target.hp,
        };
        hitEnemy(target, input, chosen);
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
          const phases = bossPhasesOf(boss);
          const phase = e.phaseIndex > 0 ? phases[e.phaseIndex - 1] : undefined;
          const mult = phase?.mechanicMultiplier ?? boss.mechanicMultiplier;
          const guard = guardActive;
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
      const enraged = e.affixes.includes('enraged') && e.hp * 100 < e.maxHp * 30;
      const atkNow = enraged ? Math.round(e.atk * 1.5) : e.atk;
      const roll = damageRoll(rng, 0, 0);
      const input: IncomingInput = {
        atk: atkNow,
        def,
        variance: roll.variance,
        damageReduction: modifiers.damageReduction,
        shield,
        hp,
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
        const drain = Math.max(1, Math.round(sum.dealt / 2));
        e.hp = Math.min(e.maxHp, e.hp + drain);
        logLine(`${e.name} drains ${drain} HP.`);
      }
      if (e.affixes.includes('frenzied') && e.hp > 0 && hp > 0) {
        const roll2 = damageRoll(rng, 0, 0);
        const input2: IncomingInput = {
          atk: Math.max(1, Math.round(atkNow * 0.6)),
          def,
          variance: roll2.variance,
          damageReduction: modifiers.damageReduction,
          shield,
          hp,
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
  return { won, drawn, fled, hpAfter, maxHp, rounds: round, kills, consumablesUsed: used, log };
}
