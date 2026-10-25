/**
 * Knowledge and mastery (SPEC 6.11 K). First sightings open codex entries; kills against a
 * species level mastery (10 XP per kill, 10 XP per level, capped at level 10), which reveals
 * stats (level 1), then weakness (level 2), then lore (level 3), and grants +1% damage per
 * level against that species. A fully mastered codex unlocks a cosmetic.
 */

import { ENEMIES, ELITES, BOSSES, enemyById } from './data/enemies';
import type { DelveMeta } from './types';

export const MASTERY_XP_PER_KILL = 10;
export const MAX_MASTERY_LEVEL = 10;
/** All species (ordinaries + elites + bosses); codex completion counts these. */
export const CODEX_SPECIES = [...ENEMIES, ...ELITES, ...BOSSES].map((e) => e.id);

export function masteryLevel(xp: number): number {
  return Math.min(MAX_MASTERY_LEVEL, Math.floor(Math.max(0, Math.trunc(xp)) / MASTERY_XP_PER_KILL));
}

/** Damage bonus percent against a species: +1% per mastery level, capped at +10%. */
export function masteryDamagePct(xp: number): number {
  return masteryLevel(xp);
}

/** Which codex details a mastery level reveals. */
export function codexReveals(xp: number): { stats: boolean; weakness: boolean; lore: boolean } {
  const lvl = masteryLevel(xp);
  return { stats: lvl >= 1, weakness: lvl >= 2, lore: lvl >= 3 };
}

/** Add kill XP (Library multiplier applies), reveal weaknesses at level 2, cap XP at 100. */
export function gainMastery(meta: DelveMeta, kills: readonly string[], mult = 1): DelveMeta {
  const mastery = { ...(meta.mastery ?? {}) };
  let known = meta.knownWeaknesses ?? [];
  const perKill = Math.round(MASTERY_XP_PER_KILL * mult);
  for (const id of kills) {
    const before = mastery[id] ?? 0;
    const after = Math.min(100, before + perKill);
    mastery[id] = after;
    if (masteryLevel(before) < 2 && masteryLevel(after) >= 2) {
      const def = enemyById(id);
      if (def) known = [...new Set([...known, def.weakness])];
    }
  }
  return { ...meta, mastery, knownWeaknesses: known };
}

export interface CodexProgress {
  seen: number;
  total: number;
  /** True when every species has reached lore level (3+). */
  complete: boolean;
}

export function codexProgress(meta: DelveMeta): CodexProgress {
  const seen = meta.codex?.length ?? 0;
  const complete = CODEX_SPECIES.every((id) => masteryLevel(meta.mastery?.[id] ?? 0) >= 3);
  return { seen, total: CODEX_SPECIES.length, complete };
}

/** Cosmetic unlocks granted by codex completion. */
export function codexUnlocks(meta: DelveMeta): string[] {
  return codexProgress(meta).complete ? ['codex-sage'] : [];
}
