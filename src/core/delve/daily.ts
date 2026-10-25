/**
 * Daily Challenge (SPEC 6.11 J). The dungeon is seeded by hash(date, "daily") so it is the same
 * for every player on a date with no server. The loadout is fixed (Warden, level 12, no Forge,
 * cards, consumables, buildings, or Heat), there is one attempt per local day, the run costs no
 * Lantern Oil, and finishing pays a small Embers and Spark reward plus a local personal best.
 */

import { hashCombine, hashString } from '../rng';
import type { LocalDate } from '../types';
import { DEFAULT_BUILD } from './data/builds';
import { bankEmbers, emptyMeta, newRun } from './engine';
import type { DelveMeta, HollowId, RunState } from './types';

export function dailySeed(date: LocalDate): number {
  return hashCombine(hashString(date), hashString('daily')) >>> 0;
}

/** The hollow the challenge runs in on a date: same for everyone, seeded by the date. */
export function dailyHollow(date: LocalDate): HollowId {
  return ((dailySeed(date) % 3) + 1) as HollowId;
}

/** Fixed challenge loadout: Warden at level 12, no meta progression. */
export const DAILY_LEVEL = 12;

export function newDailyRun(
  date: LocalDate,
  meta: DelveMeta,
): { run: RunState; meta: DelveMeta } | { error: string } {
  const daily = meta.daily ?? { date: '', played: false };
  if (daily.date === date && daily.played) {
    return { error: 'Daily challenge already played today.' };
  }
  const sanitized = { ...emptyMeta(), runsStarted: meta.runsStarted };
  const run = newRun(dailySeed(date), dailyHollow(date), DAILY_LEVEL, sanitized, DEFAULT_BUILD, 0);
  return { run: { ...run, daily: true }, meta: { ...meta, daily: { date, played: true } } };
}

/** Reward a finished challenge run: floor-scaled Embers (daily cap applies) and Sparks. */
export function finishDailyRun(
  meta: DelveMeta,
  run: Pick<RunState, 'floor' | 'result'>,
  today: LocalDate,
):
  | { meta: DelveMeta; embers: number; sparks: number; floor: number; best: boolean }
  | { error: string } {
  if (run.result === 'active') return { error: 'The run is still active.' };
  const floor = Math.max(1, Math.trunc(run.floor));
  const { meta: m, banked } = bankEmbers(meta, floor * 2, today);
  const prev = meta.dailyBest ?? 0;
  return {
    meta: { ...m, dailyBest: Math.max(prev, floor) },
    embers: banked,
    sparks: floor,
    floor,
    best: floor > prev,
  };
}
