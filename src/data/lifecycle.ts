/**
 * Gate 2d — the two jobs that run when the app opens (SPEC 6.3, 6.4). Both are keyed by something
 * stable instead of by "did we already do this today": a period close is keyed by `periodId`, and a
 * recurring occurrence by its `occurrenceKey`. That is what lets the app run them on every cold
 * start, after a crash, or twice in the same minute without sweeping a goal twice or logging rent
 * twice — and it means a month the user never looked at is still closed correctly when they finally
 * open the app in February.
 */

import { addDays, compareDates } from '../core/dates';
import { closePlan, periodOf, type Period } from '../core/periods';
import { missedOccurrences } from '../core/recurring';
import type { Clock, LocalDate, PeriodSummary } from '../core/types';
import type { PocketDb } from './db';
import type { WriteContext } from './repos';
import { getSettings, markRecurringGenerated, writeOccurrence } from './repos';

/** How far back a single open will go to close missed periods (20 years of months). */
const MAX_PERIODS_PER_OPEN = 240;

export interface PeriodCloseOutcome {
  /** Summaries written by this call, oldest first. Empty when nothing had ended. */
  closed: PeriodSummary[];
  /** The period the user is in, so the caller can land on "this month" afterwards. */
  current: Period;
}

export interface RecurringRunResult {
  written: number;
  dates: LocalDate[];
}

function previousPeriod(period: Period): Period {
  return periodOf(addDays(period.start, -1), period.startDay);
}

/**
 * Carry-in for a period comes from the close immediately before it, which is why it is derived from
 * stored summaries instead of a separate balance table: there is one source of truth, and it cannot
 * disagree with the summary the user was shown. Only `carry` envelopes carry; a swept surplus is
 * already in the goal.
 */
export function carriesFromSummary(summary: PeriodSummary): Map<string, number> {
  const carries = new Map<string, number>();
  for (const row of summary.perEnvelope) {
    if (row.rollover === 'carry') carries.set(row.envelopeId, row.result);
  }
  return carries;
}

/** The carry-in a given period starts with, read back from the closes already stored. */
export async function carryInsForPeriod(
  db: PocketDb,
  periodId: string,
): Promise<Map<string, number>> {
  const closes = await db.periodCloses.toArray();
  let prior: PeriodSummary | undefined;
  for (const close of closes) {
    // A period id is its start date, so ordering ids orders periods.
    if (close.periodId < periodId && (!prior || close.periodId > prior.periodId)) prior = close;
  }
  return prior ? carriesFromSummary(prior) : new Map();
}

/**
 * Close every period that ended before `clock.today()` and has no stored summary, oldest first so
 * each one inherits the previous carry. Runs inside one transaction: a close either lands whole or
 * not at all, and the goal sweeps it triggers are recorded in the same commit.
 *
 * How far back it goes is bounded by the data rather than by the calendar: a period that ended
 * before the first logged transaction is not worth a summary, and the walk stops at the first period
 * that is already closed. Without those bounds, a first open would invent empty months going back
 * to 2006.
 */
export async function closeEndedPeriods(db: PocketDb, clock: Clock): Promise<PeriodCloseOutcome> {
  const today = clock.today();
  const settings = await getSettings(db);
  const current = periodOf(today, settings.periodStartDay);
  const [envelopes, txns] = await Promise.all([db.envelopes.toArray(), db.transactions.toArray()]);

  // Deleted rows still prove a month existed; closePlan is what ignores them in the numbers.
  const oldest = txns.length > 0 ? txns.map((t) => t.date).sort()[0] : undefined;

  const pending: Period[] = [];
  if (oldest) {
    for (
      let p = previousPeriod(current);
      pending.length < MAX_PERIODS_PER_OPEN;
      p = previousPeriod(p)
    ) {
      if (compareDates(p.end, today) >= 0) break; // still running, or the future
      if (compareDates(p.end, oldest) < 0) break; // before this budget existed
      if (await db.periodCloses.get(p.id)) break; // already closed: the chain is intact up to here
      pending.push(p);
    }
  }
  pending.reverse();
  if (pending.length === 0) return { closed: [], current };

  return db.transaction('rw', db.periodCloses, db.goals, async () => {
    const closed: PeriodSummary[] = [];
    for (const period of pending) {
      const carryIns = await carryInsForPeriod(db, period.id);
      const plan = closePlan(period, envelopes, txns, carryIns);
      await db.periodCloses.put(plan.summary);
      for (const sweep of plan.sweeps) {
        const goal = await db.goals.get(sweep.goalId);
        if (goal) await db.goals.put({ ...goal, saved: goal.saved + sweep.amount });
      }
      closed.push(plan.summary);
    }
    return { closed, current };
  });
}

/**
 * Generate the recurring occurrences that came due while the app was shut. Deleted rows are read
 * too, because an occurrence the user threw away must not come back on the next open.
 */
export async function generateRecurringOnOpen(
  db: PocketDb,
  ctx: WriteContext,
): Promise<RecurringRunResult> {
  return db.transaction('rw', db.transactions, db.recurrings, async () => {
    const rules = await db.recurrings.toArray();
    if (rules.length === 0) return { written: 0, dates: [] };
    const today = ctx.clock.today();
    const existing = await db.transactions.toArray();
    const missed = missedOccurrences(rules, existing, today);

    const dates: LocalDate[] = [];
    const lastPerRule = new Map<string, LocalDate>();
    for (const occurrence of missed) {
      const row = await writeOccurrence(db, occurrence.rule, occurrence.date, ctx);
      if (!row) continue; // already logged by hand under the same occurrence key
      dates.push(occurrence.date);
      const previous = lastPerRule.get(occurrence.rule.id);
      if (!previous || previous < occurrence.date)
        lastPerRule.set(occurrence.rule.id, occurrence.date);
    }
    for (const [ruleId, date] of lastPerRule) await markRecurringGenerated(db, ruleId, date);
    return { written: dates.length, dates };
  });
}
