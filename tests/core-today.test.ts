import { describe, expect, it } from 'vitest';
import { guardianArtCopy, todayBoard } from '../src/core/today';
import type { Companion, Envelope, Transaction } from '../src/core/types';

const TODAY = '2026-10-25';

function envelope(id: string, allowance: number, extra: Partial<Envelope> = {}): Envelope {
  return {
    id,
    name: id.toUpperCase(),
    icon: 'jar',
    colorKey: 'moss',
    monthlyAllowance: allowance,
    rollover: 'none',
    archived: false,
    sortOrder: 0,
    ...extra,
  };
}

let seq = 0;
function txn(over: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    kind: 'expense',
    amount: 0,
    date: TODAY,
    createdAt: seq,
    updatedAt: seq,
    ...over,
  };
}

function companion(over: Partial<Companion> = {}): Companion {
  return {
    id: 'c1',
    speciesKey: 'mossling',
    name: 'Warden',
    cosmetics: [],
    equipped: {},
    ...over,
  };
}

function board(over: Partial<Parameters<typeof todayBoard>[0]> = {}) {
  return todayBoard({
    today: TODAY,
    startDay: 1,
    envelopes: [envelope('food', 100_00), envelope('bus', 10_00), envelope('fun', 30_00)],
    transactions: [
      txn({ envelopeId: 'food', amount: 50_00 }),
      txn({ envelopeId: 'fun', amount: 45_00 }),
    ],
    carries: new Map([['food', 20_00]]),
    companion: companion(),
    lastLogged: TODAY,
    oil: 40,
    xp: 130,
    streak: 6,
    ...over,
  });
}

describe('today board', () => {
  it('totals what this period allows and what is left', () => {
    const result = board();
    expect([result.allowance, result.remaining]).toEqual([160_00, 65_00]);
  });

  it('states each envelope once, in the order the user arranged them', () => {
    const result = board();
    expect(result.rows.map((row) => row.envelope.id)).toEqual(['food', 'bus', 'fun']);
    expect(result.rows.map((row) => row.status.remaining)).toEqual([70_00, 10_00, -15_00]);
  });

  it('reads carry into the period so a leftover is spendable', () => {
    expect(board().rows[0]!.status.carry).toBe(20_00);
    expect(board().rows[0]!.status.percentUsed).toBe(42);
  });

  it('marks a nearly spent envelope attention and an overspent one over', () => {
    const result = board({
      envelopes: [envelope('tight', 100_00), envelope('gone', 10_00)],
      transactions: [
        txn({ envelopeId: 'tight', amount: 85_00 }),
        txn({ envelopeId: 'gone', amount: 15_00 }),
      ],
      carries: new Map(),
    });
    expect(result.rows.map((row) => row.status.state)).toEqual(['warning', 'over']);
    expect(result.rows.map((row) => row.guardian)).toEqual(['attention', 'overspent']);
    expect(result.rows.map((row) => row.guardianArt)).toEqual(['strain', 'over']);
  });

  it('divides only what is left across the days left, rounding each envelope down', () => {
    // Oct 1-31, today is the 25th: 7 days left. 7000/7 = 1000, 1000/7 = 142.8 -> 142.
    const result = board();
    expect(result.daysLeft).toBe(7);
    expect(result.safeToSpend).toBe(1_142);
  });

  it('never counts an overspent envelope as safe to spend', () => {
    const result = board({ envelopes: [envelope('fun', 30_00)], carries: new Map() });
    expect(result.safeToSpend).toBe(0);
    expect(result.remaining).toBe(-15_00);
  });

  it("counts today's expenses and transfers out, but not income or deleted rows", () => {
    const result = board({
      transactions: [
        txn({ envelopeId: 'food', amount: 12_00 }),
        txn({ kind: 'transfer', envelopeId: 'food', toEnvelopeId: 'fun', amount: 5_00 }),
        txn({ kind: 'income', amount: 99_00 }),
        txn({ envelopeId: 'food', amount: 7_00, deletedAt: 5 }),
        txn({ envelopeId: 'food', amount: 3_00, date: '2026-10-24' }),
      ],
      carries: new Map(),
    });
    expect(result.spentToday).toBe(17_00);
  });

  it('honours a mid-month period start when counting days left', () => {
    const result = board({ startDay: 25 });
    // Sep 25 - Oct 24 closed yesterday, so today opens a fresh period: Oct 25 - Nov 24, 31 days.
    expect(result.daysLeft).toBe(31);
    // 70_00/31 = 225.8 -> 225, 10_00/31 = 32.2 -> 32; the overspent envelope contributes nothing.
    expect(result.safeToSpend).toBe(257);
  });

  it('gives the companion a mood and a line that uses its name', () => {
    const result = board();
    expect(result.mood).toBe('happy');
    expect(result.moodLine).toContain('Warden');
  });

  it('says the companion rested after a week without an entry, without blame', () => {
    const result = board({ lastLogged: '2026-10-18' });
    expect(result.mood).toBe('resting');
    expect(result.moodLine).toContain('Nothing was lost');
  });

  it('reports the level reached and the progress into it', () => {
    const result = board({ xp: 130 });
    expect(result.xp.level).toBe(2);
    expect(result.xp.intoLevel).toBe(70);
    expect(result.xp.need).toBe(170);
  });

  it('passes the streak and oil through unchanged', () => {
    const result = board({ streak: 6, oil: 40 });
    expect([result.streak, result.oil]).toEqual([6, 40]);
  });

  it('stays calm with no envelopes at all instead of dividing by nothing', () => {
    const result = board({ envelopes: [], transactions: [], carries: new Map() });
    expect(result.rows).toEqual([]);
    expect([result.safeToSpend, result.remaining, result.allowance]).toEqual([0, 0, 0]);
    expect(result.daysLeft).toBeGreaterThan(0);
  });

  it('keeps a companion with no logged day content, not worried', () => {
    const result = board({ lastLogged: null });
    expect(result.mood).toBe('content');
  });
});

describe('guardian art copy', () => {
  it('gives every state a distinct, non-empty word', () => {
    const words = (['calm', 'alert', 'strain', 'over'] as const).map(guardianArtCopy);
    expect(words.every((word) => word.length > 2)).toBe(true);
    expect(new Set(words).size).toBe(4);
  });

  it('describes the overspent state without blaming the person', () => {
    const word = guardianArtCopy('over');
    expect(word.toLowerCase()).not.toContain('fail');
    expect(word.toLowerCase()).not.toContain('bad');
  });
});
