/**
 * Deterministic round-based auto-battle. SPD sets turn order; damage is ATK vs DEF with seeded
 * variance and LUCK-driven crits. Bosses telegraph their mechanic one round ahead. Combat
 * terminates at a hard 40-round cap, which counts as a safe retreat with no loss.
 */

import { hashCombine, hashString, mulberry32, type Rng } from '../rng';
import { boonById, type Boon } from './data/boons';
import { BOSSES, ELITES, enemyById, scaledStats } from './data/enemies';
import type { RunLogEntry, RunState } from './types';

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

function countTag(boons: readonly Boon[], tag: string): number {
  return boons.filter((x) => x.tag === tag).length;
}

function resolveBoons(ids: readonly string[]): Boon[] {
  const out: Boon[] = [];
  for (const id of ids) {
    const x = boonById(id);
    if (x) out.push(x);
  }
  return out;
}

/** Sum boon stats, tag bonuses (3/5 thresholds), relics, Forge, and budget buffs. */
export function computeModifiers(
  run: RunState,
  forgeTotals: Record<string, number>,
  buffs: { wardHp: number; luckBonus: number },
): CombatModifiers {
  const m: CombatModifiers = { ...BASE_MODIFIERS };
  const boons = resolveBoons(run.boons);
  for (const b of boons) {
    const fx = b.fx;
    if (fx.kind === 'stat') m[fx.stat] += fx.add;
    else if (fx.kind === 'critChance') m.critChance += fx.add;
    else if (fx.kind === 'critDamage') m.critDamageMult += fx.mult;
    else if (fx.kind === 'roomShield') m.roomShield += fx.amount;
    else if (fx.kind === 'damageReduction') m.damageReduction += fx.percent;
    else if (fx.kind === 'healAfterCombat') m.healAfterCombat += fx.percent;
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

export interface CombatResult {
  won: boolean;
  drawn: boolean;
  hpAfter: number;
  maxHp: number;
  rounds: number;
  log: RunLogEntry[];
}

export function combatRng(runId: string, stepIndex: number): Rng {
  return mulberry32(hashCombine(hashString(runId), Math.imul(stepIndex, 7919) ^ 0x5bd1e995));
}

function rollDamage(
  rng: Rng,
  atk: number,
  def: number,
  luck: number,
  critChance: number,
  critMult: number,
): { dmg: number; crit: boolean } {
  const variance = rng.int(3) - 1;
  const raw = Math.max(1, atk + variance - def);
  const crit = rng.int(100) < Math.min(60, luck * 2 + critChance);
  return { dmg: crit ? Math.max(raw, Math.round(raw * critMult)) : raw, crit };
}

interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  elite: boolean;
  bossId?: string;
  turn: number;
}

/** Run one deterministic battle. Companion always attacks the first living enemy (1.5). */
export function runCombat(
  run: RunState,
  room: { enemies: string[] },
  modifiers: CombatModifiers,
  floor: number,
): CombatResult {
  const rng = combatRng(run.runId, run.stepIndex);
  const log: RunLogEntry[] = [];
  const step = run.stepIndex;
  const logLine = (text: string): void => {
    log.push({ step, type: 'combat', text });
  };

  const base = companionBase(run.companionLevel);
  const maxHp = base.maxHp + modifiers.maxHp;
  let hp = Math.min(Math.max(0, run.unit.hp), maxHp);
  let shield = modifiers.roomShield;

  const enemies: EnemyState[] = room.enemies.map((id, i) => {
    const def = enemyById(id)!;
    const elite = ELITES.some((e) => e.id === id);
    const boss = BOSSES.find((e) => e.id === id);
    const s = scaledStats(def, floor, elite, boss !== undefined);
    return {
      id: `${id}#${i}`,
      name: def.name,
      hp: s.hp,
      maxHp: s.hp,
      atk: s.atk,
      def: s.def,
      spd: s.spd,
      elite,
      bossId: boss?.id,
      turn: 0,
    };
  });

  const atk = base.atk + modifiers.atk;
  const def = base.def + modifiers.def;
  const spd = base.spd + modifiers.spd;
  const luck = base.luck + modifiers.luck;
  let bossTelegraph = false;
  let round = 1;

  for (; round <= ROUND_CAP; round++) {
    const order: ('c' | number)[] = ['c', ...enemies.map((_, i) => i)];
    order.sort((a, b2) => {
      const sa = a === 'c' ? spd : enemies[a as number]!.spd;
      const sb = b2 === 'c' ? spd : enemies[b2 as number]!.spd;
      if (sa !== sb) return sb - sa;
      if (a === 'c') return -1;
      if (b2 === 'c') return 1;
      return (a as number) - (b2 as number);
    });

    for (const actor of order) {
      if (enemies.every((e) => e.hp <= 0) || hp <= 0) break;

      if (actor === 'c') {
        const target = enemies.find((e) => e.hp > 0)!;
        const roll = rollDamage(
          rng,
          atk,
          target.def,
          luck,
          modifiers.critChance,
          modifiers.critDamageMult,
        );
        let dmg = roll.dmg;
        if (target.elite) dmg = Math.round((dmg * (100 + modifiers.eliteDamageBonus)) / 100);
        target.hp -= dmg;
        logLine(
          roll.crit
            ? `CRIT! You hit ${target.name} for ${dmg}.`
            : `You hit ${target.name} for ${dmg}.`,
        );
        if (target.hp <= 0) logLine(`${target.name} falls.`);
        continue;
      }

      const e = enemies[actor as number]!;
      if (e.hp <= 0) continue;
      e.turn += 1;
      const boss = e.bossId ? BOSSES.find((b) => b.id === e.bossId) : undefined;
      if (boss && e.turn % boss.mechanicEvery === 0) {
        if (bossTelegraph) {
          const raw = Math.max(1, Math.round(e.atk * boss.mechanicMultiplier) + 2 - def);
          const reduced = Math.round((raw * (100 - modifiers.damageReduction)) / 100);
          const absorbed = Math.min(shield, reduced);
          shield -= absorbed;
          hp -= reduced - absorbed;
          logLine(
            `${e.name} unleashes its mechanic! ${absorbed > 0 ? `Shield absorbs ${absorbed}. ` : ''}You take ${reduced - absorbed}.`,
          );
          bossTelegraph = false;
        } else {
          bossTelegraph = true;
          logLine(`${e.name} telegraphs: next round, ${boss.mechanic}!`);
        }
        continue;
      }
      const roll = rollDamage(rng, e.atk, def, 0, 0, 1);
      const reduced = Math.round((roll.dmg * (100 - modifiers.damageReduction)) / 100);
      const absorbed = Math.min(shield, reduced);
      shield -= absorbed;
      hp -= reduced - absorbed;
      logLine(
        `${e.name} hits for ${reduced - absorbed}${absorbed > 0 ? ` (shield absorbs ${absorbed})` : ''}.`,
      );
    }
    if (enemies.every((e) => e.hp <= 0) || hp <= 0) break;
  }

  const won = enemies.every((e) => e.hp <= 0) && hp > 0;
  const drawn = !won && hp > 0;
  let hpAfter = Math.max(0, hp);
  if (won && modifiers.healAfterCombat > 0) {
    const heal = Math.round((maxHp * modifiers.healAfterCombat) / 100);
    if (heal > 0) {
      hpAfter = Math.min(maxHp, hpAfter + heal);
      logLine(`You recover ${heal} HP after the fight.`);
    }
  }
  return { won, drawn, hpAfter, maxHp, rounds: round, log };
}
