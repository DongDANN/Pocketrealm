/**
 * Gate 3c — the small decisions a screen makes about what to *show*: which envelopes a quick add
 * offers, how history filters and groups, how far off a goal looks at the rate it is moving, and how
 * a byte count is said out loud. Kept out of the components so none of it needs a browser to prove.
 */

import { addDays, daysBetween, parseDate } from './dates';
import type { Envelope, LocalDate, Minor, Transaction } from './types';

const CHIPS = 4;

/**
 * Recent-first envelope chips, then template order for anything never used: the envelope logged into
 * yesterday is the one a quick add should offer first, and only four fit without pushing the pad off
 * the screen. Ids that are not in the envelope list are dropped — a chip nobody can pick is noise.
 */
export function recentEnvelopeIds(
  transactions: readonly Transaction[],
  envelopes: readonly Envelope[],
  limit = CHIPS,
): string[] {
  const open = envelopes.filter((env) => !env.archived).map((env) => env.id);
  const candidates = new Set(open);
  const seen: string[] = [];
  for (const t of transactions) {
    // A transfer is money arriving, so the chip it earns is the one that receives it.
    const target = t.kind === 'transfer' ? t.toEnvelopeId : t.envelopeId;
    if (!target || !candidates.has(target) || seen.includes(target)) continue;
    seen.push(target);
  }
  for (const id of open) {
    if (seen.length >= limit) break;
    if (!seen.includes(id)) seen.push(id);
  }
  return seen.slice(0, limit);
}

export interface HistoryFilters {
  query?: string;
  envelopeId?: string;
  from?: LocalDate;
  to?: LocalDate;
}

/**
 * Notes, envelope names and the amount's own digits — no full-text engine, which SPEC lists as a
 * later item. The amount is matched as typed digits, so `1250` finds `₱1,250.00` on any device.
 */
export function filterHistory(
  transactions: readonly Transaction[],
  envelopes: readonly Envelope[],
  filters: HistoryFilters,
): Transaction[] {
  const raw = filters.query?.trim().toLowerCase();
  const query = raw && raw.length > 0 ? raw : undefined;
  const nameById = new Map(envelopes.map((env) => [env.id, env.name.toLowerCase()]));
  return transactions.filter((t) => {
    if (
      filters.envelopeId &&
      t.envelopeId !== filters.envelopeId &&
      t.toEnvelopeId !== filters.envelopeId
    ) {
      return false;
    }
    if (filters.from && t.date < filters.from) return false;
    if (filters.to && t.date > filters.to) return false;
    if (!query) return true;
    const amount = String(t.amount);
    const haystack = [
      t.note?.toLowerCase() ?? '',
      nameById.get(t.envelopeId ?? '') ?? '',
      nameById.get(t.toEnvelopeId ?? '') ?? '',
      amount,
    ];
    return haystack.some((needle) => needle.includes(query));
  });
}

export interface HistoryDay {
  date: LocalDate;
  /** Expenses only: an income or a transfer is movement, not a heavy day. */
  spent: Minor;
  items: Transaction[];
}

export function groupByDay(transactions: readonly Transaction[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const t of transactions) {
    const last = days[days.length - 1];
    if (last && last.date === t.date) {
      last.items.push(t);
      if (t.kind === 'expense') last.spent += t.amount;
      continue;
    }
    days.push({ date: t.date, spent: t.kind === 'expense' ? t.amount : 0, items: [t] });
  }
  return days;
}

/**
 * When a goal looks like it lands if the habit keeps going. Whole periods only, rounded up: a screen
 * that promises the 14th and needs the 15th teaches the user to distrust it. Null when there is
 * nothing to project from, so the copy can say so instead of inventing a date.
 */
export function projectCompletion(
  saved: Minor,
  target: Minor,
  perPeriod: Minor,
  today: LocalDate,
  periodDays: number,
): LocalDate | null {
  if (target <= 0 || periodDays <= 0 || perPeriod <= 0) return null;
  if (saved >= target) return null;
  const periods = Math.ceil((target - saved) / perPeriod);
  return addDays(today, periods * periodDays);
}

/** Whole weeks left, where a part week still counts as a week and today counts as one. */
export function weeksUntil(date: LocalDate, today: LocalDate): number | null {
  const days = daysBetween(today, date);
  if (days < 0) return null;
  return Math.max(1, Math.ceil(days / 7));
}

export function dayHeading(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const d = parseDate(date);
  const thisYear = parseDate(today).getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === thisYear ? {} : { year: 'numeric' }),
  });
}

/** One decimal while the number is small enough that rounding would hide a real difference. */
export function bytesLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}
