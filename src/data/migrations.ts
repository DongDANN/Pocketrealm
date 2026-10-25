/**
 * Gate 2 — schema versions and migrations (SPEC 10: "Migrations: Dexie version(n).stores()
 * .upgrade() with tests that start from stored fixtures of each old version").
 *
 * Version 1 is the budget-only shape: no quest/period/backup tables and no occurrence index.
 * Version 2 adds the Delve-lifecycle tables and backfills `occurrenceKey` on recurring
 * transactions, because the recurring generator is idempotent by that key — rows written before it
 * existed would otherwise be generated a second time on the next open.
 */

import type { Transaction as DexieUpgradeTransaction } from 'dexie';
import { occurrenceKey } from '../core/recurring';
import type { Transaction } from '../core/types';
/**
 * Dexie store spec: table -> "primaryKey, index, &unique, *multi, [compound]". There is no
 * descending index in IndexedDB (Dexie sorts at query time with `.reverse()`), so a '-' prefix here
 * would become an index literally named "-createdAt" and fail the upgrade transaction.
 */
export type StoreSpec = Record<string, string>;

export interface MigrationStep {
  version: number;
  stores: StoreSpec;
  /** Runs inside the upgrade transaction: it either fully applies or the open fails. */
  upgrade?: (trans: DexieUpgradeTransaction) => void;
}

/**
 * The v1 baseline, exported because the migration test writes a real v1 database with it rather
 * than trusting a comment about what the old schema used to look like.
 */
export const LEGACY_STORES: StoreSpec = {
  settings: 'key',
  envelopes: 'id, sortOrder',
  transactions: 'id, date, envelopeId, createdAt, recurringId, deletedAt',
  goals: 'id',
  recurrings: 'id',
  rewards: 'key, at, type',
  companions: 'id',
  achievements: 'id',
  purchases: '++seq, cosmeticId',
  delveRuns: 'runId, startedAt, result',
  delveMeta: 'key',
};

const V2_STORES: StoreSpec = {
  // A new index on an existing table; every other table keeps its v1 definition.
  transactions: 'id, date, envelopeId, createdAt, recurringId, deletedAt, occurrenceKey',
  questProgress: '[questId+periodId], periodId',
  periodCloses: 'periodId, end',
  backups: '++id, at',
};

/** v1 -> v2: recurring transactions gain the occurrence key they were written without. */
export function backfillOccurrenceKeys(trans: DexieUpgradeTransaction): void {
  void trans
    .table<Transaction>('transactions')
    .toCollection()
    .modify((txn) => {
      if (txn.recurringId && !txn.occurrenceKey) {
        txn.occurrenceKey = occurrenceKey(txn.recurringId, txn.date);
      }
    });
}

/**
 * The Lantern Oil balance is a column on the meta row, not a field of core's DelveMeta, so a v1 row
 * has no wallet at all. A returning runner starts empty rather than crashing on `undefined` oil.
 */
export function backfillOilBalances(trans: DexieUpgradeTransaction): void {
  void trans
    .table<{ key: string; oil?: number }>('delveMeta')
    .toCollection()
    .modify((row) => {
      if (typeof row.oil !== 'number') row.oil = 0;
    });
}

export const SCHEMA_VERSION = 2;

export function upgradeToV2(trans: DexieUpgradeTransaction): void {
  backfillOccurrenceKeys(trans);
  backfillOilBalances(trans);
}

export const MIGRATIONS: readonly MigrationStep[] = [
  { version: 1, stores: LEGACY_STORES },
  { version: 2, stores: V2_STORES, upgrade: upgradeToV2 },
];
