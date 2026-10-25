/**
 * Gate 3 — BudgetFacts. Quests and achievements are pure functions of this snapshot, so the snapshot
 * decides whether a reward reflects real budgeting. The two rules the tests pin hardest: counts are
 * scoped to the window the caller asked for (a daily quest must not see last month), and money never
 * enters a count — an envelope with one huge entry is not "busier" than one with five small ones.
 */

import { describe, expect, it } from 'vitest';
import { buildBudgetFacts } from '../src/core/facts';
import type { Envelope, Goal, LocalDate, RewardEvent, Transaction } from '../src/core/types';

const TODAY: LocalDate = '2026-10-25';

const envelope = (over: Partial<Envelope> = {}): Envelope => ({
  id: 'food',
  name: 'Food',
  icon: 'meals',
  colorKey: 'moss',
  monthlyAllowance: 31_00,
  rollover: 'none',
  archived: false,
  sortOrder: 0,
  ...over,
});

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  kind: 'expense',
  amount: 1_00,
  date: TODAY,
  envelopeId: 'food',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const event = (over: Partial<RewardEvent> = {}): RewardEvent => ({
  key: 'log:t1',
  type: 'log',
  xp: 5,
  sparks: 1,
  at: TODAY,
  ...over,
});

const DAY_WINDOW = { start: TODAY, end: TODAY };

describe('buildBudgetFacts windowing', () => {
  it('counts only what happened inside the window', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      transactions: [
        txn(),
        txn({ id: 't2' }),
        txn({ id: 't3', date: '2026-10-24' }), // yesterday, outside a daily window
        txn({ id: 't4', deletedAt: 5 }),
      ],
      rewardEvents: [event(), event({ key: 'log:t2', at: '2026-10-20' })],
    });
    expect(facts.txnCount).toBe(2);
    expect(facts.activeDates).toEqual([TODAY]);
  });

  it('counts notes, goal work, transfers and recurring rows separately', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: { start: '2026-10-01', end: TODAY },
      transactions: [
        txn({ id: 'a', note: 'rice and eggs' }),
        txn({ id: 'b', note: '   ' }), // whitespace is not a note
        txn({ id: 'c', kind: 'transfer', amount: 5_00, toEnvelopeId: 'food', goalId: 'g1' }),
        txn({ id: 'd', recurringId: 'r1' }),
      ],
    });
    expect(facts.txnCount).toBe(4);
    expect(facts.noteCount).toBe(1);
    expect(facts.goalContributions).toBe(1);
    expect(facts.transferCount).toBe(1);
    expect(facts.recurringCount).toBe(1);
  });

  it('takes check-in, no-spend and review counts from the reward ledger, not from guesses', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: { start: '2026-10-01', end: TODAY },
      transactions: [],
      rewardEvents: [
        event({ key: 'checkin:2026-10-25', type: 'checkin' }),
        event({ key: 'checkin:2026-09-30', type: 'checkin', at: '2026-09-30' }), // outside
        event({ key: 'nospend:2026-10-24', type: 'nospend', at: '2026-10-24' }),
        event({ key: 'review:2026-W43', type: 'review', at: '2026-10-20' }),
      ],
    });
    expect(facts.checkinCount).toBe(1);
    expect(facts.nospendCount).toBe(1);
    expect(facts.reviewCount).toBe(1);
  });

  it('merges activity days from transactions, check-ins and no-spend days', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: { start: '2026-10-01', end: TODAY },
      transactions: [txn({ id: 'a', date: '2026-10-21' }), txn({ id: 'b', date: '2026-10-21' })],
      rewardEvents: [
        event({ key: 'checkin:2026-10-22', type: 'checkin', at: '2026-10-22' }),
        event({ key: 'nospend:2026-10-23', type: 'nospend', at: '2026-10-23' }),
        event({ key: 'review:2026-W43', type: 'review', at: '2026-10-18' }), // nothing else that day
      ],
    });
    // A review is an event about a week, not a day of showing up; 10-18 stays dark.
    expect(facts.activeDates).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  });
});

describe('buildBudgetFacts envelope state', () => {
  it('reports the current period with carry applied, and entry counts that ignore money', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      envelopes: [envelope(), envelope({ id: 'fun', name: 'Fun', archived: true })],
      carries: new Map([['food', 6_00]]),
      transactions: [
        txn({ id: 'a', amount: 10_00 }),
        txn({ id: 'b', amount: 10_00, date: '2026-10-02' }), // same period, different day
        txn({ id: 'c', amount: 10_00, date: '2026-09-30' }), // previous period
        txn({ id: 'd', kind: 'transfer', amount: 5_00, envelopeId: 'fun', toEnvelopeId: 'food' }),
        txn({ id: 'e', kind: 'transfer', amount: 3_00, envelopeId: 'food', toEnvelopeId: 'sinks' }),
      ],
    });
    expect(facts.archivedEnvelopeCount).toBe(1);
    const food = facts.envelopeStates.find((e) => e.envelopeId === 'food');
    expect(food?.entriesLogged).toBe(2); // transfers are movement, not entries logged
    // 10.00 + 10.00 spent, 3.00 moved out and 5.00 moved in, against 31.00 + 6.00 carry.
    expect(food?.percentUsed).toBe(Math.round((18_00 / 37_00) * 100));
    expect(facts.envelopeStates.find((e) => e.envelopeId === 'fun')).toBeUndefined();
  });

  it('marks an envelope closed within allowance only when it was used at least five times', () => {
    const five = [1, 2, 3, 4, 5].map((n) => txn({ id: `t${n}`, amount: 1_00 }));
    const tidy = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      envelopes: [envelope()],
      transactions: five,
    });
    expect(tidy.envelopeStates[0]?.closedWithinAllowance).toBe(true);

    const ignored = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      envelopes: [envelope()],
      transactions: [txn({ amount: 20_00 })],
    });
    expect(ignored.envelopeStates[0]?.closedWithinAllowance).toBe(false);

    const overspent = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      envelopes: [envelope({ monthlyAllowance: 3_00 })],
      transactions: five.map((t, i) => ({ ...t, amount: 1_00, id: `o${i}` })),
    });
    expect(overspent.envelopeStates[0]?.closedWithinAllowance).toBe(false);
  });

  it('flags a week under 80% against a week-sized slice of the allowance', () => {
    // 31-day period, 7-day window, ₱31.00 allowance -> ₱7.00 of week budget; 80% is ₱5.60.
    const week = { start: '2026-10-19', end: TODAY };
    const light = buildBudgetFacts({
      today: TODAY,
      window: week,
      envelopes: [envelope()],
      transactions: [txn({ id: 'a', amount: 5_00 })],
    });
    expect(light.weekEnvelopeUnder80).toBe(true);

    const heavy = buildBudgetFacts({
      today: TODAY,
      window: week,
      envelopes: [envelope()],
      transactions: [txn({ id: 'a', amount: 6_00 })],
    });
    expect(heavy.weekEnvelopeUnder80).toBe(false);

    const unfunded = buildBudgetFacts({
      today: TODAY,
      window: week,
      envelopes: [envelope({ monthlyAllowance: 0 })],
      transactions: [txn({ id: 'a', amount: 0 })],
    });
    expect(unfunded.weekEnvelopeUnder80).toBe(false);
  });
});

describe('buildBudgetFacts growth', () => {
  it('reads the streak from every activity day, rest tokens included', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      // A one-day window must not blind the streak: it always reads the whole history.
      window: DAY_WINDOW,
      transactions: [
        txn({ id: 'a', date: '2026-10-25' }),
        txn({ id: 'b', date: '2026-10-24' }),
        txn({ id: 'c', date: '2026-10-22' }), // one day skipped, saved by a token
      ],
      rewardEvents: [event({ key: 'log:c', at: '2026-10-22' })],
      restTokens: 1,
    });
    // 25 + 24 logged, 23 rescued by a rest token, 22 logged: a four-day streak, one token spent.
    expect(facts.streak).toBe(4);
    expect(facts.longestStreak).toBe(4);
  });

  it('lists goals that reached their target and turns xp into a level', () => {
    const goals: Goal[] = [
      { id: 'g1', name: 'Fund', target: 10_00, saved: 10_00, icon: 'jar', archived: false },
      { id: 'g2', name: 'Bike', target: 50_00, saved: 49_99, icon: 'bike', archived: false },
      // A goal with no target is not "finished" — it was never a finish line.
      { id: 'g3', name: 'Open jar', target: 0, saved: 0, icon: 'jar', archived: false },
    ];
    const facts = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      transactions: [],
      goals,
      xp: 60,
    });
    expect(facts.goalReachedGoalIds).toEqual(['g1']);
    expect(facts.level).toBe(2);
  });

  it('expresses the emergency fund as a multiple of average monthly spending', () => {
    const withSpend = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      transactions: [
        txn({ id: 'a', amount: 10_00, date: '2026-10-05' }),
        txn({ id: 'b', amount: 30_00, date: '2026-09-05' }),
      ],
      goals: [
        { id: 'g1', name: 'Fund', target: 100_00, saved: 40_00, icon: 'jar', archived: false },
      ],
    });
    expect(withSpend.emergencyFundRatio).toBe(2); // avg ₱20.00 a month, ₱40.00 kept
  });

  it('reports a zero ratio instead of dividing by an empty history', () => {
    const facts = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      transactions: [],
      goals: [
        { id: 'g1', name: 'Fund', target: 40_00, saved: 20_00, icon: 'jar', archived: false },
      ],
    });
    expect(facts.emergencyFundRatio).toBe(0);
  });

  it('defaults every device flag to false, so nothing is claimed that did not happen', () => {
    const facts = buildBudgetFacts({ today: TODAY, window: DAY_WINDOW, transactions: [] });
    expect(facts.backupCreated).toBe(false);
    expect(facts.installedToHomeScreen).toBe(false);
    expect(facts.usedOffline).toBe(false);
    expect(facts.level).toBe(1);
    expect(facts.streak).toBe(0);

    const flagged = buildBudgetFacts({
      today: TODAY,
      window: DAY_WINDOW,
      transactions: [],
      flags: { backupCreated: true, usedOffline: true },
    });
    expect(flagged.backupCreated).toBe(true);
    expect(flagged.usedOffline).toBe(true);
    expect(flagged.installedToHomeScreen).toBe(false);
  });
});
