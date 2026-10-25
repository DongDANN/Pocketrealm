import { describe, expect, it } from 'vitest';
import {
  envelopeRowsForPeriod,
  monthlyTotals,
  previousPeriod,
  streakCalendar,
  topNotes,
} from '../src/core/insights';
import type { Envelope, Transaction } from '../src/core/types';

const env = (id: string, allowance: number, extra: Partial<Envelope> = {}): Envelope => ({
  id,
  name: id,
  icon: 'x',
  colorKey: 'moss',
  monthlyAllowance: allowance,
  archived: false,
  rollover: 'carry',
  sortOrder: 0,
  ...extra,
});

const txn = (
  t: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'date'>,
): Transaction =>
  ({
    id: crypto.randomUUID(),
    createdAt: 0,
    updatedAt: 0,
    ...t,
  }) as Transaction;

describe('envelopeRowsForPeriod', () => {
  it('sums expenses and transfers per envelope inside the period window', () => {
    const txns = [
      txn({ kind: 'expense', amount: 500, date: '2026-10-05', envelopeId: 'food' }),
      txn({ kind: 'expense', amount: 300, date: '2026-10-20', envelopeId: 'food' }),
      txn({
        kind: 'transfer',
        amount: 200,
        date: '2026-10-10',
        envelopeId: 'food',
        toEnvelopeId: 'fun',
      }),
      txn({
        kind: 'transfer',
        amount: 50,
        date: '2026-10-11',
        envelopeId: 'fun',
        toEnvelopeId: 'food',
      }),
      txn({ kind: 'expense', amount: 999, date: '2026-09-30', envelopeId: 'food' }),
      txn({ kind: 'expense', amount: 999, date: '2026-11-01', envelopeId: 'food' }),
    ];
    const result = envelopeRowsForPeriod(
      [env('food', 2000), env('fun', 1000), env('gone', 500, { archived: true })],
      txns,
      '2026-10-15',
      1,
    );
    expect(result.periodId).toBe('2026-10-01');
    expect(result.rows).toHaveLength(2);
    const food = result.rows.find((r) => r.envelopeId === 'food')!;
    expect(food.spent).toBe(500 + 300 + 200 - 50);
    expect(food.remaining).toBe(2000 - food.spent);
    expect(result.totalSpent).toBe(
      food.spent + result.rows.find((r) => r.envelopeId === 'fun')!.spent,
    );
  });

  it('ignores deleted and income transactions', () => {
    const txns = [
      txn({ kind: 'expense', amount: 100, date: '2026-10-05', envelopeId: 'food' }),
      txn({ kind: 'expense', amount: 400, date: '2026-10-05', envelopeId: 'food', deletedAt: 1 }),
      txn({ kind: 'income', amount: 5000, date: '2026-10-05', envelopeId: 'food' }),
    ];
    const result = envelopeRowsForPeriod([env('food', 1000)], txns, '2026-10-15', 1);
    expect(result.rows[0]!.spent).toBe(100);
  });

  it('computes percentUsed with a zero-allowance envelope', () => {
    const result = envelopeRowsForPeriod(
      [env('zero', 0)],
      [txn({ kind: 'expense', amount: 50, date: '2026-10-05', envelopeId: 'zero' })],
      '2026-10-15',
      1,
    );
    expect(result.rows[0]!.percentUsed).toBe(100);
    const empty = envelopeRowsForPeriod([env('zero', 0)], [], '2026-10-15', 1);
    expect(empty.rows[0]!.percentUsed).toBe(0);
  });
});

describe('previousPeriod', () => {
  it('returns the window right before the current period', () => {
    const prev = previousPeriod('2026-10-15', 1);
    expect(prev.start).toBe('2026-09-01');
    expect(prev.end).toBe('2026-09-30');
  });

  it('handles a custom start day across a month boundary', () => {
    const prev = previousPeriod('2026-03-05', 15);
    expect(prev.start).toBe('2026-01-15');
    expect(prev.end).toBe('2026-02-14');
  });
});

describe('monthlyTotals', () => {
  it('returns `months` entries oldest first with income, expenses, and net', () => {
    const txns = [
      txn({ kind: 'income', amount: 40000, date: '2026-07-01' }),
      txn({ kind: 'expense', amount: 10000, date: '2026-07-31' }),
      txn({ kind: 'expense', amount: 5000, date: '2026-08-15' }),
      txn({
        kind: 'transfer',
        amount: 700,
        date: '2026-09-03',
        envelopeId: 'a',
        toEnvelopeId: 'b',
      }),
    ];
    const totals = monthlyTotals(txns, 6, '2026-10-15');
    expect(totals).toHaveLength(6);
    expect(totals[0]!.month).toBe('2026-05');
    expect(totals[5]!.month).toBe('2026-10');
    expect(totals[2]).toEqual({ month: '2026-07', income: 40000, expenses: 10000, net: 30000 });
    expect(totals[3]).toEqual({ month: '2026-08', income: 0, expenses: 5000, net: -5000 });
    // Transfers count as expenses (money movement, not income)
    expect(totals[4]!.expenses).toBe(700);
    expect(totals[4]!.net).toBe(-700);
  });

  it('ignores deleted transactions and crosses a year boundary', () => {
    const txns = [
      txn({ kind: 'expense', amount: 100, date: '2025-12-31' }),
      txn({ kind: 'expense', amount: 200, date: '2026-01-01' }),
      txn({ kind: 'expense', amount: 300, date: '2026-01-15', deletedAt: 1 }),
    ];
    const totals = monthlyTotals(txns, 3, '2026-02-10');
    expect(totals.map((t) => t.month)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(totals[0]!.expenses).toBe(100);
    expect(totals[1]!.expenses).toBe(200);
  });
});

describe('topNotes', () => {
  it('groups case-insensitively by total then count, capped at limit', () => {
    const txns = [
      txn({ kind: 'expense', amount: 100, date: '2026-10-01', note: '  Coffee Shop ' }),
      txn({ kind: 'expense', amount: 150, date: '2026-10-02', note: 'coffee shop' }),
      txn({ kind: 'expense', amount: 300, date: '2026-10-03', note: 'Market' }),
      txn({ kind: 'expense', amount: 50, date: '2026-10-04', note: 'Coffee Shop' }),
      txn({ kind: 'income', amount: 999, date: '2026-10-05', note: 'Salary' }),
      txn({ kind: 'expense', amount: 80, date: '2026-10-06' }),
    ];
    const top = topNotes(txns, 2);
    expect(top).toHaveLength(2);
    expect(top[0]).toEqual({ note: 'coffee shop', count: 3, total: 300 });
    expect(top[1]).toEqual({ note: 'market', count: 1, total: 300 });
  });
});

describe('streakCalendar', () => {
  it('is Monday-first, covers `weeks` weeks ending at today, and marks active days', () => {
    // 2026-10-25 is a Sunday
    const cal = streakCalendar(['2026-10-20', '2026-10-25'], '2026-10-25', 2);
    expect(cal).toHaveLength(2);
    expect(cal[0]!.days[0]!.date).toBe('2026-10-12'); // Monday of previous week
    expect(cal[1]!.days[6]!.date).toBe('2026-10-25'); // ends on today (Sunday)
    expect(cal[1]!.days[6]!.active).toBe(true);
    expect(cal[1]!.days[1]!.active).toBe(true); // 2026-10-20 = Tuesday
    expect(cal[1]!.days[0]!.active).toBe(false); // 2026-10-19 = Monday
    const activeCount = cal.flatMap((w) => w.days).filter((d) => d.active).length;
    expect(activeCount).toBe(2);
  });
});
