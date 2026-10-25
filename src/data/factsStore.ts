/**
 * Gate 3b — the read side of the book. One function turns stored rows into the BudgetFacts that
 * quests, achievements and screen headers are allowed to read, so "what happened this period" is
 * decided in exactly one place: live rows only, the caller's window for counts, the settings' period
 * for money, carry-ins taken from the closes already on disk, level taken from the ledger.
 */

import { monthKey } from '../core/dates';
import { ACTIVITY_EVENT_TYPES, buildBudgetFacts, type FactsWindow } from '../core/facts';
import { periodOf } from '../core/periods';
import { totalXp } from '../core/rewards';
import { tokenGrants } from '../core/streaks';
import type { BudgetFacts, LocalDate, RewardEvent, Transaction } from '../core/types';
import type { PocketDb } from './db';
import { carryInsForPeriod } from './lifecycle';
import { ledgerEvents } from './ledger';
import { getSettings, listEnvelopes, listGoals, listTransactions } from './repos';

export interface FactsRequest {
  today: LocalDate;
  /** Dates whose actions count as progress. Quests pass their own window; achievements pass all time. */
  window: FactsWindow;
  flags?: {
    backupCreated?: boolean;
    installedToHomeScreen?: boolean;
    usedOffline?: boolean;
  };
}

/**
 * The month the book started being used decides how many rest tokens have been granted. It is read
 * from the rows rather than stored, because an install that never wrote a settings timestamp still
 * has a first entry, and a second field could disagree with it.
 */
function trackedSinceMonth(
  transactions: readonly Transaction[],
  events: readonly RewardEvent[],
  today: LocalDate,
): string {
  let earliest: LocalDate | undefined;
  for (const t of transactions) {
    if (!earliest || t.date < earliest) earliest = t.date;
  }
  for (const e of events) {
    if (!ACTIVITY_EVENT_TYPES.has(e.type)) continue;
    if (!earliest || e.at < earliest) earliest = e.at;
  }
  return monthKey(earliest ?? today);
}

export async function loadFacts(db: PocketDb, request: FactsRequest): Promise<BudgetFacts> {
  const settings = await getSettings(db);
  const [transactions, envelopes, goals, events] = await Promise.all([
    listTransactions(db),
    listEnvelopes(db, { includeArchived: true }),
    listGoals(db, { includeArchived: true }),
    ledgerEvents(db),
  ]);
  const period = periodOf(request.today, settings.periodStartDay);
  const carries = await carryInsForPeriod(db, period.id);

  return buildBudgetFacts({
    today: request.today,
    window: request.window,
    transactions,
    envelopes,
    carries,
    rewardEvents: events,
    goals,
    xp: totalXp(events),
    restTokens: tokenGrants(
      trackedSinceMonth(transactions, events, request.today),
      monthKey(request.today),
      settings.restTokensPerMonth,
    ),
    periodStartDay: settings.periodStartDay,
    flags: request.flags,
  });
}
