/**
 * Gate 3c — the view helpers a screen needs but must not compute inside a component: which envelopes
 * a quick add offers first, how history filters and groups, how a goal's finish date is projected,
 * and how storage is named out loud. Pure, so a browser is never required to prove them.
 */

import { describe, expect, it } from 'vitest';
import {
  bytesLabel,
  dayHeading,
  filterHistory,
  groupByDay,
  projectCompletion,
  recentEnvelopeIds,
  weeksUntil,
} from '../src/core/view';
import type { Envelope, Transaction } from '../src/core/types';

const envelope = (id: string, over: Partial<Envelope> = {}): Envelope => ({
  id,
  name: id,
  icon: 'bowl',
  colorKey: 'moss',
  monthlyAllowance: 100_00,
  rollover: 'none',
  archived: false,
  sortOrder: 0,
  ...over,
});

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1',
  kind: 'expense',
  amount: 10_00,
  envelopeId: 'food',
  date: '2026-10-25',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe('recentEnvelopeIds', () => {
  it('puts the envelope used most recently first', () => {
    const envelopes = [envelope('food'), envelope('fun'), envelope('rent')];
    const rows = [
      txn({ id: 'a', envelopeId: 'fun', date: '2026-10-25' }),
      txn({ id: 'b', envelopeId: 'food', date: '2026-10-24' }),
    ];
    expect(recentEnvelopeIds(rows, envelopes)).toEqual(['fun', 'food', 'rent']);
  });

  it('counts a transfer into the envelope that receives it', () => {
    const envelopes = [envelope('food'), envelope('savings')];
    const rows = [txn({ id: 'a', kind: 'transfer', envelopeId: 'food', toEnvelopeId: 'savings' })];
    expect(recentEnvelopeIds(rows, envelopes)).toEqual(['savings', 'food']);
  });

  it('never offers an archived envelope, however recent its entries', () => {
    const envelopes = [envelope('food'), envelope('gone', { archived: true })];
    const rows = [txn({ id: 'a', envelopeId: 'gone' }), txn({ id: 'b', envelopeId: 'food' })];
    expect(recentEnvelopeIds(rows, envelopes)).toEqual(['food']);
  });

  it('stops at four chips so the pad stays on screen', () => {
    const envelopes = Array.from({ length: 8 }, (_, i) => envelope(`e${i}`));
    expect(recentEnvelopeIds([], envelopes)).toHaveLength(4);
  });

  it('caps the chips even when every envelope has been used', () => {
    const envelopes = Array.from({ length: 6 }, (_, i) => envelope(`e${i}`));
    const rows = envelopes.map((env, i) =>
      txn({ id: `r${i}`, envelopeId: env.id, date: `2026-10-${25 - i}` }),
    );
    expect(recentEnvelopeIds(rows, envelopes)).toEqual(['e0', 'e1', 'e2', 'e3']);
  });

  it('offers a chip for an envelope that is in the entries but not in the list', () => {
    // A deleted envelope must not strand the list, but an id nobody can pick is worse than no id.
    expect(recentEnvelopeIds([txn({ envelopeId: 'ghost' })], [envelope('food')])).toEqual(['food']);
  });
});

describe('filterHistory', () => {
  const envelopes = [envelope('food', { name: 'Groceries' }), envelope('fun', { name: 'Treats' })];
  const rows = [
    txn({ id: 'a', envelopeId: 'food', note: 'Sunday market', amount: 12_50 }),
    txn({ id: 'b', envelopeId: 'fun', note: 'Movie', amount: 30_00, date: '2026-10-01' }),
    txn({ id: 'c', envelopeId: 'food', date: '2026-09-30' }),
  ];

  it('keeps everything when no filter is set', () => {
    expect(filterHistory(rows, envelopes, {})).toHaveLength(3);
  });

  it('matches a note case-insensitively', () => {
    expect(filterHistory(rows, envelopes, { query: 'MARKET' }).map((t) => t.id)).toEqual(['a']);
  });

  it('matches the envelope name, so a search can find a category', () => {
    expect(filterHistory(rows, envelopes, { query: 'treats' }).map((t) => t.id)).toEqual(['b']);
  });

  it('matches the amount in whole currency units', () => {
    expect(filterHistory(rows, envelopes, { query: '1250' }).map((t) => t.id)).toEqual(['a']);
  });

  it('narrows to one envelope including the side a transfer pays into', () => {
    const moved = [txn({ id: 'x', kind: 'transfer', envelopeId: 'food', toEnvelopeId: 'fun' })];
    expect(filterHistory(moved, envelopes, { envelopeId: 'fun' })).toHaveLength(1);
    expect(filterHistory(moved, envelopes, { envelopeId: 'gone' })).toHaveLength(0);
  });

  it('applies a date range at both ends inclusive', () => {
    expect(
      filterHistory(rows, envelopes, { from: '2026-10-01', to: '2026-10-25' }).map((t) => t.id),
    ).toEqual(['a', 'b']);
  });

  it('combines filters, because a user narrows rather than switches', () => {
    expect(filterHistory(rows, envelopes, { envelopeId: 'food', query: 'market' })).toHaveLength(1);
    expect(filterHistory(rows, envelopes, { envelopeId: 'food', query: 'movie' })).toHaveLength(0);
  });

  it('trims the query, so a stray space does not empty the list', () => {
    expect(filterHistory(rows, envelopes, { query: '  movie ' })).toHaveLength(1);
  });

  it('treats a query of only spaces as no query at all', () => {
    expect(filterHistory(rows, envelopes, { query: '   ' })).toHaveLength(3);
  });
});

describe('groupByDay', () => {
  it('sections a newest-first list into days, newest day first', () => {
    const rows = [
      txn({ id: 'a', date: '2026-10-25' }),
      txn({ id: 'b', date: '2026-10-25', amount: 5_00 }),
      txn({ id: 'c', date: '2026-10-23' }),
    ];
    expect(groupByDay(rows).map((d) => [d.date, d.items.length])).toEqual([
      ['2026-10-25', 2],
      ['2026-10-23', 1],
    ]);
  });

  it('totals only expenses for the day heading', () => {
    const rows = [
      txn({ id: 'a', amount: 10_00 }),
      txn({ id: 'b', kind: 'income', amount: 500_00 }),
      txn({ id: 'c', kind: 'transfer', amount: 50_00, toEnvelopeId: 'fun' }),
    ];
    expect(groupByDay(rows)[0]?.spent).toBe(10_00);
  });

  it('returns nothing for nothing', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('projectCompletion', () => {
  it('says when a goal lands at the rate it is moving', () => {
    // 40 left, 20 a month, a 31-day period: two months of the same habit.
    expect(projectCompletion(60_00, 100_00, 20_00, '2026-10-25', 31)).toBe('2026-12-26');
  });

  it('rounds a partial period up to a whole one rather than promising sooner', () => {
    expect(projectCompletion(0, 100_00, 60_00, '2026-10-25', 30)).toBe('2026-12-24');
  });

  it('refuses to project when the goal is already met', () => {
    expect(projectCompletion(100_00, 100_00, 20_00, '2026-10-25', 30)).toBeNull();
  });

  it('refuses to project with no contributions yet, instead of inventing a date', () => {
    expect(projectCompletion(0, 100_00, 0, '2026-10-25', 30)).toBeNull();
  });

  it('refuses to project a goal with no target', () => {
    expect(projectCompletion(10_00, 0, 10_00, '2026-10-25', 30)).toBeNull();
  });

  it('never counts backwards into the past', () => {
    const date = projectCompletion(90_00, 100_00, 10_00, '2026-10-25', 30);
    expect(date).toBe('2026-11-24');
  });
});

describe('weeksUntil', () => {
  it('rounds a remaining stretch up to whole weeks, never down', () => {
    expect(weeksUntil('2026-10-25', '2026-10-25')).toBe(1); // today still counts as a week to act
    expect(weeksUntil('2026-11-08', '2026-10-25')).toBe(2); // 14 days away
    expect(weeksUntil('2026-11-09', '2026-10-25')).toBe(3); // 15 days, and a part week is a week
  });

  it('says nothing about a date already gone', () => {
    expect(weeksUntil('2026-10-24', '2026-10-25')).toBeNull();
  });
});

describe('dayHeading', () => {
  it('names today and yesterday in words', () => {
    expect(dayHeading('2026-10-25', '2026-10-25')).toBe('Today');
    expect(dayHeading('2026-10-24', '2026-10-25')).toBe('Yesterday');
  });

  it('falls back to a localized date for anything older, without a year', () => {
    const label = dayHeading('2026-10-18', '2026-10-25');
    expect(label).toContain('18');
    expect(label).not.toContain('2026');
  });

  it('shows the year once the date leaves this one', () => {
    expect(dayHeading('2025-12-31', '2026-10-25')).toContain('2025');
  });
});

describe('bytesLabel', () => {
  it('stays in kilobytes below a megabyte', () => {
    expect(bytesLabel(0)).toBe('0 KB');
    expect(bytesLabel(512 * 1024)).toBe('512 KB');
  });

  it('gives one decimal while a figure is small, then rounds', () => {
    expect(bytesLabel(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(bytesLabel(640 * 1024 * 1024)).toBe('640 MB');
  });

  it('switches to gigabytes past a thousand megabytes', () => {
    expect(bytesLabel(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('names a broken reading as nothing rather than NaN', () => {
    expect(bytesLabel(Number.NaN)).toBe('0 KB');
    expect(bytesLabel(-5)).toBe('0 KB');
  });
});
