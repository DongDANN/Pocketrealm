/**
 * Gate 3b — the open. One call does what the app owes itself on a cold start: generate the recurring
 * entries that came due while it was shut, close any period that ended, take the free daily oil, score
 * the quests against the window each kind owns, and pay achievements earned on a day the app was never
 * opened. Every step is keyed, so this is safe to run twice in the same minute.
 */

import { addDays, addMonths, isoWeekBounds, monthKey } from '../core/dates';
import type { Achievement } from '../core/achievements';
import type { Period } from '../core/periods';
import type { GrantResult } from '../core/rewards';
import type { PeriodSummary } from '../core/types';
import { trickleOil } from './habits';
import { syncAchievements } from './achievementsStore';
import type { PocketDb } from './db';
import { loadFacts } from './factsStore';
import { closeEndedPeriods, generateRecurringOnOpen, type RecurringRunResult } from './lifecycle';
import { questSeed } from './onboard';
import { refreshQuests, type QuestState } from './questsStore';
import type { WriteContext } from './repos';

export interface OpenJobFlags {
  backupCreated?: boolean;
  installedToHomeScreen?: boolean;
  usedOffline?: boolean;
}

export interface OpenJobReport {
  recurring: RecurringRunResult;
  /** Periods that ended since the last open, oldest first. */
  closed: PeriodSummary[];
  current: Period;
  oil: GrantResult;
  quests: QuestState[];
  /** Achievements this open paid for. Empty when nothing new was met. */
  achievements: Achievement[];
}

/** The first window an app can have: earlier than any date a book could hold. */
const ALL_TIME_START = '0000-01-01';

function monthBounds(today: string): { start: string; end: string } {
  const start = `${monthKey(today)}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

export async function runOpenJobs(
  db: PocketDb,
  ctx: WriteContext,
  flags: OpenJobFlags = {},
): Promise<OpenJobReport> {
  const today = ctx.clock.today();
  const recurring = await generateRecurringOnOpen(db, ctx);
  const { closed, current } = await closeEndedPeriods(db, ctx.clock);
  const oil = await trickleOil(db, ctx);

  // Scored after the catch-up writes, so an entry generated on this open can finish a quest.
  const [daily, weekly, season, allTime] = await Promise.all([
    loadFacts(db, { today, window: { start: today, end: today }, flags }),
    loadFacts(db, { today, window: isoWeekBounds(today), flags }),
    loadFacts(db, { today, window: monthBounds(today), flags }),
    loadFacts(db, { today, window: { start: ALL_TIME_START, end: today }, flags }),
  ]);
  const quests = await refreshQuests(db, ctx, await questSeed(db), { daily, weekly, season });
  const achievements = await syncAchievements(db, ctx, allTime);

  return { recurring, closed, current, oil, quests, achievements };
}
