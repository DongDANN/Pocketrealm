import { isoWeekId } from './dates';
import { hashCombine, hashString, mulberry32 } from './rng';
import type { BudgetFacts, LocalDate } from './types';

/**
 * Quests: daily (3 offered, deterministic from hash(userSeed, date)), weekly (2, per ISO week),
 * season (1 monthly arc). Progress comes only from real budgeting actions; no quest ever asks
 * the user to spend money or to spend less than they need.
 */

export type QuestKind = 'daily' | 'weekly' | 'season';

export interface Quest {
  id: string;
  kind: QuestKind;
  name: string;
  copy: string;
  target: number;
  xp: number;
  sparks: number;
  progress: (facts: BudgetFacts) => number;
}

export const QUESTS: readonly Quest[] = [
  // Daily pool.
  {
    id: 'daily-log-3',
    kind: 'daily',
    name: 'Three little logs',
    copy: 'Log 3 entries today.',
    target: 3,
    xp: 20,
    sparks: 3,
    progress: (f) => Math.min(3, f.txnCount),
  },
  {
    id: 'daily-checkin',
    kind: 'daily',
    name: 'Lantern check',
    copy: 'Check in today.',
    target: 1,
    xp: 10,
    sparks: 1,
    progress: (f) => Math.min(1, f.checkinCount),
  },
  {
    id: 'daily-note',
    kind: 'daily',
    name: 'A word in the ledger',
    copy: 'Add a note to an entry today.',
    target: 1,
    xp: 10,
    sparks: 1,
    progress: (f) => Math.min(1, f.noteCount),
  },
  {
    id: 'daily-goal',
    kind: 'daily',
    name: 'One step closer',
    copy: 'Contribute to a goal today.',
    target: 1,
    xp: 15,
    sparks: 2,
    progress: (f) => Math.min(1, f.goalContributions),
  },
  {
    id: 'daily-nospend',
    kind: 'daily',
    name: 'Quiet day',
    copy: 'Declare a no-spend day.',
    target: 1,
    xp: 10,
    sparks: 1,
    progress: (f) => Math.min(1, f.nospendCount),
  },
  {
    id: 'daily-log-1',
    kind: 'daily',
    name: 'Keep the book open',
    copy: 'Log 1 entry today.',
    target: 1,
    xp: 8,
    sparks: 1,
    progress: (f) => Math.min(1, f.txnCount),
  },
  {
    id: 'daily-review-day',
    kind: 'daily',
    name: 'A minute with the ledger',
    copy: 'Open today’s spending and glance at it.',
    target: 1,
    xp: 8,
    sparks: 1,
    progress: (f) => Math.min(1, f.checkinCount),
  },
  {
    id: 'daily-envelope-watch',
    kind: 'daily',
    name: 'Guardian watch',
    copy: 'Have one envelope under 80% today.',
    target: 1,
    xp: 8,
    sparks: 1,
    progress: (f) => (f.envelopeStates.some((e) => e.percentUsed < 80) ? 1 : 0),
  },
  // Weekly pool.
  {
    id: 'weekly-review',
    kind: 'weekly',
    name: 'The weekly ritual',
    copy: 'Complete the weekly review.',
    target: 1,
    xp: 40,
    sparks: 6,
    progress: (f) => Math.min(1, f.reviewCount),
  },
  {
    id: 'weekly-goal',
    kind: 'weekly',
    name: 'Fund the future',
    copy: 'Contribute to a goal this week.',
    target: 1,
    xp: 25,
    sparks: 4,
    progress: (f) => Math.min(1, f.goalContributions),
  },
  {
    id: 'weekly-under-80',
    kind: 'weekly',
    name: 'Steady hands',
    copy: 'Keep one envelope under 80% this week.',
    target: 1,
    xp: 25,
    sparks: 4,
    progress: (f) => (f.weekEnvelopeUnder80 ? 1 : 0),
  },
  {
    id: 'weekly-log-5',
    kind: 'weekly',
    name: 'Five days of light',
    copy: 'Log on 5 of 7 days.',
    target: 5,
    xp: 30,
    sparks: 5,
    progress: (f) => Math.min(5, new Set(f.activeDates).size),
  },
  {
    id: 'weekly-two-nospend',
    kind: 'weekly',
    name: 'Two quiet days',
    copy: 'Declare 2 no-spend days.',
    target: 2,
    xp: 20,
    sparks: 3,
    progress: (f) => Math.min(2, f.nospendCount),
  },
  {
    id: 'weekly-notes-2',
    kind: 'weekly',
    name: 'Marginalia',
    copy: 'Add notes to 2 entries.',
    target: 2,
    xp: 20,
    sparks: 3,
    progress: (f) => Math.min(2, f.noteCount),
  },
  // Season arc.
  {
    id: 'season-fill-lantern',
    kind: 'season',
    name: 'Fill the Lantern',
    copy: 'Finish the review, close 3 envelopes within allowance, reach a goal milestone.',
    target: 3,
    xp: 150,
    sparks: 30,
    progress: (f) => {
      let done = 0;
      if (f.reviewCount > 0) done += 1;
      if (f.envelopeStates.filter((e) => e.closedWithinAllowance).length >= 3) done += 1;
      if (f.goalReachedGoalIds.length > 0) done += 1;
      return done;
    },
  },
];

const BY_ID = new Map(QUESTS.map((q) => [q.id, q]));

export function questById(id: string): Quest | undefined {
  return BY_ID.get(id);
}

export function dailyQuestSeed(userSeed: number, date: LocalDate): number {
  return hashCombine(userSeed, hashString(`daily:${date}`));
}

export function weeklyQuestSeed(userSeed: number, date: LocalDate): number {
  return hashCombine(userSeed, hashString(`weekly:${isoWeekId(date)}`));
}

/** 3 distinct daily quests, deterministic for (userSeed, date). */
export function offeredDailyQuests(userSeed: number, date: LocalDate): Quest[] {
  return pickDistinct(
    dailyQuestSeed(userSeed, date),
    QUESTS.filter((q) => q.kind === 'daily'),
    3,
  );
}

/** 2 distinct weekly quests, deterministic for (userSeed, week). */
export function offeredWeeklyQuests(userSeed: number, date: LocalDate): Quest[] {
  return pickDistinct(
    weeklyQuestSeed(userSeed, date),
    QUESTS.filter((q) => q.kind === 'weekly'),
    2,
  );
}

export function seasonQuest(): Quest {
  return BY_ID.get('season-fill-lantern')!;
}

export function questPeriodId(kind: QuestKind, date: LocalDate): string {
  if (kind === 'weekly') return isoWeekId(date);
  if (kind === 'season') return date.slice(0, 7);
  return date;
}

export function questRewardKey(questId: string, periodId: string): string {
  return `quest:${questId}:${periodId}`;
}

/** Deterministic k-of-N selection with no repeats. */
function pickDistinct(seed: number, pool: readonly Quest[], count: number): Quest[] {
  const rng = mulberry32(seed);
  const remaining = [...pool];
  const out: Quest[] = [];
  while (out.length < count && remaining.length > 0) {
    const index = rng.int(remaining.length);
    out.push(remaining.splice(index, 1)[0]!);
  }
  return out;
}
