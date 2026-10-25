import { addDays, addMonths, monthKey } from './dates';
import { periodOf } from './periods';
import type { Envelope, LocalDate, Minor, Transaction } from './types';

/**
 * Insights helpers: envelope spending (this period vs previous), 6-month trend, income vs
 * spending, top notes, streak calendar. Pure aggregations over transactions; the UI layer draws
 * them as pixel charts with a data-table fallback. Today is injected, never read from the clock.
 */

export interface EnvelopePeriodRow {
  envelopeId: string;
  name: string;
  allowance: Minor;
  spent: Minor;
  remaining: Minor;
  percentUsed: number;
}

export interface PeriodComparison {
  periodId: string;
  start: LocalDate;
  end: LocalDate;
  rows: EnvelopePeriodRow[];
  totalSpent: number;
}

export function envelopeRowsForPeriod(
  envelopes: readonly Envelope[],
  txns: readonly Transaction[],
  date: LocalDate,
  startDay: number,
): PeriodComparison {
  const period = periodOf(date, startDay);
  const rows = envelopes
    .filter((e) => !e.archived)
    .map((env) => {
      let spent = 0;
      for (const t of txns) {
        if (t.deletedAt !== undefined) continue;
        if (t.date < period.start || t.date > period.end) continue;
        if (t.kind === 'expense' && t.envelopeId === env.id) spent += t.amount;
        if (t.kind === 'transfer' && t.envelopeId === env.id) spent += t.amount;
        if (t.kind === 'transfer' && t.toEnvelopeId === env.id) spent -= t.amount;
      }
      const remaining = env.monthlyAllowance - spent;
      const percentUsed =
        env.monthlyAllowance > 0
          ? Math.round((spent / env.monthlyAllowance) * 100)
          : spent > 0
            ? 100
            : 0;
      return {
        envelopeId: env.id,
        name: env.name,
        allowance: env.monthlyAllowance,
        spent,
        remaining,
        percentUsed,
      };
    });
  return {
    periodId: period.id,
    start: period.start,
    end: period.end,
    rows,
    totalSpent: rows.reduce((sum, r) => sum + r.spent, 0),
  };
}

/** Previous period (same start day), for the "this period vs last" comparison. */
export function previousPeriod(
  date: LocalDate,
  startDay: number,
): { start: LocalDate; end: LocalDate } {
  const current = periodOf(date, startDay);
  return { start: addMonths(current.start, -1), end: addDays(current.start, -1) };
}

export interface MonthTotals {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

/** Monthly income/expense totals for the `months` calendar months ending at `today`, oldest first. */
export function monthlyTotals(
  txns: readonly Transaction[],
  months: number,
  today: LocalDate,
): MonthTotals[] {
  const [y, m] = today.split('-').map(Number) as [number, number];
  const out: MonthTotals[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y!, m! - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let income = 0;
    let expenses = 0;
    for (const t of txns) {
      if (t.deletedAt !== undefined) continue;
      if (monthKey(t.date) !== key) continue;
      if (t.kind === 'income') income += t.amount;
      else expenses += t.amount;
    }
    out.push({ month: key, income, expenses, net: income - expenses });
  }
  return out;
}

export interface TopNote {
  note: string;
  count: number;
  total: number;
}

/** Top notes/merchants by simple text grouping (case-insensitive, trimmed). */
export function topNotes(txns: readonly Transaction[], limit = 5): TopNote[] {
  const groups = new Map<string, { count: number; total: number }>();
  for (const t of txns) {
    if (t.deletedAt !== undefined || t.kind !== 'expense' || !t.note) continue;
    const note = t.note.trim();
    if (!note) continue;
    const key = note.toLowerCase();
    const g = groups.get(key) ?? { count: 0, total: 0 };
    g.count += 1;
    g.total += t.amount;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ note: key, count: g.count, total: g.total }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
    .slice(0, limit);
}

/** Calendar of active days for the last `weeks` weeks ending at `today`, Monday-first. */
export function streakCalendar(
  activeDates: readonly LocalDate[],
  today: LocalDate,
  weeks = 8,
): { days: { date: LocalDate; active: boolean }[] }[] {
  const active = new Set(activeDates);
  const out: { days: { date: LocalDate; active: boolean }[] }[] = [];
  const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7; // Monday = 0
  let cursor = addDays(today, -dow - (weeks - 1) * 7);
  for (let w = 0; w < weeks; w++) {
    const days: { date: LocalDate; active: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const date = addDays(cursor, d);
      days.push({ date, active: active.has(date) });
    }
    out.push({ days });
    cursor = addDays(cursor, 7);
  }
  return out;
}
