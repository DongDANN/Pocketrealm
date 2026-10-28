/**
 * Gate 2 — schema versions and migrations (SPEC 10: "Migrations: Dexie version(n).stores()
 * .upgrade() with tests that start from stored fixtures of each old version").
 *
 * Version 1 is the budget-only shape: no quest/period/backup tables and no occurrence index.
 * Version 2 adds the Delve-lifecycle tables and backfills `occurrenceKey` on recurring
 * transactions, because the recurring generator is idempotent by that key — rows written before it
 * existed would otherwise be generated a second time on the next open.
 * Version 3 is the turn loop (DELVE_REDESIGN §10). It changes no indexes: it settles the runs the
 * old away-play model left behind.
 */

import type { Transaction as DexieUpgradeTransaction } from 'dexie';
import { occurrenceKey } from '../core/recurring';
import { today } from '../core/dates';
import type { LocalDate, Transaction } from '../core/types';
import { retreatRun } from '../core/delve';
import type { DelveMeta, HollowId, RunState } from '../core/delve';
import type { DelveMetaRow, DelveRunRow } from './db';
/**
 * Dexie store spec: table -> "primaryKey, index, &unique, *multi, [compound]". There is no
 * descending index in IndexedDB (Dexie sorts at query time with `.reverse()`), so a '-' prefix here
 * would become an index literally named "-createdAt" and fail the upgrade transaction.
 */
export type StoreSpec = Record<string, string>;

export interface MigrationStep {
  version: number;
  /** Omit for a version that only rewrites rows: IndexedDB stores nothing new, so no index changes. */
  stores?: StoreSpec;
  /** Runs inside the upgrade transaction: it either fully applies or the open fails. */
  upgrade?: (trans: DexieUpgradeTransaction) => void | Promise<void>;
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

export const V2_STORES: StoreSpec = {
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

export const SCHEMA_VERSION = 3;

export function upgradeToV2(trans: DexieUpgradeTransaction): void {
  backfillOccurrenceKeys(trans);
  backfillOilBalances(trans);
}

/* --------------------------------------------------------------------------------------------
 * Version 3 — the turn loop settles the away-play model out of the book.
 *
 * Until this build, a run advanced by itself: time passed, rooms resolved, Autopilot chose. The
 * player chooses now, which means a run that was mid-Hollow when the update landed has no future
 * it can walk into. Rather than delete it, v3 retreats it exactly as pressing "Retreat to camp"
 * would have — every Ember it had earned, its materials banked, the run left in history — and then
 * pays back the two things the update takes away: the Habit Cards it can no longer equip, and the
 * oil it spent on rooms that are now free. DELVE_REDESIGN §10.2.
 * ------------------------------------------------------------------------------------------ */

/** The single Delve meta row, by key. */
const META_KEY = 'meta';

/** What one equipped Habit Card is worth once cards stop existing (§10.2). */
export const CARD_DUST_VALUE = 5;

/** The best tier a capsule made from this Hollow's materials can reach (§7 D.3). */
const CAPSULE_CEILING: Record<HollowId, string> = { 1: 'rare', 2: 'epic', 3: 'mythic' };

/** The two Delve tables, as stored. */
export interface DelveRows {
  meta: DelveMetaRow[];
  runs: DelveRunRow[];
}

/** A stored meta row read before v3 existed has none of the collection fields. */
function withV3Defaults(stored: DelveMeta): DelveMeta {
  return {
    ...stored,
    skills: stored.skills ?? {},
    knownSkills: stored.knownSkills ?? [],
    equippedSkills: stored.equippedSkills ?? [],
    dust: stored.dust ?? 0,
    capsules: stored.capsules ?? {},
    capsuleIndex: stored.capsuleIndex ?? 0,
    pitySinceEpic: stored.pitySinceEpic ?? 0,
    capsuleTagStreak: stored.capsuleTagStreak ?? 0,
  };
}
/**
 * Names the reason in the run's own log, after the line the engine writes while banking, so history
 * ends on "the update did this" rather than on a retreat the player never pressed.
 */
function namedByTheUpdate(state: RunState): RunState {
  return {
    ...state,
    log: [
      ...state.log,
      {
        step: state.stepIndex,
        type: 'info',
        text: 'The update ended this run in camp: the Delve now plays one round at a time.',
      },
    ],
  };
}

/**
 * Fill a stored run with the fields v3 introduced. `orders` is what the turn loop replays; the floor
 * rule and the outstanding skip are answered for so no screen has to treat an old row specially.
 */
function withV3RunFields(stored: RunState): RunState {
  return {
    ...stored,
    orders: stored.orders ?? [],
    floorRule: stored.floorRule ?? null,
    skipOutstanding: stored.skipOutstanding ?? false,
  };
}

/**
 * Apply the v3 rules to the Delve tables. Pure, and shared by the Dexie upgrade and the import of a
 * v2 backup file (§10.3), so a restored book cannot keep a run this build has no way to advance.
 */
export function upgradeDelveRowsToV3(rows: DelveRows, on: LocalDate): DelveRows {
  const index = rows.meta.findIndex((row) => row.key === META_KEY);
  const row = rows.meta[index];
  // A book with no meta row has nowhere to bank to, so its runs are left as they are rather than
  // ended for nothing. normalizeMeta gives every real book one.
  if (!row) {
    return {
      meta: rows.meta,
      runs: rows.runs.map((run) => ({ ...run, state: withV3RunFields(run.state) })),
    };
  }

  let value = withV3Defaults(row.value);
  const runs: DelveRunRow[] = [];
  for (const stored of rows.runs) {
    const state = withV3RunFields(stored.state);
    if (state.result !== 'active') {
      runs.push({ ...stored, state });
      continue;
    }
    const settled = retreatRun(state, value, on);
    const ended = namedByTheUpdate(settled.run);
    value = settled.meta;
    if (!state.daily) {
      const ceiling = CAPSULE_CEILING[state.hollowId] ?? 'rare';
      value = {
        ...value,
        capsules: { ...value.capsules, [ceiling]: (value.capsules[ceiling] ?? 0) + 1 },
        capsuleIndex: value.capsuleIndex + 1,
      };
    }
    runs.push({
      ...stored,
      state: ended,
      result: ended.result,
      stepIndex: ended.stepIndex,
    });
  }

  // A card the player can no longer equip becomes dust, and the dropped field leaves with the v3
  // shape: `DelveMeta` no longer declares it, so nothing downstream can read it by accident.
  const { cards: cardsAtV2, ...rest } = value as DelveMeta & { cards?: string[] };
  value = {
    ...rest,
    dust: rest.dust + (cardsAtV2?.length ?? 0) * CARD_DUST_VALUE,
  };

  const meta = [...rows.meta];
  meta[index] = { ...row, value };
  return { meta, runs };
}

/**
 * Reads both Delve tables inside the upgrade transaction and rewrites them. Dexie gives no clock or
 * domain helpers here, so the local date comes from `today()` — the one place a migration is allowed
 * to read it, because the Embers daily cap is keyed on it.
 */
export function upgradeToV3(trans: DexieUpgradeTransaction): Promise<void> {
  return (async () => {
    const metaTable = trans.table<DelveMetaRow, string>('delveMeta');
    const runsTable = trans.table<DelveRunRow, string>('delveRuns');
    const upgraded = upgradeDelveRowsToV3(
      { meta: await metaTable.toArray(), runs: await runsTable.toArray() },
      today(),
    );
    await metaTable.bulkPut(upgraded.meta);
    await runsTable.bulkPut(upgraded.runs);
  })();
}

export const MIGRATIONS: readonly MigrationStep[] = [
  { version: 1, stores: LEGACY_STORES },
  { version: 2, stores: V2_STORES, upgrade: upgradeToV2 },
  // No `stores`: v3 rewrites rows and touches no index.
  { version: 3, upgrade: upgradeToV3 },
];
