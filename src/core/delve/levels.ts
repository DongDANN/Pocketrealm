/**
 * Skill Dust and the level ladder (DELVE_REDESIGN §7 D.6) — the one permanent axis a collection feeds.
 *
 * Two sources, one currency. A duplicate capsule pays its tier's dust on the spot (`DUST_BY_RARITY`,
 * drawn in `capsules.ts`), and a skill that actually gets swung pays 1 dust per ten uses when the run
 * settles. Levels cost 5 / 15 / 40 / 90 dust for LV2 through LV5 and each rung adds a flat 8% to that
 * skill's own potency, because §15 Risk 2 is sixty skills times five levels and a flat multiplier is
 * the part of that surface a person can still reason about.
 *
 * The use counter carries its remainder. §7 D.6 reads "every 10 uses of a skill in a run", and taken
 * strictly that discards the nine swings that did not finish a ten — which taxes exactly the retreat
 * that §2 invariant 5 says never to tax. So dust pays when the skill's *lifetime* uses cross a multiple
 * of ten, wherever those uses happened, and `uses` holds what is left toward the next one. A run that
 * ends early keeps every swing it made.
 *
 * Level 5 also attaches a modifier (§7 D.6), and `data/skills.ts`'s `Level5Fx` is the closed list of
 * six things it may do — every one a field `combat.ts` already applies. The prose the Codex prints and
 * the number the resolver folds in are pinned against each other by the catalogue test, because a
 * ladder whose top rung prints a promise the resolver cannot keep is the UI lie this project already
 * agreed not to ship. A build's own skills have no rung to attach, so they buy potency and nothing else.
 */

import { hitOf } from './damage';
import type { DelveMeta, RunState } from './types';

/** The top of the ladder, and the rung that attaches a catalogue skill's modifier (§7 D.6). */
export const MAX_SKILL_LEVEL = 5;

/** Dust that buys each rung. Indexed by the level being bought, so LV1 holds two empty slots. */
export const DUST_TO_LEVEL: readonly number[] = [0, 0, 5, 15, 40, 90];

/** §7 D.6: a flat +8% on the skill's own potency per rung above LV1. */
export const POTENCY_PER_LEVEL = 0.08;

/** §7 D.6: uses of one skill that pay 1 dust. */
export const USES_PER_DUST = 10;

function clampLevel(level: number | undefined): number {
  const value = Math.trunc(level ?? 1);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(MAX_SKILL_LEVEL, value);
}

/** The multiplier a level puts on its skill's power: LV1 is exactly the printed number, LV5 is +32%. */
export function potencyMult(level: number | undefined): number {
  return 1 + POTENCY_PER_LEVEL * (clampLevel(level) - 1);
}

/** The same curve as whole percent, for the line the screen prints. */
export function potencyPercent(level: number | undefined): number {
  return Math.round(POTENCY_PER_LEVEL * (clampLevel(level) - 1) * 100);
}

/** LV1 reads as no bonus at all, so a level the player has not bought never appears in a damage sum. */
export function isLeveled(level: number | undefined): boolean {
  return clampLevel(level) > 1;
}

/**
 * Whether a skill sits on the top rung, where §7 D.6 attaches its modifier.
 *
 * The comparison is an equality on purpose: a rung the book has not bought yet attaches nothing, and
 * the ladder has no sixth rung to overshoot into — `clampLevel` already caps it at five.
 */
export function reachesLevel5(level: number | undefined): boolean {
  return clampLevel(level) === MAX_SKILL_LEVEL;
}

/** Every owned skill and its level, in the shape combat and the menu price from. */
export function skillLevels(meta: DelveMeta): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, state] of Object.entries(meta.skills ?? {})) out[id] = clampLevel(state.level);
  return out;
}

/** The dust that buys `level`, or null when that rung is not for sale. */
export function dustToLevel(level: number): number | null {
  if (level < 2 || level > MAX_SKILL_LEVEL) return null;
  return DUST_TO_LEVEL[level] ?? null;
}

/**
 * Buy the next rung for one skill.
 *
 * A skill the book does not hold cannot be levelled, which is what makes the ladder a collection
 * progression rather than a shop: holding it is the prerequisite, and the only ways to hold one are a
 * capsule (§7 D.3) or having swung it enough for the run to write it down.
 */
export function levelUpSkill(
  meta: DelveMeta,
  id: string,
): { ok: boolean; meta: DelveMeta; reason: string } {
  const state = meta.skills?.[id];
  if (!state) {
    return { ok: false, meta, reason: 'The companion does not hold that skill yet.' };
  }
  const level = clampLevel(state.level);
  const nextLevel = level + 1;
  if (nextLevel > MAX_SKILL_LEVEL) {
    return { ok: false, meta, reason: `That skill is already LV${MAX_SKILL_LEVEL}.` };
  }
  const cost = dustToLevel(nextLevel)!;
  const wallet = meta.dust ?? 0;
  if (wallet < cost) {
    return {
      ok: false,
      meta,
      reason: `LV${nextLevel} costs ${cost} Skill Dust and this book has ${wallet}.`,
    };
  }
  return {
    ok: true,
    reason: `Raised the skill to LV${nextLevel} (+${potencyPercent(nextLevel)}% potency).`,
    meta: {
      ...meta,
      dust: wallet - cost,
      skills: { ...meta.skills, [id]: { ...state, level: nextLevel } },
    },
  };
}

/**
 * How many times each skill was swung in this run, read from the hit records the fight already wrote.
 *
 * The record is the one the recap reconciles against (§7 A.3), so a swing counts exactly once and
 * exactly when it landed: a room that is still waiting for an order has committed nothing, and neither
 * has a basic attack, which carries no skill id and therefore earns no dust.
 */
export function usesFromLog(run: RunState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of run.log) {
    const hit = hitOf(entry);
    if (!hit || hit.side !== 'player' || !hit.skillId) continue;
    out[hit.skillId] = (out[hit.skillId] ?? 0) + 1;
  }
  return out;
}

/**
 * Pay a run's uses into the book: dust for every ten lifetime uses crossed, and the remainder kept.
 *
 * A skill with no entry gains one here, at LV1. That is how a build's own two skills become visible
 * progression targets without being capsule prizes, and it is why the entry appears on the first swing
 * rather than on the tenth — the screen can then show 3/10 instead of nothing.
 */
export function settleSkillUses(
  meta: DelveMeta,
  uses: Record<string, number>,
): { meta: DelveMeta; dustGained: number; byId: Record<string, number> } {
  const owned = meta.skills ?? {};
  const next: DelveMeta['skills'] = { ...owned };
  const byId: Record<string, number> = {};
  let dustGained = 0;
  for (const [id, count] of Object.entries(uses)) {
    if (count <= 0) continue;
    const state = owned[id] ?? { level: 1, uses: 0, lifetime: 0 };
    const lifetime = state.lifetime + count;
    const payout =
      Math.floor(lifetime / USES_PER_DUST) - Math.floor(state.lifetime / USES_PER_DUST);
    if (payout > 0) {
      dustGained += payout;
      byId[id] = payout;
    }
    next[id] = { level: state.level, uses: lifetime % USES_PER_DUST, lifetime };
  }
  return { meta: { ...meta, skills: next, dust: (meta.dust ?? 0) + dustGained }, dustGained, byId };
}
