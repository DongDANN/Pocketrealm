import { envelopeStatus, spentInPeriod } from './budget';
import { daysBetween, monthKey } from './dates';
import { envOkEligible } from './habits';
import { periodOf } from './periods';
import { levelForXp } from './rewards';
import { streakState } from './streaks';
import type {
  BudgetFacts,
  Envelope,
  Goal,
  LocalDate,
  Minor,
  RewardEvent,
  Transaction,
} from './types';

/**
 * BudgetFacts: the only view quests and achievements are allowed to read. It is built for a window,
 * so a daily quest cannot see last month and an achievement can be evaluated over all history.
 * Money never enters a count — an envelope with one large entry is not busier than one with five
 * small ones — and no fact is inferred from the device: flags arrive from the caller.
 */

export interface FactsWindow {
  start: LocalDate;
  end: LocalDate;
}

export interface FactsInput {
  today: LocalDate;
  /** Dates counted as "this period" for quest progress. Inclusive. */
  window: FactsWindow;
  transactions: readonly Transaction[];
  envelopes?: readonly Envelope[];
  /** Carry-in per envelope for the current period. */
  carries?: ReadonlyMap<string, Minor>;
  rewardEvents?: readonly RewardEvent[];
  goals?: readonly Goal[];
  xp?: number;
  restTokens?: number;
  periodStartDay?: number;
  flags?: {
    backupCreated?: boolean;
    installedToHomeScreen?: boolean;
    usedOffline?: boolean;
  };
}

const ACTIVITY_EVENT_TYPES = new Set(['checkin', 'nospend']);

export function buildBudgetFacts(input: FactsInput): BudgetFacts {
  const live = input.transactions.filter((t) => t.deletedAt === undefined);
  const window = input.window;
  const scoped = live.filter((t) => inWindow(t.date, window));
  const events = input.rewardEvents ?? [];
  const scopedEvents = events.filter((e) => inWindow(e.at, window));
  const envelopes = input.envelopes ?? [];
  const goals = input.goals ?? [];
  const carries = input.carries ?? new Map<string, Minor>();

  const activeDates = activityDates(scoped, scopedEvents);
  const allTimeDates = activityDates(live, events);
  const streak = streakState(allTimeDates, input.restTokens ?? 0, input.today);

  const period = periodOf(input.today, input.periodStartDay ?? 1);
  const openEnvelopes = envelopes.filter((env) => !env.archived);
  const envelopeStates = openEnvelopes.map((env) =>
    describeEnvelope(env, live, period, carries.get(env.id) ?? 0),
  );

  return {
    activeDates,
    txnCount: scoped.length,
    noteCount: scoped.filter(hasNote).length,
    goalContributions: scoped.filter((t) => t.goalId !== undefined).length,
    nospendCount: countType(scopedEvents, 'nospend'),
    checkinCount: countType(scopedEvents, 'checkin'),
    reviewCount: countType(scopedEvents, 'review'),
    transferCount: scoped.filter((t) => t.kind === 'transfer').length,
    recurringCount: scoped.filter((t) => t.recurringId !== undefined).length,
    archivedEnvelopeCount: envelopes.filter((env) => env.archived).length,
    streak: streak.streak,
    longestStreak: streak.longest,
    emergencyFundRatio: emergencyFundRatio(goals, live),
    envelopeStates,
    goalReachedGoalIds: goals.filter((g) => g.target > 0 && g.saved >= g.target).map((g) => g.id),
    level: levelForXp(input.xp ?? 0).level,
    backupCreated: input.flags?.backupCreated === true,
    installedToHomeScreen: input.flags?.installedToHomeScreen === true,
    usedOffline: input.flags?.usedOffline === true,
    weekEnvelopeUnder80: windowBudgetReached(openEnvelopes, live, window, period, carries),
  };
}

function inWindow(date: LocalDate, window: FactsWindow): boolean {
  return date >= window.start && date <= window.end;
}

function hasNote(t: Transaction): boolean {
  return t.note !== undefined && t.note.trim().length > 0;
}

function countType(events: readonly RewardEvent[], type: string): number {
  return events.filter((e) => e.type === type).length;
}

/** Days that count toward a streak: a logged entry, a check-in, or a declared no-spend day. */
function activityDates(
  transactions: readonly Transaction[],
  events: readonly RewardEvent[],
): LocalDate[] {
  const dates = new Set<LocalDate>();
  for (const t of transactions) dates.add(t.date);
  for (const e of events) if (ACTIVITY_EVENT_TYPES.has(e.type)) dates.add(e.at);
  return [...dates].sort();
}

function describeEnvelope(
  env: Envelope,
  transactions: readonly Transaction[],
  period: { start: LocalDate; end: LocalDate },
  carry: Minor,
): BudgetFacts['envelopeStates'][number] {
  const spent = spentInPeriod(env.id, transactions, period);
  const status = envelopeStatus(env, carry, spent);
  const entriesLogged = transactions.filter(
    (t) => t.kind === 'expense' && t.envelopeId === env.id && inWindow(t.date, period),
  ).length;
  return {
    envelopeId: env.id,
    percentUsed: status.percentUsed,
    entriesLogged,
    closedWithinAllowance: envOkEligible(status.remaining, entriesLogged),
  };
}

/**
 * "Under 80% this week" compares the window's spend against the same slice of the allowance, so a
 * quiet week is measured on a week's budget rather than a month's.
 */
function windowBudgetReached(
  envelopes: readonly Envelope[],
  transactions: readonly Transaction[],
  window: FactsWindow,
  period: { start: LocalDate; end: LocalDate },
  carries: ReadonlyMap<string, Minor>,
): boolean {
  const windowDays = daysBetween(window.start, window.end) + 1;
  const periodDays = daysBetween(period.start, period.end) + 1;
  if (windowDays <= 0 || periodDays <= 0) return false;
  return envelopes.some((env) => {
    const budget = Math.floor(
      ((env.monthlyAllowance + (carries.get(env.id) ?? 0)) * windowDays) / periodDays,
    );
    if (budget <= 0) return false;
    return spentInPeriod(env.id, transactions, window) * 100 <= 80 * budget;
  });
}

/** Largest goal balance over average monthly spending; 0 when there is no spending to measure against. */
function emergencyFundRatio(goals: readonly Goal[], transactions: readonly Transaction[]): number {
  const byMonth = new Map<string, Minor>();
  for (const t of transactions) {
    if (t.kind !== 'expense') continue;
    const key = monthKey(t.date);
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.amount);
  }
  const totals = [...byMonth.values()];
  if (totals.length === 0) return 0;
  const average = totals.reduce((sum, value) => sum + value, 0) / totals.length;
  const best = goals.reduce((max, g) => Math.max(max, g.saved), 0);
  if (average <= 0 || best <= 0) return 0;
  return Math.round((best / average) * 100) / 100;
}
