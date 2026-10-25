import { describe, expect, it } from 'vitest';
import { envelopeStatus, safeToSpendToday, spentToday, validateTransfer } from '../src/core/budget';
import { addDays } from '../src/core/dates';
import { closePlan, daysLeftInclusive, periodOf, periodEnded } from '../src/core/periods';
import type { Envelope, Transaction } from '../src/core/types';

function env(id: string, allowance: number, rollover: Envelope['rollover'] = 'none'): Envelope {
  return {
    id,
    name: id,
    icon: 'x',
    colorKey: 'moss',
    monthlyAllowance: allowance,
    rollover,
    archived: false,
    sortOrder: 0,
  };
}

function txn(
  id: string,
  kind: Transaction['kind'],
  amount: number,
  date: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    kind,
    amount,
    date,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

describe('period math', () => {
  it('default period runs the calendar month', () => {
    const p = periodOf('2026-10-25', 1);
    expect(p.start).toBe('2026-10-01');
    expect(p.end).toBe('2026-10-31');
    expect(daysLeftInclusive(p, '2026-10-25')).toBe(7);
    expect(daysLeftInclusive(p, '2026-10-31')).toBe(1);
    expect(periodEnded(p, '2026-11-01')).toBe(true);
    expect(periodEnded(p, '2026-10-31')).toBe(false);
  });

  it('custom start day splits the month', () => {
    const p = periodOf('2026-10-25', 25);
    expect(p.start).toBe('2026-10-25');
    expect(p.end).toBe('2026-11-24');
    const before = periodOf('2026-10-24', 25);
    expect(before.start).toBe('2026-09-25');
    expect(before.end).toBe('2026-10-24');
  });

  it('start day 28 clamps across short months', () => {
    const p = periodOf('2026-02-28', 28);
    expect(p.start).toBe('2026-02-28');
    expect(p.end).toBe('2026-03-27');
  });

  it('handles leap-year February', () => {
    const p = periodOf('2024-02-15', 1);
    expect(p.end).toBe('2024-02-29');
  });

  it('start day 31 clamps to 28 and stays stable across months', () => {
    const a = periodOf('2026-02-10', 31);
    const b = periodOf('2026-03-10', 31);
    expect(a.start).toBe('2026-01-28');
    expect(a.end).toBe('2026-02-27');
    expect(b.start).toBe('2026-02-28');
    expect(b.end).toBe('2026-03-27');
    expect(addDays(a.end, 1)).toBe(b.start);
  });
});

describe('envelope status', () => {
  it('classifies ok / warning at 80 / over, and shows negative remaining', () => {
    expect(envelopeStatus(env('a', 1000), 0, 0).state).toBe('ok');
    expect(envelopeStatus(env('a', 1000), 0, 799).state).toBe('ok');
    const warn = envelopeStatus(env('a', 1000), 0, 800);
    expect(warn.state).toBe('warning');
    expect(warn.percentUsed).toBe(80);
    const over = envelopeStatus(env('a', 1000), 0, 1250);
    expect(over.state).toBe('over');
    expect(over.remaining).toBe(-250);
  });

  it('includes carry in the budget', () => {
    const s = envelopeStatus(env('a', 1000, 'carry'), 300, 1000);
    expect(s.remaining).toBe(300);
    expect(s.percentUsed).toBe(77);
  });
});

describe('safe to spend', () => {
  it('divides remaining by days left, floors per envelope, then sums', () => {
    const statuses = [envelopeStatus(env('a', 3100), 0, 0), envelopeStatus(env('b', 1000), 0, 990)];
    // 31 days left: 3100/31 = 100, 10/31 = 0
    expect(safeToSpendToday(statuses, '2026-10-01', 1)).toBe(100);
  });

  it('ignores over and zero envelopes and returns 0 when nothing is left', () => {
    const statuses = [envelopeStatus(env('a', 1000), 0, 1000)];
    expect(safeToSpendToday(statuses, '2026-10-25', 1)).toBe(0);
  });
});

describe('spent today', () => {
  it('sums expenses and transfers on the given day, ignoring deleted and income', () => {
    const txns = [
      txn('1', 'expense', 250, '2026-10-25'),
      txn('2', 'transfer', 100, '2026-10-25'),
      txn('3', 'income', 5000, '2026-10-25'),
      txn('4', 'expense', 999, '2026-10-24'),
      txn('5', 'expense', 777, '2026-10-25', { deletedAt: 1 }),
    ];
    expect(spentToday(txns, '2026-10-25')).toBe(350);
  });
});

describe('transfer validation', () => {
  const envs = new Map([
    ['a', env('a', 100)],
    ['b', env('b', 100)],
  ]);
  it('accepts a valid transfer', () => {
    expect(
      validateTransfer(
        txn('1', 'transfer', 50, '2026-10-25', { envelopeId: 'a', toEnvelopeId: 'b' }),
        envs,
      ),
    ).toBeNull();
  });
  it('rejects zero, negative, self, and unknown envelopes', () => {
    expect(
      validateTransfer(
        txn('1', 'transfer', 0, '2026-10-25', { envelopeId: 'a', toEnvelopeId: 'b' }),
        envs,
      ),
    ).toMatch(/positive/);
    expect(
      validateTransfer(
        txn('1', 'transfer', -5, '2026-10-25', { envelopeId: 'a', toEnvelopeId: 'b' }),
        envs,
      ),
    ).toMatch(/positive/);
    expect(
      validateTransfer(
        txn('1', 'transfer', 5, '2026-10-25', { envelopeId: 'a', toEnvelopeId: 'a' }),
        envs,
      ),
    ).toMatch(/differ/);
    expect(
      validateTransfer(
        txn('1', 'transfer', 5, '2026-10-25', { envelopeId: 'a', toEnvelopeId: 'zz' }),
        envs,
      ),
    ).toMatch(/Unknown/);
    expect(validateTransfer(txn('1', 'transfer', 5, '2026-10-25'), envs)).toMatch(
      /source and destination/,
    );
  });
});

describe('period close plan', () => {
  const period = periodOf('2026-10-15', 1);
  const envelopes = [
    env('food', 1000, 'carry'),
    env('fun', 500, 'none'),
    { ...env('save', 300, 'sweep-to-goal'), sweepGoalId: 'g1' },
  ];

  it('computes results, carries, and sweeps', () => {
    const txns = [
      txn('1', 'expense', 600, '2026-10-05', { envelopeId: 'food' }),
      txn('2', 'expense', 700, '2026-10-06', { envelopeId: 'fun' }),
      txn('3', 'expense', 100, '2026-10-07', { envelopeId: 'save' }),
    ];
    const result = closePlan(period, envelopes, txns);
    expect(result.carries.get('food')).toBe(400);
    expect(result.sweeps).toEqual([{ envelopeId: 'save', goalId: 'g1', amount: 200 }]);
    const food = result.summary.perEnvelope.find((r) => r.envelopeId === 'food')!;
    expect(food.spent).toBe(600);
    expect(food.result).toBe(400);
  });

  it('is deterministic and safe to run twice', () => {
    const txns = [txn('1', 'expense', 600, '2026-10-05', { envelopeId: 'food' })];
    const a = closePlan(period, envelopes, txns);
    const b = closePlan(period, envelopes, txns);
    expect(a).toEqual(b);
  });

  it('nets transfers so totals conserve', () => {
    const txns = [
      txn('1', 'transfer', 100, '2026-10-05', { envelopeId: 'food', toEnvelopeId: 'fun' }),
    ];
    const result = closePlan(period, envelopes, txns);
    const food = result.summary.perEnvelope.find((r) => r.envelopeId === 'food')!;
    const fun = result.summary.perEnvelope.find((r) => r.envelopeId === 'fun')!;
    expect(food.spent).toBe(100);
    expect(fun.spent).toBe(-100);
    expect(food.spent + fun.spent).toBe(0);
  });

  it('applies carry-in from the previous period', () => {
    const txns = [txn('1', 'expense', 1100, '2026-10-05', { envelopeId: 'food' })];
    const result = closePlan(period, envelopes, txns, new Map([['food', 300]]));
    const food = result.summary.perEnvelope.find((r) => r.envelopeId === 'food')!;
    expect(food.result).toBe(200);
    expect(result.carries.get('food')).toBe(200);
  });
});
