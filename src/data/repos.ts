/**
 * Gate 2 — repositories. The only place the app writes IndexedDB. Screens and lifecycle jobs call
 * these instead of touching tables, so soft-delete, clock stamping and JSON-clean rows are enforced
 * once. The clock and id generator are injected, matching the core rule that nothing reaches for
 * `Date.now()` or `Math.random()` by itself.
 */

import { occurrenceKey } from '../core/recurring';
import type {
  AchievementState,
  Clock,
  Companion,
  Envelope,
  Goal,
  LocalDate,
  QuestProgress,
  Recurring,
  Settings,
  Transaction,
} from '../core/types';
import { SCHEMA_VERSION, type PocketDb } from './db';
import { defaultSettings } from './seed';

export interface WriteContext {
  clock: Clock;
  newId(): string;
}

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Transaction, 'id'>>;

export type TransactionPatch = Partial<Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>>;

export interface TransactionFilter {
  from?: LocalDate;
  to?: LocalDate;
  envelopeId?: string;
  recurringId?: string;
  /** Deleted rows are hidden unless a caller explicitly asks for them. */
  includeDeleted?: boolean;
}

const SETTINGS_KEY = 'settings';

/** Optional fields must be absent, not `undefined`, or a JSON backup differs from the stored row. */
function jsonClean<T extends object>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

/** Newest first: date, then write time, then id, so ties never reorder between reads. */
function byNewest(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export async function listTransactions(
  db: PocketDb,
  filter: TransactionFilter = {},
): Promise<Transaction[]> {
  // A Dexie Collection is not thenable: every branch has to end in toArray() before filtering.
  const rows =
    filter.from && filter.to
      ? await db.transactions.where('date').between(filter.from, filter.to, true, true).toArray()
      : filter.from
        ? await db.transactions.where('date').aboveOrEqual(filter.from).toArray()
        : filter.to
          ? await db.transactions.where('date').belowOrEqual(filter.to).toArray()
          : await db.transactions.toArray();
  return rows
    .filter((t) => (filter.includeDeleted ? true : t.deletedAt === undefined))
    .filter((t) => (filter.envelopeId ? t.envelopeId === filter.envelopeId : true))
    .filter((t) => (filter.recurringId ? t.recurringId === filter.recurringId : true))
    .sort(byNewest);
}

export async function writeTransaction(
  db: PocketDb,
  input: NewTransaction,
  ctx: WriteContext,
): Promise<Transaction> {
  const at = ctx.clock.now();
  const row = jsonClean<Transaction>({
    ...input,
    id: input.id ?? ctx.newId(),
    createdAt: at,
    updatedAt: at,
  });
  await db.transactions.add(row);
  return row;
}

export async function editTransaction(
  db: PocketDb,
  id: string,
  patch: TransactionPatch,
  clock: Clock,
): Promise<Transaction | null> {
  return db.transaction('rw', db.transactions, async () => {
    const current = await db.transactions.get(id);
    if (!current) return null;
    const next = jsonClean<Transaction>({ ...current, ...patch, id, updatedAt: clock.now() });
    await db.transactions.put(next);
    return next;
  });
}

/** Soft delete (SPEC 4): the row stays, history and derived balances stop counting it. */
export async function deleteTransaction(
  db: PocketDb,
  id: string,
  clock: Clock,
): Promise<Transaction | null> {
  return editTransaction(db, id, { deletedAt: clock.now() }, clock);
}

/**
 * Write a recurring occurrence idempotently: the occurrence key is the guard, so opening the app
 * twice in a day (or re-running the generator after a crash) can never double-log.
 */
export async function writeOccurrence(
  db: PocketDb,
  rule: Recurring,
  date: LocalDate,
  ctx: WriteContext,
): Promise<Transaction | null> {
  const key = occurrenceKey(rule.id, date);
  const existing = await db.transactions.where('occurrenceKey').equals(key).first();
  if (existing) return null;
  return writeTransaction(
    db,
    { ...rule.template, date, recurringId: rule.id, occurrenceKey: key },
    ctx,
  );
}

export async function getSettings(db: PocketDb): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return row?.value ?? defaultSettings();
}

export async function saveSettings(db: PocketDb, settings: Settings): Promise<Settings> {
  const value: Settings = { ...settings, schemaVersion: SCHEMA_VERSION };
  await db.settings.put({ key: SETTINGS_KEY, value });
  return value;
}

export async function listEnvelopes(
  db: PocketDb,
  options: { includeArchived?: boolean } = {},
): Promise<Envelope[]> {
  const rows = await db.envelopes.orderBy('sortOrder').toArray();
  return options.includeArchived ? rows : rows.filter((e) => !e.archived);
}

export function getEnvelope(db: PocketDb, id: string): Promise<Envelope | undefined> {
  return db.envelopes.get(id);
}

export async function saveEnvelope(db: PocketDb, envelope: Envelope): Promise<Envelope> {
  await db.envelopes.put(envelope);
  return envelope;
}

export async function listGoals(
  db: PocketDb,
  options: { includeArchived?: boolean } = {},
): Promise<Goal[]> {
  const rows = await db.goals.toArray();
  return options.includeArchived ? rows : rows.filter((g) => !g.archived);
}

export function getGoal(db: PocketDb, id: string): Promise<Goal | undefined> {
  return db.goals.get(id);
}

export async function saveGoal(db: PocketDb, goal: Goal): Promise<Goal> {
  await db.goals.put(goal);
  return goal;
}

/** Adds to `saved` in one transaction so a concurrent contribution can't be lost. */
export async function contributeToGoal(
  db: PocketDb,
  id: string,
  amount: number,
): Promise<Goal | null> {
  return db.transaction('rw', db.goals, async () => {
    const goal = await db.goals.get(id);
    if (!goal) return null;
    const next: Goal = { ...goal, saved: goal.saved + amount };
    await db.goals.put(next);
    return next;
  });
}

export async function listRecurrings(db: PocketDb): Promise<Recurring[]> {
  const rows = await db.recurrings.toArray();
  return rows.sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

export async function upsertRecurring(db: PocketDb, rule: Recurring): Promise<Recurring> {
  await db.recurrings.put(rule);
  return rule;
}

export async function markRecurringGenerated(
  db: PocketDb,
  id: string,
  date: LocalDate,
): Promise<void> {
  await db.transaction('rw', db.recurrings, async () => {
    const rule = await db.recurrings.get(id);
    if (!rule) return;
    if (rule.lastGenerated && rule.lastGenerated >= date) return;
    await db.recurrings.put({ ...rule, lastGenerated: date });
  });
}

export function getCompanion(db: PocketDb): Promise<Companion | null> {
  return db.companions.toArray().then((rows) => (rows.length > 0 ? (rows[0] as Companion) : null));
}

export async function saveCompanion(db: PocketDb, companion: Companion): Promise<Companion> {
  await db.companions.put(companion);
  return companion;
}

export async function setQuestProgress(
  db: PocketDb,
  progress: QuestProgress,
): Promise<QuestProgress> {
  await db.questProgress.put(progress);
  return progress;
}

export function listQuestProgress(db: PocketDb, periodId: string): Promise<QuestProgress[]> {
  return db.questProgress.where('periodId').equals(periodId).toArray();
}

/** Unlock once: a second call keeps the original timestamp, so achievements cannot be re-earned. */
export async function unlockAchievement(
  db: PocketDb,
  id: string,
  clock: Clock,
): Promise<AchievementState> {
  return db.transaction('rw', db.achievements, async () => {
    const existing = await db.achievements.get(id);
    if (existing?.unlockedAt !== undefined) return existing;
    const row: AchievementState = { id, unlockedAt: clock.now() };
    await db.achievements.put(row);
    return row;
  });
}

export function listAchievements(db: PocketDb): Promise<AchievementState[]> {
  return db.achievements.toArray();
}

export async function recordPurchase(
  db: PocketDb,
  purchase: { cosmeticId: string; cost: number },
  clock: Clock,
): Promise<void> {
  await db.purchases.add({ cosmeticId: purchase.cosmeticId, at: clock.now(), cost: purchase.cost });
}

export function listPurchases(db: PocketDb) {
  return db.purchases.toArray();
}
