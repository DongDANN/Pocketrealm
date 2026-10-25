/**
 * Gate 2 — the Dexie database (SPEC 3/4/10). `src/core` stays storage-free; this is the only place
 * that knows IndexedDB exists. Every row type is a core domain type (or a thin wrapper around one),
 * so anything stored here is JSON-round-trippable and therefore exportable, importable and
 * structurally cloneable into a Web Worker without a second definition to keep in sync.
 */

import Dexie, { type Table } from 'dexie';
import type { DelveMeta, RunResult, RunState } from '../core/delve';
import type {
  AchievementState,
  Companion,
  Envelope,
  Goal,
  PeriodSummary,
  QuestProgress,
  Recurring,
  RewardEvent,
  Settings,
  Transaction,
} from '../core/types';
import { MIGRATIONS, SCHEMA_VERSION } from './migrations';

export const DB_NAME = 'pocketrealm';

export type TransactionRow = Transaction;
export type EnvelopeRow = Envelope;
export type GoalRow = Goal;
export type RecurringRow = Recurring;
export type RewardRow = RewardEvent;
export type CompanionRow = Companion;
export type AchievementRow = AchievementState;
export type QuestProgressRow = QuestProgress;
export type PeriodSummaryRow = PeriodSummary;

/** Single-document tables keep `{ key, value }` so the domain type stays exactly as core defines it. */
export interface SettingsRow {
  key: string;
  value: Settings;
}

export interface DelveMetaRow {
  key: string;
  value: DelveMeta;
  /**
   * Lantern Oil balance. Core's DelveMeta deliberately has no oil field — oil is granted by the
   * ledger and spent by the caller — so the wallet lives on the row next to the meta it funds.
   */
  oil: number;
  updatedAt: number;
}

/**
 * A persisted run. `state` is the whole engine state; `runId` + `stepIndex` is the idempotence key
 * the batch writer uses so a crash or a double claim can never apply the same step twice.
 */
export interface DelveRunRow {
  runId: string;
  startedAt: number;
  updatedAt: number;
  hollowId: number;
  result: RunResult;
  stepIndex: number;
  daily: boolean;
  state: RunState;
}

/**
 * A cosmetic bought with Sparks. There is no core type for it: the shop is storage-only, and a
 * purchase is a receipt, not game state.
 */
export interface PurchaseRow {
  seq?: number;
  cosmeticId: string;
  cost: number;
  at: number;
}

export type BackupReason = 'pre-import' | 'manual' | 'reminder';

/** Snapshots are stored as JSON text: a backup is a file the user can read, not live state. */
export interface BackupRow {
  id?: number;
  at: number;
  schemaVersion: number;
  reason: BackupReason;
  json: string;
}

/** The typed surface of the database. Repositories and lifecycle jobs take this, not a global. */
export interface PocketDb extends Dexie {
  settings: Table<SettingsRow, string>;
  envelopes: Table<EnvelopeRow, string>;
  transactions: Table<TransactionRow, string>;
  goals: Table<GoalRow, string>;
  recurrings: Table<RecurringRow, string>;
  rewards: Table<RewardRow, string>;
  companions: Table<CompanionRow, string>;
  achievements: Table<AchievementRow, string>;
  purchases: Table<PurchaseRow, number>;
  delveRuns: Table<DelveRunRow, string>;
  delveMeta: Table<DelveMetaRow, string>;
  questProgress: Table<QuestProgressRow, [string, string]>;
  periodCloses: Table<PeriodSummaryRow, string>;
  backups: Table<BackupRow, number>;
}

/** Table names in schema order; used by the export writer and the schema test. */
export const DB_TABLES = [
  'settings',
  'envelopes',
  'transactions',
  'goals',
  'recurrings',
  'rewards',
  'companions',
  'achievements',
  'purchases',
  'delveRuns',
  'delveMeta',
  'questProgress',
  'periodCloses',
  'backups',
] as const;

export type TableName = (typeof DB_TABLES)[number];

export interface OpenOptions {
  name?: string;
  /** Injectable for tests (fake-indexeddb) and for a future second database. */
  indexedDB?: IDBFactory;
  /** Must match `indexedDB`; Dexie does not fall back to the global when you pass a factory. */
  IDBKeyRange?: typeof IDBKeyRange;
}

/** Open (and, if needed, migrate) the database. Idempotent: reopening is free. */
export function openDatabase(options: OpenOptions = {}): PocketDb {
  const db = (options.indexedDB
    ? new Dexie(options.name ?? DB_NAME, {
        indexedDB: options.indexedDB,
        IDBKeyRange: options.IDBKeyRange ?? globalThis.IDBKeyRange,
      })
    : new Dexie(options.name ?? DB_NAME)) as unknown as PocketDb;
  for (const step of MIGRATIONS) {
    const version = db.version(step.version).stores(step.stores);
    if (step.upgrade) version.upgrade(step.upgrade);
  }
  return db;
}

/** The production schema version, re-exported so Settings and backups can stamp it. */
export { SCHEMA_VERSION };
