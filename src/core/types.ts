/**
 * Shared domain types for the pure budgeting core. No React, no DOM, no IndexedDB.
 * Dates are local calendar dates as YYYY-MM-DD strings. Amounts are integer minor units.
 */

export type Minor = number;
export type LocalDate = string;

export interface Clock {
  /** Milliseconds since epoch. */
  now(): number;
  /** Local calendar date, YYYY-MM-DD. */
  today(): LocalDate;
}

export interface Settings {
  currency: string;
  locale: string;
  /** 1-28; the budget period starts on this day of each month. */
  periodStartDay: number;
  theme: 'system' | 'light' | 'dark';
  reducedMotion: 'system' | 'on' | 'off';
  sound: boolean;
  /** Rest tokens granted per calendar month. */
  restTokensPerMonth: number;
  schemaVersion: number;
}

export interface Envelope {
  id: string;
  name: string;
  icon: string;
  colorKey: string;
  monthlyAllowance: Minor;
  rollover: 'none' | 'carry' | 'sweep-to-goal';
  sweepGoalId?: string;
  archived: boolean;
  sortOrder: number;
}

export type TransactionKind = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: string;
  kind: TransactionKind;
  amount: Minor;
  envelopeId?: string;
  toEnvelopeId?: string;
  goalId?: string;
  date: LocalDate;
  note?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  recurringId?: string;
  /** Recurring occurrence key, rec:<recurringId>:<date>. */
  occurrenceKey?: string;
}

export interface Goal {
  id: string;
  name: string;
  target: Minor;
  saved: Minor;
  dueDate?: LocalDate;
  icon: string;
  archived: boolean;
}

export interface Recurring {
  id: string;
  template: Omit<Transaction, 'id' | 'date' | 'createdAt' | 'updatedAt'>;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  startDate: LocalDate;
  endDate?: LocalDate;
  lastGenerated?: LocalDate;
}

export interface RewardEvent {
  /** Unique, deterministic key. Granting the same key twice does nothing. */
  key: string;
  type: string;
  xp: number;
  sparks: number;
  oil?: number;
  /** Local date of the grant. */
  at: LocalDate;
  meta?: Record<string, unknown>;
}

export interface Companion {
  id: string;
  speciesKey: string;
  name: string;
  cosmetics: string[];
  equipped: Record<string, string>;
}

export interface QuestProgress {
  questId: string;
  periodId: string;
  progress: number;
  completedAt?: number;
  claimedAt?: number;
}

export interface AchievementState {
  id: string;
  unlockedAt?: number;
}

export interface PeriodSummary {
  periodId: string;
  start: LocalDate;
  end: LocalDate;
  perEnvelope: {
    envelopeId: string;
    name: string;
    allowance: Minor;
    carryIn: Minor;
    spent: Minor;
    result: Minor;
    rollover: Envelope['rollover'];
    sweptToGoalId?: string;
    swept: Minor;
  }[];
  totalSaved: Minor;
  bestEnvelopeId?: string;
  worstEnvelopeId?: string;
  /** Activity days in the period (any logged txn / no-spend / check-in). */
  activeDays: number;
}

/** What the quest/achievement layer reads about budgeting behaviour in a given window. */
export interface BudgetFacts {
  /** Distinct local dates with any logged transaction, no-spend declaration, or check-in. */
  activeDates: readonly LocalDate[];
  txnCount: number;
  noteCount: number;
  goalContributions: number;
  nospendCount: number;
  checkinCount: number;
  reviewCount: number;
  transferCount: number;
  recurringCount: number;
  archivedEnvelopeCount: number;
  streak: number;
  longestStreak: number;
  /** Largest goal balance divided by average monthly spending; 0 when not computable. */
  emergencyFundRatio: number;
  /** Envelope states for the current period. */
  envelopeStates: readonly {
    envelopeId: string;
    percentUsed: number;
    entriesLogged: number;
    closedWithinAllowance?: boolean;
  }[];
  goalReachedGoalIds: readonly string[];
  level: number;
  backupCreated: boolean;
  installedToHomeScreen: boolean;
  usedOffline: boolean;
  weekEnvelopeUnder80: boolean;
}
