import { addDays, compareDates, parseDate } from './dates';
import type { LocalDate, Recurring, Transaction } from './types';

/**
 * Recurring catch-up. On open, generate every missed occurrence up to today. Idempotent by
 * occurrenceKey (rec:<recurringId>:<date>): existing transactions with the key are never repeated.
 */

export function occurrenceKey(recurringId: string, date: LocalDate): string {
  return `rec:${recurringId}:${date}`;
}

function fmt(y: number, m: number, d: number): LocalDate {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInLocalMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** All occurrence dates for a rule between from (inclusive) and to (inclusive). */
export function occurrenceDates(rule: Recurring, from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  const start = compareDates(rule.startDate, from) > 0 ? rule.startDate : from;
  const end = rule.endDate && compareDates(rule.endDate, to) < 0 ? rule.endDate : to;
  if (compareDates(start, end) > 0) return out;

  if (rule.cadence === 'monthly') {
    // Same day-of-month each month, clamped to the month's length (31 -> Feb 28/29).
    const startDate = parseDate(rule.startDate);
    const dayOfMonth = startDate.getDate();
    let [y, m] = start.split('-').map(Number) as [number, number];
    const [ey, em] = end.split('-').map(Number) as [number, number];
    for (let guard = 0; guard < 600 && (y! < ey! || (y === ey && m! <= em!)); guard++) {
      const d = Math.min(dayOfMonth, daysInLocalMonth(y!, m!));
      const candidate = fmt(y!, m!, d);
      if (compareDates(candidate, start) >= 0 && compareDates(candidate, end) <= 0) {
        out.push(candidate);
      }
      m = m! + 1;
      if (m > 12) {
        m = 1;
        y = y! + 1;
      }
    }
    return out;
  }

  const step = rule.cadence === 'weekly' ? 7 : 14;
  const startDow = parseDate(rule.startDate).getDay();
  // First occurrence at or after `start` that falls on the start weekday.
  let cursor = start;
  const firstDow = parseDate(cursor).getDay();
  const offset = (startDow - firstDow + 7) % 7;
  if (offset !== 0) cursor = addDays(cursor, offset);
  for (let d = cursor; compareDates(d, end) <= 0; d = addDays(d, step)) out.push(d);
  return out;
}

/**
 * Missed occurrences up to today that are not yet present in the transaction list.
 * Occurrences already logged by hand (keyed by occurrenceKey) are skipped.
 */
export function missedOccurrences(
  rules: readonly Recurring[],
  txns: readonly Transaction[],
  today: LocalDate,
): { rule: Recurring; date: LocalDate; key: string }[] {
  const seen = new Set(txns.filter((t) => t.occurrenceKey).map((t) => t.occurrenceKey!));
  const out: { rule: Recurring; date: LocalDate; key: string }[] = [];
  for (const rule of rules) {
    const from = rule.lastGenerated ? addDays(rule.lastGenerated, 1) : rule.startDate;
    if (compareDates(from, today) > 0) continue;
    for (const date of occurrenceDates(rule, from, today)) {
      const key = occurrenceKey(rule.id, date);
      if (!seen.has(key)) out.push({ rule, date, key });
    }
  }
  out.sort((a, b) => compareDates(a.date, b.date));
  return out;
}
