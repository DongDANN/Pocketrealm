import type { LocalDate, RewardEvent } from './types';

/**
 * Idempotent reward ledger. Every grant has a deterministic key; the same key grants nothing twice.
 * Daily caps stop farming, and edit/delete/recreate cannot mint XP because rewards key off
 * transaction ids (which change on recreate) and caps count existing grants.
 */

export interface GrantSpec {
  key: string;
  type: string;
  xp: number;
  sparks: number;
  oil?: number;
  at: LocalDate;
  meta?: Record<string, unknown>;
}

export interface GrantResult {
  events: RewardEvent[];
  granted: boolean;
  skippedReason?: 'duplicate' | 'cap';
}

/** Daily grant-count caps per type prefix. */
const DAILY_COUNT_CAPS: Readonly<Record<string, number>> = {
  log: 8,
  goal: 3,
};

/** Daily XP caps per exact type or type-group prefix (e.g. all `delve:*` share one cap). */
const DAILY_XP_CAPS: Readonly<Record<string, number>> = {
  delve: 30,
};

export function grant(events: readonly RewardEvent[], spec: GrantSpec): GrantResult {
  const next = [...events];
  const duplicate = next.some((e) => e.key === spec.key);
  if (duplicate) return { events: next, granted: false, skippedReason: 'duplicate' };

  const countCap = countCapFor(spec);
  if (countCap !== null) {
    const used = next.filter((e) => e.type === spec.type && e.at === spec.at).length;
    if (used >= countCap) return { events: next, granted: false, skippedReason: 'cap' };
  }

  const xpKey =
    DAILY_XP_CAPS[spec.type] !== undefined ? spec.type : (spec.type.split(':')[0] ?? '');
  const xpCap = DAILY_XP_CAPS[xpKey];
  if (xpCap !== undefined) {
    const usedXp = next
      .filter((e) => e.at === spec.at && (e.type === xpKey || e.type.startsWith(`${xpKey}:`)))
      .reduce((sum, e) => sum + e.xp, 0);
    if (usedXp + spec.xp > xpCap) return { events: next, granted: false, skippedReason: 'cap' };
  }

  next.push({
    key: spec.key,
    type: spec.type,
    xp: spec.xp,
    sparks: spec.sparks,
    ...(spec.oil !== undefined ? { oil: spec.oil } : {}),
    at: spec.at,
    ...(spec.meta ? { meta: spec.meta } : {}),
  });
  return { events: next, granted: true };
}

function countCapFor(spec: GrantSpec): number | null {
  return DAILY_COUNT_CAPS[spec.type.split(':')[0]!] ?? null;
}

export function totalXp(events: readonly RewardEvent[]): number {
  return events.reduce((sum, e) => sum + e.xp, 0);
}

export function totalSparks(events: readonly RewardEvent[]): number {
  return events.reduce((sum, e) => sum + e.sparks, 0);
}

export function oilGrantedOn(events: readonly RewardEvent[], date: LocalDate): number {
  return events
    .filter((e) => e.at === date && e.oil !== undefined)
    .reduce((sum, e) => sum + (e.oil ?? 0), 0);
}

/**
 * XP to reach level N: round(60 * N^1.5). Level 1 is the starting level (0 XP).
 */
export function xpForLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.5));
}

export interface LevelInfo {
  level: number;
  intoLevel: number;
  need: number;
  totalXpForLevel: number;
}

/** Cumulative XP table: LEVELS[n] = total XP required to be level n (LEVELS[1] = 0). */
export const LEVELS: readonly number[] = (() => {
  const out = [0, 0];
  for (let n = 1; n <= 49; n++) out.push(out[n]! + xpForLevel(n));
  return out;
})();

export function levelForXp(xp: number): LevelInfo {
  const x = Math.max(0, Math.trunc(xp));
  let level = 1;
  while (level + 1 < LEVELS.length && x >= LEVELS[level + 1]!) level++;
  const totalXpForLevel = LEVELS[level]!;
  const need = xpForLevel(level);
  return { level, intoLevel: x - totalXpForLevel, need, totalXpForLevel };
}

/** Oil ledger helpers: oil comes only from free trickle and logged habits, never from amounts. */
export const OIL_SOURCES = {
  trickle: { perDay: 20, type: 'oil:trickle' },
  log: { per: 4, type: 'oil:log', dailyCap: 8 },
  checkin: { per: 10, type: 'oil:checkin', dailyCap: 1 },
  nospend: { per: 10, type: 'oil:nospend', dailyCap: 1 },
  review: { per: 30, type: 'oil:review', dailyCap: 1 },
  goal: { per: 15, type: 'oil:goal', dailyCap: 3 },
} as const;

export const OIL_DAILY_CAP = 120;
export const OIL_STORAGE_CAP = 200;

export function clampOil(oil: number): number {
  return Math.min(Math.max(0, Math.trunc(oil)), OIL_STORAGE_CAP);
}
