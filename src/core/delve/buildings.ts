/**
 * Realm buildings (SPEC 6.11 H, small version). Each building unlocks from a real budgeting
 * milestone — savings goals, reviews, consistency — never from spending less or hiding spending.
 * Upgrades spend materials and Embers; combined building bonuses are capped at +10% Delve power
 * (each upgrade contributes 5%, so at most two buildings can be upgraded).
 */

import type { DelveMeta, Materials } from './types';

export interface BuildingDef {
  id: string;
  name: string;
  maxLevel: number;
  /** The real-life milestone that unlocks it (process/savings only, never underspend). */
  milestone: string;
  /** Human-readable bonus for logs and UI. */
  effect: string;
  /** Upgrade cost from `level` to `level + 1`. */
  cost: (level: number) => Materials & { embers: number };
}

export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'treasury',
    name: 'Treasury',
    maxLevel: 2,
    milestone: 'Reach your first savings goal.',
    effect: '+10 starting Glint per level (runs start richer).',
    cost: () => ({ ore: 4, herb: 2, echo: 0, embers: 40 }),
  },
  {
    id: 'library',
    name: 'Library',
    maxLevel: 2,
    milestone: 'Complete your first weekly review.',
    effect: '+10% mastery gain per level (the codex fills faster).',
    cost: () => ({ ore: 2, herb: 4, echo: 0, embers: 40 }),
  },
  {
    id: 'smithy',
    name: 'Smithy',
    maxLevel: 2,
    milestone: 'Reach companion level 10.',
    effect: '+3% companion ATK per level (gear tempering).',
    cost: () => ({ ore: 6, herb: 0, echo: 0, embers: 50 }),
  },
  {
    id: 'observatory',
    name: 'Observatory',
    maxLevel: 2,
    milestone: 'Log an entry on 30 total days.',
    effect: 'See one extra map row ahead per level.',
    cost: () => ({ ore: 2, herb: 0, echo: 2, embers: 50 }),
  },
  {
    id: 'workshop',
    name: 'Workshop',
    maxLevel: 2,
    milestone: 'Always available (crafting is core).',
    effect: 'Upgrade cuts the Ember part of craft costs by 20%.',
    cost: () => ({ ore: 3, herb: 3, echo: 0, embers: 60 }),
  },
];

export function buildingById(id: string): BuildingDef | undefined {
  return BUILDINGS.find((b) => b.id === id);
}

/** Combined building bonus cap (SPEC: +10% Delve power). */
export const BUILDING_POWER_CAP = 10;
/** Each upgrade contributes 5% toward the cap, so at most two buildings can be upgraded. */
const POWER_PER_UPGRADE = 5;

/** Total Delve-power percentage contributed by building upgrades (capped at BUILDING_POWER_CAP). */
export function buildingPower(levels: Record<string, number>): number {
  let total = 0;
  for (const [id, lvl] of Object.entries(levels)) {
    if (!buildingById(id)) continue;
    total += Math.max(0, Math.trunc(lvl) - 1) * POWER_PER_UPGRADE;
  }
  return Math.min(BUILDING_POWER_CAP, total);
}

export interface MilestoneInput {
  savingsGoalReached: boolean;
  weeklyReviewDone: boolean;
  companionLevel: number;
  totalLoggedDays: number;
}

/** Which buildings each real budgeting milestone unlocks. Workshop is always available. */
export function buildingMilestones(input: MilestoneInput): Record<string, boolean> {
  return {
    treasury: input.savingsGoalReached,
    library: input.weeklyReviewDone,
    smithy: input.companionLevel >= 10,
    observatory: input.totalLoggedDays >= 30,
    workshop: true,
  };
}

/** Unlock a building (level 0 → 1) when its milestone is met. */
export function unlockBuilding(
  meta: DelveMeta,
  id: string,
  milestones: Record<string, boolean>,
): { meta: DelveMeta; ok: boolean; reason: string } {
  const def = buildingById(id);
  if (!def) return { meta, ok: false, reason: 'Unknown building.' };
  const levels = meta.buildingLevels ?? {};
  if ((levels[id] ?? 0) >= 1) return { meta, ok: false, reason: 'Already unlocked.' };
  if (!milestones[id]) return { meta, ok: false, reason: `Milestone not met: ${def.milestone}` };
  return {
    meta: { ...meta, buildingLevels: { ...levels, [id]: 1 } },
    ok: true,
    reason: `${def.name} unlocked.`,
  };
}

/** Upgrade an unlocked building, spending materials and Embers within the power cap. */
export function upgradeBuilding(
  meta: DelveMeta,
  id: string,
): { meta: DelveMeta; ok: boolean; reason: string } {
  const def = buildingById(id);
  if (!def) return { meta, ok: false, reason: 'Unknown building.' };
  const levels = meta.buildingLevels ?? {};
  const lvl = levels[id] ?? 0;
  if (lvl < 1) return { meta, ok: false, reason: 'Not unlocked yet.' };
  if (lvl >= def.maxLevel) return { meta, ok: false, reason: 'Already at max level.' };
  if (buildingPower(levels) + POWER_PER_UPGRADE > BUILDING_POWER_CAP) {
    return {
      meta,
      ok: false,
      reason: `Building bonuses are capped at +${BUILDING_POWER_CAP}% Delve power.`,
    };
  }
  const cost = def.cost(lvl);
  const mats = meta.materials ?? { ore: 0, herb: 0, echo: 0 };
  if (mats.ore < cost.ore || mats.herb < cost.herb || mats.echo < cost.echo) {
    return { meta, ok: false, reason: 'Not enough materials.' };
  }
  if (meta.embers < cost.embers) return { meta, ok: false, reason: 'Not enough Embers.' };
  return {
    meta: {
      ...meta,
      embers: meta.embers - cost.embers,
      materials: {
        ore: mats.ore - cost.ore,
        herb: mats.herb - cost.herb,
        echo: mats.echo - cost.echo,
      },
      buildingLevels: { ...levels, [id]: lvl + 1 },
    },
    ok: true,
    reason: `${def.name} upgraded to level ${lvl + 1}.`,
  };
}

/** Library: mastery gain multiplier (level 1 = +10%, level 2 = +20%). */
export function masteryMult(meta: DelveMeta): number {
  return 1 + 0.1 * (meta.buildingLevels?.['library'] ?? 0);
}

/** Observatory: extra map rows visible ahead of the current row. */
export function lookaheadRows(meta: DelveMeta): number {
  return meta.buildingLevels?.['observatory'] ?? 0;
}
