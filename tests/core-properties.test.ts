import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { closePlan, periodOf, daysLeftInclusive } from '../src/core/periods';
import { missedOccurrences } from '../src/core/recurring';
import { mulberry32 } from '../src/core/rng';
import { safeToSpendToday, envelopeStatus } from '../src/core/budget';
import { streakState } from '../src/core/streaks';
import { offeredDailyQuests, QUESTS } from '../src/core/quests';
import type { Envelope, LocalDate, Recurring, Transaction } from '../src/core/types';

const rng = mulberry32(0xc0ffee);
const int = (n: number) => rng.int(n);
const date = (base: LocalDate, days: number) => addDays(base, days);

const ROLLOVERS = ['none', 'carry', 'sweep-to-goal'] as const;

function randomEnvelope(i: number): Envelope {
  const rollover = ROLLOVERS[int(3)]!;
  return {
    id: `e${i}`,
    name: `env ${i}`,
    icon: 'x',
    colorKey: 'moss',
    monthlyAllowance: int(5000),
    rollover,
    sweepGoalId: rollover === 'sweep-to-goal' ? 'goal' : undefined,
    archived: false,
    sortOrder: i,
  };
}

function randomTxn(
  id: string,
  envCount: number,
  inPeriod: { start: LocalDate; end: LocalDate },
): Transaction {
  const kind = ['expense', 'income', 'transfer'][int(3)]! as Transaction['kind'];
  const amount = 1 + int(99999);
  const base: Transaction = {
    id,
    kind,
    amount,
    date: date(inPeriod.start, int(28)),
    createdAt: 0,
    updatedAt: 0,
  };
  if (kind === 'expense' || kind === 'transfer') base.envelopeId = `e${int(envCount)}`;
  if (kind === 'transfer') {
    let to = `e${int(envCount)}`;
    while (to === base.envelopeId) to = `e${int(envCount)}`;
    base.toEnvelopeId = to;
  }
  return base;
}

describe('property: period close conserves integer money', () => {
  it('sum of results equals allowances + carry-ins minus expenses over 500 random periods', () => {
    for (let iter = 0; iter < 500; iter++) {
      const period = periodOf('2026-06-15', 1);
      const envelopes = Array.from({ length: 5 }, (_, i) => randomEnvelope(i));
      const txns = Array.from({ length: 40 }, (_, i) => randomTxn(`t${i}`, 5, period));
      const carryIns = new Map(envelopes.map((e) => [e.id, int(2000)]));
      const result = closePlan(period, envelopes, txns, carryIns);

      let expected = 0;
      for (const e of envelopes) expected += e.monthlyAllowance + (carryIns.get(e.id) ?? 0);
      for (const t of txns) if (t.kind === 'expense') expected -= t.amount;

      const actual = result.summary.perEnvelope.reduce((sum, r) => sum + r.result, 0);
      expect(actual).toBe(expected);
      expect(Number.isInteger(actual)).toBe(true);
      // Carries and sweeps never move money that was not there.
      for (const row of result.summary.perEnvelope) {
        expect(Number.isInteger(row.result)).toBe(true);
        expect(Number.isInteger(row.spent)).toBe(true);
      }
    }
  });
});

describe('property: safe-to-spend floors keep the total spendable', () => {
  it('sum of floors never exceeds the exact split, and never loses more than the envelope count', () => {
    for (let iter = 0; iter < 500; iter++) {
      const today = date('2026-06-15', int(28));
      const statuses = Array.from({ length: 6 }, (_, i) =>
        envelopeStatus(randomEnvelope(i), int(2000), int(4000)),
      );
      const total = safeToSpendToday(statuses, today, 1);
      expect(total).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(total)).toBe(true);
      const exact = statuses.reduce((s, st) => s + Math.max(0, st.remaining), 0);
      if (exact > 0) {
        const days = daysLeftInclusive(periodOf(today, 1), today);
        const upper = statuses.reduce((s, st) => s + Math.max(0, st.remaining / days), 0);
        expect(total).toBeLessThanOrEqual(Math.ceil(upper));
        expect(upper - total).toBeLessThan(statuses.length);
      }
    }
  });
});

describe('property: recurring catch-up is idempotent', () => {
  it('applying generated occurrences twice yields nothing the second time', () => {
    for (let iter = 0; iter < 200; iter++) {
      const today = date('2026-01-01', 200 + int(150));
      const rules: Recurring[] = Array.from({ length: 4 }, (_, i) => {
        const cadence = ['weekly', 'biweekly', 'monthly'][int(3)]! as Recurring['cadence'];
        return {
          id: `r${i}`,
          template: { kind: 'expense', amount: 500, envelopeId: `e${int(3)}` },
          cadence,
          startDate: date('2025-08-01', int(120)),
          endDate: int(4) === 0 ? date('2026-03-01', int(90)) : undefined,
        };
      });
      const first = missedOccurrences(rules, [], today);
      const applied: Transaction[] = first.map((m, i) => ({
        id: `gen${i}`,
        kind: 'expense',
        amount: 500,
        date: m.date,
        envelopeId: m.rule.template.envelopeId,
        createdAt: 0,
        updatedAt: 0,
        occurrenceKey: m.key,
      }));
      const second = missedOccurrences(rules, applied, today);
      expect(second).toEqual([]);
      // Marking every rule as generated also drains the queue.
      const drained = missedOccurrences(
        rules.map((r) => ({ ...r, lastGenerated: today })),
        [],
        today,
      );
      expect(drained).toEqual([]);
    }
  });
});

describe('property: streak state invariants', () => {
  it('streak is never negative, longest >= streak, tokens only leave via spends', () => {
    for (let iter = 0; iter < 500; iter++) {
      const today = date('2026-06-30', int(60));
      const activeDates = Array.from({ length: int(40) }, () => date(today, -int(120)));
      const tokens = int(4);
      const s = streakState(activeDates, tokens, today);
      expect(s.streak).toBeGreaterThanOrEqual(0);
      expect(s.longest).toBeGreaterThanOrEqual(s.streak);
      expect(s.tokens).toBeGreaterThanOrEqual(0);
      expect(s.tokens + s.tokenSpends.length).toBe(Math.max(0, tokens));
    }
  });
});

describe('property: quest rotation is deterministic and distinct', () => {
  it('same seed and date always give the same three distinct daily quests', () => {
    for (let iter = 0; iter < 100; iter++) {
      const seed = int(1_000_000);
      const d = date('2026-01-01', int(364));
      const a = offeredDailyQuests(seed, d);
      const b = offeredDailyQuests(seed, d);
      expect(a).toEqual(b);
      expect(a).toHaveLength(3);
      expect(new Set(a.map((q) => q.id)).size).toBe(3);
      expect(QUESTS.length).toBeGreaterThanOrEqual(3);
    }
  });
});
