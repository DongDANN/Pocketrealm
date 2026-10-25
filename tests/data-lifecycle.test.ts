/**
 * Gate 2d — the two jobs that run when the app opens: close any budget period that has ended
 * (SPEC 6.3 "month rollover with a summary") and generate recurring transactions that came due
 * while it was shut (SPEC 6.4 "generated on open, idempotent by occurrence key"). Both must be safe
 * to run twice: an app that opens five times a day must not sweep a goal twice or log rent twice.
 */

import { describe, expect, it, vi } from 'vitest';
import { periodOf } from '../src/core/periods';
import type { Clock, Envelope, Goal, Recurring, Transaction } from '../src/core/types';
import {
  carryInsForPeriod,
  closeEndedPeriods,
  generateRecurringOnOpen,
} from '../src/data/lifecycle';
import {
  deleteTransaction,
  getSettings,
  listTransactions,
  saveEnvelope,
  saveGoal,
  saveSettings,
  upsertRecurring,
  writeTransaction,
} from '../src/data/repos';
import { testDb } from './data-harness';

const clock = (ms: number, date: string): Clock => ({ now: () => ms, today: () => date });
const NOW = 1_760_000_000_000;

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

const rule = (over: Partial<Recurring> = {}): Recurring => ({
  id: 'rent-monthly',
  cadence: 'monthly',
  startDate: '2026-10-01',
  template: { kind: 'expense', amount: 150_00, envelopeId: 'rent' },
  ...over,
});

/** Deterministic ids, so a multi-occurrence open does not collide on the primary key. */
function seq(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

async function startDay(db: ReturnType<typeof testDb>, day: number) {
  const settings = await getSettings(db);
  await saveSettings(db, { ...settings, periodStartDay: day });
}

describe('period close', () => {
  it('closes the period that ended and stores the summary by periodId', async () => {
    const db = testDb('close-basic');
    await saveEnvelope(db, envelope({ id: 'food', monthlyAllowance: 100_00 }));
    await writeTransaction(
      db,
      { kind: 'expense', amount: 30_00, envelopeId: 'food', date: '2026-10-12' },
      { clock: clock(NOW, '2026-10-12'), newId: () => 't1' },
    );

    const outcome = await closeEndedPeriods(db, clock(NOW, '2026-11-05'));
    expect(outcome.closed.map((s) => s.periodId)).toEqual(['2026-10-01']);
    expect(outcome.current.id).toBe('2026-11-01');

    const row = await db.periodCloses.get('2026-10-01');
    expect(row?.perEnvelope[0]).toMatchObject({ allowance: 100_00, spent: 30_00, result: 70_00 });
    expect(row?.totalSaved).toBe(70_00);
    expect(row?.activeDays).toBe(1);
    db.close();
  });

  it('is idempotent: a second open closes nothing and sweeps nothing again', async () => {
    const db = testDb('close-twice');
    await saveGoal(db, {
      id: 'emergency',
      name: 'Emergency',
      target: 1000_00,
      saved: 0,
      icon: 'jar',
      archived: false,
    } satisfies Goal);
    await saveEnvelope(
      db,
      envelope({ id: 'fun', rollover: 'sweep-to-goal', sweepGoalId: 'emergency' }),
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 40_00, envelopeId: 'fun', date: '2026-10-20' },
      { clock: clock(NOW, '2026-10-20'), newId: () => 't1' },
    );

    const first = await closeEndedPeriods(db, clock(NOW, '2026-11-05'));
    expect((await db.goals.get('emergency'))?.saved).toBe(60_00);

    const second = await closeEndedPeriods(db, clock(NOW + 86_400_000, '2026-11-06'));
    expect(second.closed).toEqual([]);
    expect((await db.goals.get('emergency'))?.saved).toBe(60_00);
    await expect(db.periodCloses.count()).resolves.toBe(1);
    expect(first.closed[0]?.perEnvelope[0]).toMatchObject({ swept: 60_00, result: 60_00 });
    db.close();
  });

  it('carries a surplus into the next period and reports it as carry-in', async () => {
    const db = testDb('close-carry');
    await saveEnvelope(db, envelope({ id: 'food', monthlyAllowance: 100_00, rollover: 'carry' }));
    await writeTransaction(
      db,
      { kind: 'expense', amount: 30_00, envelopeId: 'food', date: '2026-10-12' },
      { clock: clock(NOW, '2026-10-12'), newId: () => 't1' },
    );

    await closeEndedPeriods(db, clock(NOW, '2026-11-05'));
    expect([...(await carryInsForPeriod(db, '2026-11-01'))]).toEqual([['food', 70_00]]);

    // November starts with October's left-over: 170_00 available, 20_00 spent leaves 150_00.
    await writeTransaction(
      db,
      { kind: 'expense', amount: 20_00, envelopeId: 'food', date: '2026-11-12' },
      { clock: clock(NOW, '2026-11-12'), newId: () => 't2' },
    );
    const november = await closeEndedPeriods(db, clock(NOW, '2026-12-05'));
    expect(november.closed[0]?.perEnvelope[0]).toMatchObject({ carryIn: 70_00, result: 150_00 });
    db.close();
  });

  it('closes every period missed while the app was shut, oldest first', async () => {
    const db = testDb('close-backlog');
    await saveEnvelope(db, envelope({ id: 'food', monthlyAllowance: 100_00, rollover: 'carry' }));
    for (const [id, date] of [
      ['t1', '2026-10-05'],
      ['t2', '2026-11-05'],
      ['t3', '2026-12-05'],
    ] as const) {
      await writeTransaction(
        db,
        { kind: 'expense', amount: 10_00, envelopeId: 'food', date },
        { clock: clock(NOW, date), newId: () => id },
      );
    }

    const outcome = await closeEndedPeriods(db, clock(NOW, '2027-02-05'));
    expect(outcome.closed.map((s) => s.periodId)).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ]);
    // The carry chains: 90, then 90+100-10=180, then 180+100-10=270, then 270+100-0=370.
    expect(outcome.closed.map((s) => s.perEnvelope[0]?.result)).toEqual([
      90_00, 180_00, 270_00, 370_00,
    ]);
    db.close();
  });

  it('never closes the period still running', async () => {
    const db = testDb('close-current');
    await saveEnvelope(db, envelope());
    const outcome = await closeEndedPeriods(db, clock(NOW, '2026-10-15'));
    expect(outcome.closed).toEqual([]);
    expect(outcome.current.id).toBe('2026-10-01');
    await expect(db.periodCloses.count()).resolves.toBe(0);
    db.close();
  });

  it('follows a custom period start day', async () => {
    const db = testDb('close-startday');
    await startDay(db, 15);
    await saveEnvelope(db, envelope({ id: 'food', monthlyAllowance: 100_00 }));
    await writeTransaction(
      db,
      { kind: 'expense', amount: 25_00, envelopeId: 'food', date: '2026-10-20' },
      { clock: clock(NOW, '2026-10-20'), newId: () => 't1' },
    );

    const outcome = await closeEndedPeriods(db, clock(NOW, '2026-11-20'));
    expect(outcome.closed.map((s) => s.periodId)).toEqual(['2026-10-15']);
    expect(outcome.current).toEqual(periodOf('2026-11-20', 15));
    db.close();
  });

  it('counts a deleted transaction as never spent', async () => {
    const db = testDb('close-deleted');
    await saveEnvelope(db, envelope({ id: 'food', monthlyAllowance: 100_00 }));
    await writeTransaction(
      db,
      { kind: 'expense', amount: 30_00, envelopeId: 'food', date: '2026-10-12' },
      { clock: clock(NOW, '2026-10-12'), newId: () => 't1' },
    );
    await deleteTransaction(db, 't1', clock(NOW, '2026-10-13'));

    const outcome = await closeEndedPeriods(db, clock(NOW, '2026-11-05'));
    expect(outcome.closed[0]?.perEnvelope[0]).toMatchObject({ spent: 0, result: 100_00 });
    db.close();
  });

  it('rolls a close back when the goal sweep fails', async () => {
    const db = testDb('close-atomic');
    await saveGoal(db, {
      id: 'emergency',
      name: 'Emergency',
      target: 1000_00,
      saved: 0,
      icon: 'jar',
      archived: false,
    } satisfies Goal);
    await saveEnvelope(
      db,
      envelope({ id: 'fun', rollover: 'sweep-to-goal', sweepGoalId: 'emergency' }),
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 40_00, envelopeId: 'fun', date: '2026-10-20' },
      { clock: clock(NOW, '2026-10-20'), newId: () => 't1' },
    );

    // A summary written next to a sweep that never landed would show a month as closed while the
    // money is still in the envelope, and the idempotence key would hide it from the retry.
    vi.spyOn(db.goals, 'put').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(closeEndedPeriods(db, clock(NOW, '2026-11-05'))).rejects.toThrow('quota');
    vi.restoreAllMocks();

    await expect(db.periodCloses.count()).resolves.toBe(0);
    expect((await db.goals.get('emergency'))?.saved).toBe(0);

    // And the next open completes what this one could not.
    const retry = await closeEndedPeriods(db, clock(NOW, '2026-11-06'));
    expect(retry.closed.map((s) => s.periodId)).toEqual(['2026-10-01']);
    expect((await db.goals.get('emergency'))?.saved).toBe(60_00);
    db.close();
  });
});

describe('recurring generation on open', () => {
  it('creates each missed occurrence once', async () => {
    const db = testDb('recur-basic');
    await upsertRecurring(db, rule());
    const ctx = { clock: clock(NOW, '2026-12-15'), newId: seq('gen') };

    const result = await generateRecurringOnOpen(db, ctx);
    expect(result.written).toBe(3);
    const rows = await listTransactions(db, { includeDeleted: true });
    expect(rows.map((t) => t.date).sort()).toEqual(['2026-10-01', '2026-11-01', '2026-12-01']);
    expect(rows.every((t) => t.recurringId === 'rent-monthly')).toBe(true);
    expect(rows.find((r) => r.date === '2026-10-01')?.occurrenceKey).toBe(
      'rec:rent-monthly:2026-10-01',
    );

    // Opening again the same day, and the next day, adds nothing.
    expect((await generateRecurringOnOpen(db, ctx)).written).toBe(0);
    expect(
      (
        await generateRecurringOnOpen(db, {
          clock: clock(NOW + 86_400_000, '2026-12-16'),
          newId: seq('gen'),
        })
      ).written,
    ).toBe(0);
    await expect(db.transactions.count()).resolves.toBe(3);
    db.close();
  });

  it('leaves an occurrence the user logged by hand alone', async () => {
    const db = testDb('recur-hand');
    await upsertRecurring(db, rule());
    await writeTransaction(
      db,
      {
        kind: 'expense',
        amount: 149_00,
        envelopeId: 'rent',
        date: '2026-10-01',
        occurrenceKey: 'rec:rent-monthly:2026-10-01',
      },
      { clock: clock(NOW, '2026-10-01'), newId: () => 'hand-1' },
    );

    const result = await generateRecurringOnOpen(db, {
      clock: clock(NOW, '2026-12-15'),
      newId: seq('gen'),
    });
    expect(result.written).toBe(2);
    const oct = await db.transactions.get('hand-1');
    expect(oct?.amount).toBe(149_00); // the hand-logged amount is never overwritten
    db.close();
  });

  it('does not resurrect a deleted occurrence', async () => {
    const db = testDb('recur-deleted');
    await upsertRecurring(db, rule());
    // One id sequence across both opens, because ids have to be unique in the table.
    const nextId = seq('gen');
    await generateRecurringOnOpen(db, { clock: clock(NOW, '2026-10-05'), newId: nextId });
    await deleteTransaction(db, 'gen-1', clock(NOW, '2026-10-06'));

    const result = await generateRecurringOnOpen(db, {
      clock: clock(NOW, '2026-12-15'),
      newId: nextId,
    });
    expect(result.written).toBe(2); // Nov and Dec only
    expect(await db.transactions.get('gen-1')).toBeTruthy();
    expect((await db.transactions.get('gen-1'))?.deletedAt).toBeDefined();
    db.close();
  });

  it('waits for a rule whose first date has not arrived', async () => {
    const db = testDb('recur-future');
    await upsertRecurring(db, rule({ startDate: '2026-11-01' }));
    const result = await generateRecurringOnOpen(db, {
      clock: clock(NOW, '2026-10-15'),
      newId: seq('gen'),
    });
    expect(result.written).toBe(0);
    await expect(db.transactions.count()).resolves.toBe(0);
    db.close();
  });

  it('stops at an end date and advances lastGenerated for the next open', async () => {
    const db = testDb('recur-end');
    await upsertRecurring(db, rule({ startDate: '2026-10-01', endDate: '2026-11-01' }));
    const ctx = { clock: clock(NOW, '2026-12-15'), newId: seq('gen') };
    expect((await generateRecurringOnOpen(db, ctx)).written).toBe(2);
    expect((await db.recurrings.get('rent-monthly'))?.lastGenerated).toBe('2026-11-01');
    expect((await generateRecurringOnOpen(db, ctx)).written).toBe(0);
    db.close();
  });

  it('generates weekly and biweekly cadences on their own days', async () => {
    const db = testDb('recur-cadence');
    await upsertRecurring(
      db,
      rule({ id: 'pay-weekly', cadence: 'weekly', startDate: '2026-10-01' }),
    );
    await upsertRecurring(
      db,
      rule({ id: 'bus-biweekly', cadence: 'biweekly', startDate: '2026-10-03' }),
    );

    const result = await generateRecurringOnOpen(db, {
      clock: clock(NOW, '2026-10-18'),
      newId: seq('gen'),
    });
    const rows = (await listTransactions(db, { includeDeleted: true })).sort((a, b) =>
      a.date < b.date ? -1 : 1,
    );
    expect(result.written).toBe(5);
    expect(rows.filter((r) => r.recurringId === 'pay-weekly').map((r) => r.date)).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
    ]);
    expect(rows.filter((r) => r.recurringId === 'bus-biweekly').map((r) => r.date)).toEqual([
      '2026-10-03',
      '2026-10-17',
    ]);
    db.close();
  });

  it('writes every occurrence of one open in a single transaction', async () => {
    const db = testDb('recur-atomic');
    await upsertRecurring(db, rule());
    await upsertRecurring(
      db,
      rule({ id: 'net-monthly', template: { kind: 'expense', amount: 20_00, envelopeId: 'food' } }),
    );
    const before = await db.transactions.count();

    // The first insert is allowed to land and the second fails: without one transaction, the run
    // would leave one orphan occurrence behind and mark the rule half-generated. The first write
    // goes through to the real table, so the orphan would be a real row this test can see.
    let adds = 0;
    const realAdd = db.transactions.add.bind(db.transactions);
    vi.spyOn(db.transactions, 'add').mockImplementation((async (obj: Transaction) => {
      adds += 1;
      if (adds === 1) return realAdd(obj);
      throw new Error('quota');
    }) as typeof db.transactions.add);
    const ctx = { clock: clock(NOW, '2026-12-15'), newId: seq('gen') };
    await expect(generateRecurringOnOpen(db, ctx)).rejects.toThrow('quota');
    vi.restoreAllMocks();
    expect(adds).toBeGreaterThan(1);
    expect(await db.transactions.count()).toBe(before);
    expect((await db.recurrings.get('rent-monthly'))?.lastGenerated).toBeUndefined();
    db.close();
  });
});
