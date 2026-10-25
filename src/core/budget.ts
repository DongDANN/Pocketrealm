import { compareDates } from './dates';
import { daysLeftInclusive, periodOf } from './periods';
import type { Envelope, LocalDate, Minor, Transaction } from './types';

/**
 * Budget math: envelope status, safe-to-spend, and spent-today. All amounts are integer minor
 * units; sums and splits are exact because they never leave integer arithmetic.
 */

export type EnvelopeState = 'ok' | 'warning' | 'over';

export interface EnvelopeStatus {
  envelopeId: string;
  allowance: Minor;
  carry: Minor;
  spent: Minor;
  remaining: Minor;
  percentUsed: number;
  state: EnvelopeState;
}

/**
 * What left an envelope inside a given period: expenses and transfers out, minus transfers in.
 * The caller supplies the period so a mid-month start day is honoured; re-deriving it from a date
 * would silently fall back to the calendar month.
 */
export function spentInPeriod(
  envId: string,
  txns: readonly Transaction[],
  period: { start: LocalDate; end: LocalDate },
): Minor {
  let sum = 0;
  for (const t of txns) {
    if (t.deletedAt !== undefined) continue;
    if (t.date < period.start || t.date > period.end) continue;
    if (t.envelopeId === envId) {
      if (t.kind === 'expense') sum += t.amount;
      if (t.kind === 'transfer') sum += t.amount;
    }
    if (t.toEnvelopeId === envId && t.kind === 'transfer') sum -= t.amount;
  }
  return sum;
}

export function envelopeStatus(env: Envelope, carry: Minor, spent: Minor): EnvelopeStatus {
  const remaining = env.monthlyAllowance + carry - spent;
  const budget = env.monthlyAllowance + carry;
  const ratio = budget > 0 ? spent / budget : spent > 0 ? 1 : 0;
  const percentUsed = Math.round(ratio * 100);
  const state: EnvelopeState = remaining < 0 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok';
  return {
    envelopeId: env.id,
    allowance: env.monthlyAllowance,
    carry,
    spent,
    remaining,
    percentUsed,
    state,
  };
}

export function guardianState(percentUsed: number): 'calm' | 'alert' | 'attention' | 'overspent' {
  if (percentUsed >= 100) return 'overspent';
  if (percentUsed >= 80) return 'attention';
  if (percentUsed >= 60) return 'alert';
  return 'calm';
}

/**
 * Safe to spend today: max(0, remaining) / daysLeft, per envelope rounded down, then summed.
 * Rounds each envelope down first so the total is always spendable.
 */
export function safeToSpendToday(
  statuses: readonly EnvelopeStatus[],
  today: LocalDate,
  startDay: number,
): Minor {
  const days = daysLeftInclusive(periodOf(today, startDay), today);
  let total = 0;
  for (const s of statuses) {
    if (s.remaining <= 0) continue;
    total += Math.floor(s.remaining / days);
  }
  return total;
}

export function spentToday(txns: readonly Transaction[], today: LocalDate): Minor {
  let sum = 0;
  for (const t of txns) {
    if (t.deletedAt !== undefined) continue;
    if (t.date === today && (t.kind === 'expense' || t.kind === 'transfer')) sum += t.amount;
  }
  return sum;
}

export function totalsInPeriod(
  txns: readonly Transaction[],
  period: { start: LocalDate; end: LocalDate },
): { income: Minor; expenses: Minor } {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (t.deletedAt !== undefined) continue;
    if (t.date < period.start || t.date > period.end) continue;
    if (t.kind === 'income') income += t.amount;
    else expenses += t.amount;
  }
  return { income, expenses };
}

/** A transfer must move a positive amount out of an envelope; everything else is invalid. */
export function validateTransfer(
  t: Transaction,
  envelopes: ReadonlyMap<string, Envelope>,
): string | null {
  if (t.kind !== 'transfer') return null;
  if (t.amount <= 0) return 'Transfer amount must be positive.';
  if (!t.envelopeId || !t.toEnvelopeId) return 'Transfers need a source and destination envelope.';
  if (t.envelopeId === t.toEnvelopeId) return 'Source and destination must differ.';
  if (!envelopes.has(t.envelopeId) || !envelopes.has(t.toEnvelopeId)) return 'Unknown envelope.';
  return null;
}

export function latestFirst<T extends { date: LocalDate }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareDates(b.date, a.date));
}
