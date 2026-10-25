/**
 * Gate 3b — habit writes. Every screen action that earns a reward goes through here, in one
 * transaction, so a crash cannot leave a logged entry with no reward or a reward with no entry. The
 * atomicity test is written to be mutation-sensitive: the fake failure calls through to a real first
 * write, so "nothing was left behind" is only true if the transaction is really there.
 */

import { describe, expect, it, vi } from 'vitest';
import { isoWeekId } from '../src/core/dates';
import { OIL_DAILY_CAP } from '../src/core/rewards';
import type { Clock, Envelope, Goal, RewardEvent, Transaction } from '../src/core/types';
import {
  checkIn,
  completeReview,
  declareNoSpend,
  deleteLogged,
  logWithReward,
  restoreLogged,
  trickleOil,
} from '../src/data/habits';
import {
  getGoal,
  saveEnvelope,
  saveGoal,
  writeTransaction,
  type WriteContext,
} from '../src/data/repos';
import { ledgerEvents, ledgerTotals } from '../src/data/ledger';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const clock: Clock = { now: () => NOW, today: () => TODAY };

/** Deterministic ids, so reward keys are assertable. */
function ctx(prefix = 'id'): WriteContext {
  let n = 0;
  return { clock, newId: () => `${prefix}-${++n}` };
}

function dayClock(date: string): Clock {
  return { now: () => NOW, today: () => date };
}

const expense = (
  over: Partial<Transaction> = {},
): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> => ({
  kind: 'expense',
  amount: 1_00,
  date: TODAY,
  envelopeId: 'food',
  ...over,
});

const envelope = (over: Partial<Envelope> = {}): Envelope => ({
  id: 'food',
  name: 'Food',
  icon: 'bowl',
  colorKey: 'moss',
  monthlyAllowance: 100_00,
  rollover: 'none',
  archived: false,
  sortOrder: 0,
  ...over,
});

async function fundGoal(db: ReturnType<typeof testDb>, target: number): Promise<Goal> {
  return saveGoal(db, { id: 'g1', name: 'Fund', target, saved: 0, icon: 'jar', archived: false });
}

describe('logWithReward', () => {
  it('writes the entry and pays the log reward in the same breath', async () => {
    const db = testDb('log-happy');
    const outcome = await logWithReward(db, expense(), ctx());
    if (!outcome.ok) throw new Error('expected the write to land');
    expect(outcome.transaction.id).toBe('id-1');
    expect(await ledgerEvents(db)).toMatchObject([
      { key: 'log:id-1', type: 'log', xp: 5, sparks: 1, oil: 4, at: TODAY },
    ]);
    expect(await db.transactions.count()).toBe(1);
  });

  it('pays on the day the action happened, so back-dating cannot farm a quiet day', async () => {
    const db = testDb('log-backdate');
    const outcome = await logWithReward(db, expense({ date: '2026-09-02' }), ctx());
    const [event] = await ledgerEvents(db);
    expect(event?.at).toBe(TODAY);
    expect(outcome.ok && outcome.transaction.date).toBe('2026-09-02');
  });

  it('stops paying after the eighth entry of the day', async () => {
    const db = testDb('log-cap');
    const context = ctx();
    let granted = 0;
    let capped = 0;
    for (let i = 0; i < 10; i++) {
      const outcome = await logWithReward(db, expense(), context);
      if (!outcome.ok) throw new Error('expected the write to land');
      if (outcome.rewards[0]?.granted) granted += 1;
      else capped += 1;
    }
    expect([granted, capped]).toEqual([8, 2]);
    expect(await db.transactions.count()).toBe(10); // the entry is real even when the reward is capped
    expect((await ledgerEvents(db)).filter((e) => e.type === 'log')).toHaveLength(8);
  });

  it('pays goal work and the one-time goal reached bonus', async () => {
    const db = testDb('log-goal');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const context = ctx();

    const first = await logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), context);
    const second = await logWithReward(db, expense({ amount: 40_00, goalId: 'g1' }), context);
    const third = await logWithReward(db, expense({ amount: 10_00, goalId: 'g1' }), context);
    if (!first.ok || !second.ok || !third.ok) throw new Error('expected the writes to land');

    expect(first.grantedTypes).toEqual(['log', 'goal']);
    expect(second.grantedTypes).toEqual(['log', 'goal', 'goalDone']);

    // The bonus is not even attempted again: the crossing check is what says so, not the ledger.
    expect(third.rewards).toHaveLength(2);
    expect(third.grantedTypes).toEqual(['log', 'goal']);
    expect((await getGoal(db, 'g1'))?.saved).toBe(110_00);
  });

  it('rolls the entry, the goal and the reward back together when the ledger write fails', async () => {
    const db = testDb('log-atomic');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const before = await db.transactions.count();

    const realAdd = db.rewards.add.bind(db.rewards);
    let adds = 0;
    vi.spyOn(db.rewards, 'add').mockImplementation((async (row: RewardEvent) => {
      adds += 1;
      if (adds === 1) return realAdd(row);
      throw new Error('quota');
    }) as typeof db.rewards.add);

    await expect(
      logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), ctx()),
    ).rejects.toThrow('quota');
    vi.restoreAllMocks();
    expect(adds).toBeGreaterThan(1);
    expect(await db.transactions.count()).toBe(before);
    expect((await getGoal(db, 'g1'))?.saved).toBe(0);
    expect(await db.rewards.count()).toBe(0);
  });

  it('refuses a whole write whose goal has disappeared', async () => {
    const db = testDb('log-orphan');
    await saveEnvelope(db, envelope());
    const outcome = await logWithReward(db, expense({ amount: 60_00, goalId: 'gone' }), ctx());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome).toEqual({ ok: false, reason: 'goal-missing', goalId: 'gone' });
    expect(await db.transactions.count()).toBe(0); // no entry the user would trust
    expect(await ledgerEvents(db)).toEqual([]);
  });
});

describe('check-in, no-spend, review', () => {
  it('pays one check-in per day', async () => {
    const db = testDb('checkin');
    const first = await checkIn(db, ctx());
    const second = await checkIn(db, ctx());
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(false);
    expect(second.skippedReason).toBe('duplicate');
    expect((await ledgerEvents(db)).filter((e) => e.type === 'checkin')).toHaveLength(1);
  });

  it('refuses a no-spend day on a day that already has an expense', async () => {
    const db = testDb('nospend');
    await writeTransaction(db, expense(), ctx());
    expect(await declareNoSpend(db, ctx())).toBeNull();
    expect((await ledgerEvents(db)).filter((e) => e.type === 'nospend')).toHaveLength(0);

    const clean = testDb('nospend-clean');
    await writeTransaction(
      clean,
      expense({ kind: 'income', amount: 500_00, envelopeId: undefined }),
      ctx(),
    );
    const outcome = await declareNoSpend(clean, ctx());
    expect(outcome?.granted).toBe(true);
    expect((await ledgerEvents(clean))[0]?.key).toBe(`nospend:${TODAY}`);
  });

  it('pays the weekly review once per week and again next week', async () => {
    const db = testDb('review');
    const first = await completeReview(db, ctx());
    const again = await completeReview(db, ctx());
    expect(first.granted).toBe(true);
    expect(again.skippedReason).toBe('duplicate');
    expect((await ledgerEvents(db))[0]?.key).toBe(`review:${isoWeekId(TODAY)}`);

    const next = testDb('review-next');
    const later = await completeReview(next, { clock: dayClock('2026-11-02'), newId: () => 'x' });
    expect(later.granted).toBe(true);
    expect((await ledgerEvents(next))[0]?.key).toBe(`review:${isoWeekId('2026-11-02')}`);
  });

  it('marks the review the caller names, so last week can be reviewed today', async () => {
    const db = testDb('review-explicit');
    const outcome = await completeReview(db, ctx(), '2026-W41');
    expect(outcome.granted).toBe(true);
    expect((await ledgerEvents(db))[0]).toMatchObject({
      key: 'review:2026-W41',
      type: 'review',
      at: TODAY,
    });
    // Today's own week is still unclaimed, because the caller paid for a different one.
    expect((await completeReview(db, ctx())).granted).toBe(true);
  });
});

describe('trickleOil', () => {
  it('grants the daily trickle once', async () => {
    const db = testDb('trickle');
    const first = await trickleOil(db, ctx());
    const second = await trickleOil(db, ctx());
    expect(first.granted).toBe(true);
    expect(second.skippedReason).toBe('duplicate');
    expect(await ledgerTotals(db)).toEqual({ xp: 0, sparks: 0, oil: 20 });
  });

  it('grants the trickle again the next day, because the key is the day', async () => {
    const db = testDb('trickle-two-days');
    expect((await trickleOil(db, ctx())).granted).toBe(true);
    const tomorrow = { clock: dayClock('2026-10-26'), newId: () => 't' };
    expect((await trickleOil(db, tomorrow)).granted).toBe(true);
    expect((await ledgerEvents(db)).map((e) => e.at)).toEqual(['2026-10-25', '2026-10-26']);
    expect(await ledgerTotals(db)).toEqual({ xp: 0, sparks: 0, oil: 40 });
  });

  it('stops the day at the oil cap whichever source arrives last', async () => {
    const db = testDb('oil-cap');
    await saveGoal(db, {
      id: 'g1',
      name: 'Fund',
      target: 1_000_00,
      saved: 0,
      icon: 'jar',
      archived: false,
    });
    const context = ctx('tx');
    // Income entries only: they log work without spending, so the no-spend declaration stays true.
    const income = expense({ kind: 'income', envelopeId: undefined });
    for (let i = 0; i < 8; i++) await logWithReward(db, income, context); // 32 oil
    for (let i = 0; i < 3; i++) {
      await logWithReward(db, { ...income, goalId: 'g1' }, context); // 45 oil
    }
    await checkIn(db, context); // 10
    await declareNoSpend(db, context); // 10, so the day holds 97

    expect((await trickleOil(db, context)).granted).toBe(true); // 117
    const review = await completeReview(db, ctx('rv'));
    expect(review.granted).toBe(false);
    expect(review.skippedReason).toBe('cap');
    expect((await ledgerTotals(db)).oil).toBeLessThanOrEqual(OIL_DAILY_CAP);
  });
});

describe('deleteLogged', () => {
  it('soft-deletes the entry and takes the money back out of the goal', async () => {
    const db = testDb('delete-goal');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const context = ctx();
    const first = await logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), context);
    const second = await logWithReward(db, expense({ amount: 40_00, goalId: 'g1' }), context);
    if (!first.ok || !second.ok) throw new Error('expected both contributions to land');

    const removed = await deleteLogged(db, first.transaction.id, context);
    if (!removed) throw new Error('expected the entry to exist');
    expect(removed.transaction.deletedAt).toBe(NOW);
    expect(removed.goal?.saved).toBe(40_00);
    expect((await getGoal(db, 'g1'))?.saved).toBe(40_00);
    // The rewards are not clawed back: SPEC 6.1 forbids losing things, and a spent key simply stops
    // this entry paying again.
    const types = (await ledgerEvents(db)).map((e) => e.type);
    expect(types.filter((t) => t === 'log')).toHaveLength(2);
    expect(types.filter((t) => t === 'goal')).toHaveLength(2);
    expect(types.filter((t) => t === 'goalDone')).toHaveLength(1);
  });

  it('leaves the goal alone when the entry was not goal work', async () => {
    const db = testDb('delete-plain');
    await saveEnvelope(db, envelope());
    const outcome = await logWithReward(db, expense(), ctx());
    const removed = await deleteLogged(db, outcome.ok ? outcome.transaction.id : 'gone', ctx());
    expect(removed?.goal).toBeUndefined();
    expect(await db.goals.count()).toBe(0);
  });

  it('is a no-op on an id that does not exist', async () => {
    const db = testDb('delete-missing');
    expect(await deleteLogged(db, 'nope', ctx())).toBeNull();
  });

  it('refuses to delete the same entry twice, so a goal is never refunded twice', async () => {
    const db = testDb('delete-twice');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const context = ctx();
    const logged = await logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), context);
    if (!logged.ok) throw new Error('expected the contribution to land');

    expect(await deleteLogged(db, logged.transaction.id, context)).not.toBeNull();
    expect(await deleteLogged(db, logged.transaction.id, context)).toBeNull();
    expect((await getGoal(db, 'g1'))?.saved).toBe(0);
  });

  it('will not take a goal below zero when the entry it refunds has been overtaken', async () => {
    const db = testDb('delete-floor');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const context = ctx();
    const logged = await logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), context);
    if (!logged.ok) throw new Error('expected the contribution to land');
    // Something else spent the fund down afterwards, so the refund is larger than the balance.
    await saveGoal(db, {
      id: 'g1',
      name: 'Fund',
      target: 100_00,
      saved: 10_00,
      icon: 'jar',
      archived: false,
    });

    const removed = await deleteLogged(db, logged.transaction.id, context);
    expect(removed?.goal?.saved).toBe(0);
    expect((await getGoal(db, 'g1'))?.saved).toBe(0);
  });
});

describe('restoreLogged', () => {
  it('brings a deleted entry back and puts its contribution back in the goal', async () => {
    const db = testDb('restore-goal');
    await saveEnvelope(db, envelope());
    await fundGoal(db, 100_00);
    const context = ctx();
    const logged = await logWithReward(db, expense({ amount: 60_00, goalId: 'g1' }), context);
    if (!logged.ok) throw new Error('expected the contribution to land');
    await deleteLogged(db, logged.transaction.id, context);

    const restored = await restoreLogged(db, logged.transaction.id, context);
    expect(restored?.transaction.deletedAt).toBeUndefined();
    expect(restored?.goal?.saved).toBe(60_00);
    const row = await db.transactions.get(logged.transaction.id);
    expect(row?.deletedAt).toBeUndefined();
    expect((await getGoal(db, 'g1'))?.saved).toBe(60_00);
  });

  it('does not pay the log reward twice, because the ledger key is already spent', async () => {
    const db = testDb('restore-reward');
    await saveEnvelope(db, envelope());
    const context = ctx();
    const logged = await logWithReward(db, expense(), context);
    if (!logged.ok) throw new Error('expected the entry to land');
    await deleteLogged(db, logged.transaction.id, context);
    await restoreLogged(db, logged.transaction.id, context);
    const logEvents = (await ledgerEvents(db)).filter((event) => event.type === 'log');
    expect(logEvents).toHaveLength(1);
  });

  it('refuses to restore an entry that was never deleted, or one that does not exist', async () => {
    const db = testDb('restore-refuse');
    await saveEnvelope(db, envelope());
    const logged = await logWithReward(db, expense(), ctx());
    if (!logged.ok) throw new Error('expected the entry to land');
    expect(await restoreLogged(db, logged.transaction.id, ctx())).toBeNull();
    expect(await restoreLogged(db, 'nope', ctx())).toBeNull();
  });
});
