import { describe, expect, it } from 'vitest';
import {
  offeredDailyQuests,
  offeredWeeklyQuests,
  questById,
  questPeriodId,
  questRewardKey,
  seasonQuest,
} from '../src/core/quests';
import type { BudgetFacts } from '../src/core/types';

function facts(partial: Partial<BudgetFacts> = {}): BudgetFacts {
  return {
    activeDates: [],
    txnCount: 0,
    noteCount: 0,
    goalContributions: 0,
    nospendCount: 0,
    checkinCount: 0,
    reviewCount: 0,
    transferCount: 0,
    recurringCount: 0,
    archivedEnvelopeCount: 0,
    streak: 0,
    longestStreak: 0,
    emergencyFundRatio: 0,
    envelopeStates: [],
    goalReachedGoalIds: [],
    level: 1,
    backupCreated: false,
    installedToHomeScreen: false,
    usedOffline: false,
    weekEnvelopeUnder80: false,
    ...partial,
  };
}

describe('quest rotation', () => {
  it('offers 3 distinct daily quests deterministically per user and date', () => {
    const a = offeredDailyQuests(42, '2026-10-25');
    const b = offeredDailyQuests(42, '2026-10-25');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
    expect(a.every((q) => q.kind === 'daily')).toBe(true);
  });

  it('different dates and users get different offers (statistically)', () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3]) {
      for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) {
        seen.add(
          offeredDailyQuests(seed, date)
            .map((q) => q.id)
            .join(','),
        );
      }
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('offers 2 distinct weekly quests, stable across the same week', () => {
    const mon = offeredWeeklyQuests(42, '2026-10-19');
    const sun = offeredWeeklyQuests(42, '2026-10-25');
    expect(mon.map((q) => q.id)).toEqual(sun.map((q) => q.id));
    expect(new Set(mon.map((q) => q.id)).size).toBe(2);
  });

  it('quest period ids and reward keys follow the spec format', () => {
    expect(questPeriodId('daily', '2026-10-25')).toBe('2026-10-25');
    expect(questPeriodId('weekly', '2026-10-25')).toBe('2026-W43');
    expect(questPeriodId('season', '2026-10-25')).toBe('2026-10');
    expect(questRewardKey('daily-log-3', '2026-10-25')).toBe('quest:daily-log-3:2026-10-25');
  });
});

describe('quest progress', () => {
  it('daily-log-3 counts logged entries', () => {
    const q = questById('daily-log-3')!;
    expect(q.progress(facts({ txnCount: 2 }))).toBe(2);
    expect(q.progress(facts({ txnCount: 5 }))).toBe(3);
  });

  it('daily-checkin and daily-note are binary', () => {
    expect(questById('daily-checkin')!.progress(facts({ checkinCount: 1 }))).toBe(1);
    expect(questById('daily-checkin')!.progress(facts())).toBe(0);
    expect(questById('daily-note')!.progress(facts({ noteCount: 2 }))).toBe(1);
  });

  it('weekly-log-5 counts distinct active days', () => {
    const q = questById('weekly-log-5')!;
    expect(q.progress(facts({ activeDates: ['2026-10-19', '2026-10-20', '2026-10-22'] }))).toBe(3);
  });

  it('season arc counts completed steps, never more than target', () => {
    const q = seasonQuest();
    expect(q.target).toBe(3);
    expect(
      q.progress(
        facts({
          reviewCount: 1,
          envelopeStates: [
            { envelopeId: 'a', percentUsed: 10, entriesLogged: 5, closedWithinAllowance: true },
            { envelopeId: 'b', percentUsed: 20, entriesLogged: 5, closedWithinAllowance: true },
            { envelopeId: 'c', percentUsed: 30, entriesLogged: 5, closedWithinAllowance: true },
          ],
          goalReachedGoalIds: ['g1'],
        }),
      ),
    ).toBe(3);
    expect(q.progress(facts())).toBe(0);
  });

  it('no quest references money amounts or asks to spend', () => {
    for (const q of [
      seasonQuest(),
      ...offeredDailyQuests(1, '2026-10-25'),
      ...offeredWeeklyQuests(1, '2026-10-25'),
    ]) {
      expect(q.copy.toLowerCase()).not.toMatch(/spend (more|less|\d)|₱|\$|peso/);
    }
  });
});
