import type { LocalDate } from './types';

/**
 * Local calendar date helpers. Dates are YYYY-MM-DD strings handled through the local timezone,
 * never UTC, so a "day" is a calendar day on the user's device regardless of offset.
 */

const DAY_MS = 86_400_000;

export function today(now = Date.now()): LocalDate {
  return dateOf(now);
}

export function dateOf(ms: number): LocalDate {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Parses a YYYY-MM-DD string at local midnight. Invalid input yields an invalid Date. */
export function parseDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseDate(value);
  return !Number.isNaN(d.getTime()) && dateOf(d.getTime()) === value;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const d = parseDate(date);
  d.setDate(d.getDate() + days);
  return dateOf(d.getTime());
}

/** Whole calendar days from `from` to `to` (to - from). DST-safe because both parse at midnight. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function monthKey(date: LocalDate): string {
  return date.slice(0, 7);
}

export function addMonths(date: LocalDate, months: number): LocalDate {
  const d = parseDate(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, last));
  return dateOf(d.getTime());
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * ISO week id (Monday-based) of a date: YYYY-Www. Weeks are stable across locales and year
 * boundaries, so weekly review keys and weekly quests rotate consistently.
 */
export function isoWeekId(date: LocalDate): string {
  const d = parseDate(date);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
