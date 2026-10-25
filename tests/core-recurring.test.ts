import { describe, expect, it } from 'vitest';
import { missedOccurrences, occurrenceDates, occurrenceKey } from '../src/core/recurring';
import type { Recurring, Transaction } from '../src/core/types';

function rule(partial: Partial<Recurring> & { id: string }): Recurring {
  return {
    template: { kind: 'expense', amount: 100, envelopeId: 'e1' },
    cadence: 'weekly',
    startDate: '2026-01-07',
    ...partial,
  };
}

function txnWithKey(key: string): Transaction {
  return {
    id: key,
    kind: 'expense',
    amount: 100,
    envelopeId: 'e1',
    date: key.slice(-10),
    createdAt: 0,
    updatedAt: 0,
    occurrenceKey: key,
  };
}

describe('occurrenceDates', () => {
  it('weekly rules land on the start weekday', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07' }); // a Wednesday
    expect(occurrenceDates(r, '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-07',
      '2026-01-14',
      '2026-01-21',
      '2026-01-28',
    ]);
  });

  it('weekly rules start at the first occurrence at or after `from`', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07' });
    expect(occurrenceDates(r, '2026-01-08', '2026-01-31')).toEqual([
      '2026-01-14',
      '2026-01-21',
      '2026-01-28',
    ]);
  });

  it('biweekly rules skip a week', () => {
    const r = rule({ id: 'r1', cadence: 'biweekly', startDate: '2026-01-07' });
    expect(occurrenceDates(r, '2026-01-01', '2026-01-31')).toEqual(['2026-01-07', '2026-01-21']);
  });

  it('monthly rules clamp to the month length', () => {
    const r = rule({ id: 'r1', cadence: 'monthly', startDate: '2026-01-31' });
    expect(occurrenceDates(r, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('respects endDate', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07', endDate: '2026-01-15' });
    expect(occurrenceDates(r, '2026-01-01', '2026-01-31')).toEqual(['2026-01-07', '2026-01-14']);
  });
});

describe('missedOccurrences', () => {
  it('generates missed occurrences up to today, skipping already-logged keys', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07' });
    const existing = txnWithKey('rec:r1:2026-01-07');
    const missed = missedOccurrences([r], [existing], '2026-01-20');
    expect(missed.map((m) => m.date)).toEqual(['2026-01-14']);
  });

  it('is idempotent: re-running after applying the generated keys yields nothing', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07' });
    const first = missedOccurrences([r], [], '2026-01-31');
    expect(first.length).toBe(4);
    const applied = first.map((m) => txnWithKey(m.key));
    expect(missedOccurrences([r], applied, '2026-01-31')).toEqual([]);
  });

  it('catches up long absences deterministically', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07' });
    const missed = missedOccurrences([r], [], '2026-12-31');
    expect(missed.length).toBe(52); // Wednesdays in 2026
    expect(missed[0]!.date).toBe('2026-01-07');
    expect(missed.at(-1)!.date).toBe('2026-12-30');
  });

  it('honours lastGenerated as the resume point', () => {
    const r = rule({ id: 'r1', startDate: '2026-01-07', lastGenerated: '2026-01-21' });
    const missed = missedOccurrences([r], [], '2026-01-31');
    expect(missed.map((m) => m.date)).toEqual(['2026-01-28']);
  });

  it('occurrence keys are stable and namespaced', () => {
    expect(occurrenceKey('r1', '2026-01-07')).toBe('rec:r1:2026-01-07');
  });
});
