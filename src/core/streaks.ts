import { addDays, compareDates, monthKey } from './dates';
import type { LocalDate } from './types';

/**
 * Logging streak. Consecutive local days with at least one logged transaction, a declared
 * no-spend day, or a check-in. Each month grants restTokensPerMonth tokens; a missed day
 * auto-spends a token before the streak breaks. A break resets only the counter.
 */

export interface StreakState {
  streak: number;
  longest: number;
  /** Tokens held after auto-spending for missed days up to `today`. */
  tokens: number;
  /** Missed days that consumed a token. */
  tokenSpends: readonly { date: LocalDate; before: number; after: number }[];
  /** Days that broke the streak outright (no token available). */
  breaks: readonly LocalDate[];
}

/**
 * Pure streak computation. `activeDates` = every local date with activity since the first
 * activity. `tokens` = current token balance BEFORE any auto-spends for missed days.
 */
export function streakState(
  activeDates: readonly LocalDate[],
  tokens: number,
  today: LocalDate,
): StreakState {
  const active = new Set(activeDates);
  const firstActive = [...active].sort()[0];
  let streak = 0;
  let longest = 0;
  let held = Math.max(0, Math.trunc(tokens));
  const tokenSpends: { date: LocalDate; before: number; after: number }[] = [];
  const breaks: LocalDate[] = [];

  // Walk backwards from today, one day at a time. Today not yet logged is skipped entirely.
  // A missed day spends a token if available; otherwise the streak breaks. A break is only
  // recorded when the streak later resumes (there is earlier activity past the gap), and the
  // recorded day is the first missed day of that gap.
  let cursor = today;
  for (let i = 0; i < 366; i++) {
    if (active.has(cursor)) {
      streak += 1;
      if (streak > longest) longest = streak;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (compareDates(cursor, today) === 0) {
      cursor = addDays(cursor, -1);
      continue;
    }
    // Tokens and breaks only apply inside a run; before any activity there is nothing to save.
    if (streak === 0) break;
    // A token bridges a gap between two active days. It must never invent days before the first
    // one, or a brand-new book would report a streak longer than the days it has existed.
    if (firstActive !== undefined && compareDates(cursor, firstActive) < 0) break;
    if (held > 0) {
      tokenSpends.push({ date: cursor, before: held, after: held - 1 });
      held -= 1;
      streak += 1;
      if (streak > longest) longest = streak;
      cursor = addDays(cursor, -1);
      continue;
    }
    let firstMissed = cursor;
    let resumed = false;
    for (let j = i; j < 366; j++) {
      cursor = addDays(cursor, -1);
      if (active.has(cursor)) {
        breaks.push(firstMissed);
        streak = 0;
        i = j;
        resumed = true;
        break;
      }
      firstMissed = cursor;
    }
    if (!resumed) break;
  }
  return { streak, longest, tokens: held, tokenSpends, breaks };
}

/** Tokens granted for each calendar month strictly before `month` since the app began tracking. */
export function tokenGrants(
  trackedSinceMonth: LocalDate,
  throughMonth: LocalDate,
  perMonth: number,
): number {
  const [sy, sm] = trackedSinceMonth.split('-').map(Number) as [number, number];
  const [ey, em] = throughMonth.split('-').map(Number) as [number, number];
  const months = sy! > ey! || (sy === ey && sm! > em!) ? 0 : (ey! - sy!) * 12 + (em! - sm!) + 1;
  return months * Math.max(0, Math.trunc(perMonth));
}

export function nextMonth(date: LocalDate): LocalDate {
  const [y, m] = date.split('-').map(Number) as [number, number];
  const nm = m === 12 ? 1 : m! + 1;
  const ny = m === 12 ? y! + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export { monthKey };
