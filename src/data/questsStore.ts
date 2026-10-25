/**
 * Gate 3b — quests on disk. Which quests are offered is pure core logic (seed + date), so this module
 * owns only the per-period row: progress climbs and never falls, completion is stamped once, and the
 * reward is taken exactly once per period. A new day or week is a new period id, which is what stops
 * yesterday's finished quest from paying again today.
 */

import { questReward } from '../core/habits';
import {
  offeredDailyQuests,
  offeredWeeklyQuests,
  questById,
  questPeriodId,
  seasonQuest,
  type Quest,
  type QuestKind,
} from '../core/quests';
import type { BudgetFacts, LocalDate, QuestProgress } from '../core/types';
import type { PocketDb } from './db';
import { grantMany } from './ledger';
import { listQuestProgress, setQuestProgress, type WriteContext } from './repos';

export interface QuestState {
  quest: Quest;
  periodId: string;
  progress: number;
  completedAt?: number;
  claimedAt?: number;
}

/** The facts already scoped to each kind of window: today, this ISO week, this month. */
export interface QuestFactsByKind {
  daily: BudgetFacts;
  weekly: BudgetFacts;
  season: BudgetFacts;
}

export type ClaimOutcome =
  | { ok: true; questId: string; periodId: string; granted: boolean; xp: number; sparks: number }
  | { ok: false; reason: 'unknown' | 'in-progress' | 'already-claimed' };

function offersFor(seed: number, today: LocalDate): { quest: Quest; periodId: string }[] {
  return [
    ...offeredDailyQuests(seed, today).map((quest) => ({
      quest,
      periodId: questPeriodId('daily', today),
    })),
    ...offeredWeeklyQuests(seed, today).map((quest) => ({
      quest,
      periodId: questPeriodId('weekly', today),
    })),
    { quest: seasonQuest(), periodId: questPeriodId('season', today) },
  ];
}

export async function refreshQuests(
  db: PocketDb,
  ctx: WriteContext,
  seed: number,
  factsByKind: QuestFactsByKind,
): Promise<QuestState[]> {
  const today = ctx.clock.today();
  const offers = offersFor(seed, today);
  const factsFor: Record<QuestKind, BudgetFacts> = {
    daily: factsByKind.daily,
    weekly: factsByKind.weekly,
    season: factsByKind.season,
  };

  return db.transaction('rw', db.questProgress, async () => {
    // One read per period, not per quest: the three dailies share a period id.
    const rowsByPeriod = new Map<string, QuestProgress[]>();
    for (const { periodId } of offers) {
      if (!rowsByPeriod.has(periodId))
        rowsByPeriod.set(periodId, await listQuestProgress(db, periodId));
    }

    const states: QuestState[] = [];
    for (const { quest, periodId } of offers) {
      const stored = rowsByPeriod.get(periodId)!.find((row) => row.questId === quest.id);
      const fresh = quest.progress(factsFor[quest.kind]);
      // Each quest's own progress function already stops at its target, so the stored high-water
      // mark and today's number are the only two candidates.
      const progress = Math.max(stored?.progress ?? 0, fresh);
      const completedAt =
        stored?.completedAt ?? (progress >= quest.target ? ctx.clock.now() : undefined);
      const row: QuestProgress = {
        questId: quest.id,
        periodId,
        progress,
        ...(completedAt === undefined ? {} : { completedAt }),
        ...(stored?.claimedAt === undefined ? {} : { claimedAt: stored.claimedAt }),
      };
      await setQuestProgress(db, row);
      states.push({
        quest,
        periodId,
        progress,
        ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
        ...(row.claimedAt === undefined ? {} : { claimedAt: row.claimedAt }),
      });
    }
    return states;
  });
}

export async function claimQuest(
  db: PocketDb,
  ctx: WriteContext,
  questId: string,
  periodId: string,
): Promise<ClaimOutcome> {
  const quest = questById(questId);
  if (!quest) return { ok: false, reason: 'unknown' };

  return db.transaction('rw', db.questProgress, db.rewards, async () => {
    const row = (await listQuestProgress(db, periodId)).find((r) => r.questId === questId);
    // No row at all means this device was never offered that quest in that period.
    if (!row) return { ok: false, reason: 'unknown' };
    if (row.completedAt === undefined) return { ok: false, reason: 'in-progress' };
    if (row.claimedAt !== undefined) return { ok: false, reason: 'already-claimed' };

    const [result] = await grantMany(db, questReward(quest, periodId, ctx.clock.today()));
    await setQuestProgress(db, { ...row, claimedAt: ctx.clock.now() });
    return {
      ok: true,
      questId,
      periodId,
      granted: result!.granted,
      xp: quest.xp,
      sparks: quest.sparks,
    };
  });
}
