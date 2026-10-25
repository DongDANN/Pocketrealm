/**
 * Gate 3 — the reward table from SPEC 6.1 and 6.9 expressed as code, so a screen cannot accidentally
 * invent a grant. Each builder returns ledger specs keyed exactly as the spec keys them, carries the
 * documented XP/Sparks/Oil numbers, and takes no amount: what you earned never depends on how much
 * you spent.
 */

import { describe, expect, it } from 'vitest';
import {
  achievementReward,
  canDeclareNoSpend,
  checkinReward,
  envOkEligible,
  envOkReward,
  goalContributionReward,
  goalReachedReward,
  logReward,
  nospendReward,
  questReward,
  reviewReward,
} from '../src/core/habits';
import { addDays } from '../src/core/dates';
import { grant } from '../src/core/rewards';
import type { RewardEvent, Transaction } from '../src/core/types';

const AT = '2026-10-25';

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  kind: 'expense',
  amount: 12_00,
  date: AT,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('habit reward specs', () => {
  it('logs an entry at 5 XP, 1 Spark and 4 oil under log:<txId>', () => {
    expect(logReward('t1', AT)).toEqual([
      { key: 'log:t1', type: 'log', xp: 5, sparks: 1, oil: 4, at: AT },
    ]);
  });

  it('pays the check-in and no-spend day exactly as the table says', () => {
    expect(checkinReward(AT)).toEqual([
      { key: 'checkin:2026-10-25', type: 'checkin', xp: 10, sparks: 2, oil: 10, at: AT },
    ]);
    expect(nospendReward(AT)).toEqual([
      { key: 'nospend:2026-10-25', type: 'nospend', xp: 10, sparks: 2, oil: 10, at: AT },
    ]);
  });

  it('pays the weekly review per week id, not per day', () => {
    expect(reviewReward('2026-W44', AT)).toEqual([
      {
        key: 'review:2026-W44',
        type: 'review',
        xp: 60,
        sparks: 10,
        oil: 30,
        at: AT,
        meta: { weekId: '2026-W44' },
      },
    ]);
  });

  it('pays an envelope closed within allowance per period and envelope, with no oil', () => {
    expect(envOkReward('2026-10-01', 'food', AT)).toEqual([
      { key: 'envok:2026-10-01:food', type: 'envok', xp: 40, sparks: 8, at: AT },
    ]);
  });

  it('pays goal work under the capped goal types', () => {
    expect(goalContributionReward('t2', AT)).toEqual([
      { key: 'goal:t2', type: 'goal', xp: 15, sparks: 3, oil: 15, at: AT },
    ]);
    expect(goalReachedReward('g1', AT)).toEqual([
      { key: 'goalDone:g1', type: 'goalDone', xp: 150, sparks: 30, at: AT },
    ]);
  });

  it('keys quest and achievement rewards through the shared helpers', () => {
    const quest = { id: 'daily-log-3', xp: 20, sparks: 3 } as never;
    expect(questReward(quest, '2026-10-25', AT)).toEqual([
      { key: 'quest:daily-log-3:2026-10-25', type: 'quest', xp: 20, sparks: 3, at: AT },
    ]);
    const achievement = { id: 'first-entry', xp: 10, sparks: 2 } as never;
    expect(achievementReward(achievement, AT)).toEqual([
      { key: 'ach:first-entry', type: 'achievement', xp: 10, sparks: 2, at: AT },
    ]);
  });

  it('refuses a no-spend day that already has an expense', () => {
    expect(canDeclareNoSpend([txn()], AT)).toBe(false);
    expect(canDeclareNoSpend([txn({ kind: 'income', amount: 500_00 })], AT)).toBe(true);
    expect(canDeclareNoSpend([txn({ kind: 'transfer', amount: 500_00 })], AT)).toBe(true);
    expect(canDeclareNoSpend([txn()], addDays(AT, 1))).toBe(true); // a different day
    expect(canDeclareNoSpend([txn({ deletedAt: 2 })], AT)).toBe(true); // deleted does not count
    expect(canDeclareNoSpend([], AT)).toBe(true);
  });

  it('cannot dodge the daily count caps by batching its own specs', () => {
    let events: RewardEvent[] = [];
    let granted = 0;
    for (let i = 1; i <= 10; i++) {
      const result = grant(events, logReward(`t${i}`, AT)[0]!);
      events = result.events;
      if (result.granted) granted += 1;
      else expect(result.skippedReason).toBe('cap');
    }
    // SPEC 6.1: first 8 logs per day.
    expect(granted).toBe(8);
  });

  it('grants nothing twice for the same transaction', () => {
    const spec = logReward('t1', AT)[0]!;
    const first = grant([], spec);
    const second = grant(first.events, spec);
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(second.skippedReason).toBe('duplicate');
  });
});

describe('envok eligibility', () => {
  it('needs the envelope to close inside its allowance and be used at least five times', () => {
    expect(envOkEligible(0, 5)).toBe(true); // emptied to the last centavo, still within
    expect(envOkEligible(500, 9)).toBe(true);
    expect(envOkEligible(-1, 9)).toBe(false); // overspent is never a success
    expect(envOkEligible(5_000_00, 4)).toBe(false); // ignoring an envelope is not budgeting
    expect(envOkEligible(5_000_00, 0)).toBe(false);
  });
});
