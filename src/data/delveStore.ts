/**
 * Gate 2b — batched Delve persistence (SPEC 6.9). The engine advances one step at a time and never
 * touches storage; this writes a whole advance — run state, meta, oil wallet and the rewards the
 * batch proposes — inside one Dexie transaction, idempotent by `runId` + `stepIndex`.
 *
 * Why the idempotence key is the step index: the app can die between the engine finishing a batch
 * and the write landing, or the same batch can be sent twice after a reload. Either way, refusing a
 * batch whose step index does not move forward means a step is applied exactly once and a reward is
 * banked exactly once. The ledger's own key idempotence is the second belt, not the first.
 *
 * Gate 4 adds two cases the engine always had but the store could not express: starting a run at
 * step zero, and resolving a pending choice (or retreating) without advancing the step index. Both
 * have their own guarded write path, so a stale choice can never overwrite a newer room.
 */

import { clampOil } from '../core/rewards';
import type { LocalDate } from '../core/types';
import type { DelveMeta, RunState, StepOutcome } from '../core/delve';
import type { DelveMetaRow, DelveRunRow, PocketDb } from './db';
import { grantMany } from './ledger';

/** The single meta document. Core's DelveMeta has no oil field, so the wallet rides on the row. */
export const META_KEY = 'meta';

export interface DelveBatch {
  run: RunState;
  meta: DelveMeta;
  /** Absolute Lantern Oil balance after the batch, not a delta. */
  oil: number;
  /** Absolute storage capacity; when omitted the legacy 200 cap applies. */
  oilCapacity?: number;
  /**
   * Ledger oil total already folded into this wallet. Omitted on legacy callers and preserved from
   * the stored row, so a replayed batch never turns the same grants into free oil.
   */
  oilGranted?: number;
  /** Reward hooks proposed by the engine, capped and deduplicated by the ledger. */
  ledger?: StepOutcome['ledger'];
  /** Local date the ledger rows are stamped with; injected so tests control it. */
  today: LocalDate;
  /** Epoch ms for the row timestamps; injected, never read from the clock here. */
  now: number;
}

export interface CommitResult {
  applied: boolean;
  /** Why a batch was refused: it was already stored, rewound progress, or has no run to attach to. */
  skipped?: 'duplicate' | 'stale' | 'missing';
  /** Steps this write moved the run forward. */
  stepsApplied: number;
  /** Reward rows the ledger actually accepted. */
  granted: number;
}

export interface MetaWallet {
  meta: DelveMeta;
  oil: number;
}

export interface MetaWalletWrite {
  meta: DelveMeta;
  oil: number;
  now: number;
  oilCapacity?: number;
  oilGranted?: number;
}

function boundedOil(oil: number, capacity?: number): number {
  const stored = Math.max(0, Math.trunc(Number.isFinite(oil) ? oil : 0));
  // The legacy cap is 200; a caller that knows the real capacity (Forge lamp + review buff)
  // may store more than that, but never more than the lamp can hold.
  if (capacity === undefined) return clampOil(stored);
  return Math.min(stored, Math.max(0, Math.trunc(capacity)));
}

function walletRow(batch: DelveBatch, existing: DelveMetaRow | undefined): DelveMetaRow {
  const oilGranted = batch.oilGranted ?? existing?.oilGranted;
  return {
    key: META_KEY,
    value: batch.meta,
    oil: boundedOil(batch.oil, batch.oilCapacity),
    ...(oilGranted !== undefined ? { oilGranted } : {}),
    updatedAt: batch.now,
  };
}

/** All writes in an accepted batch share the caller's transaction: it lands whole or not at all. */
async function writeAccepted(
  db: PocketDb,
  batch: DelveBatch,
  previous: DelveRunRow | undefined,
): Promise<CommitResult> {
  const { run, today, now } = batch;
  const row: DelveRunRow = {
    runId: run.runId,
    startedAt: previous?.startedAt ?? now,
    updatedAt: now,
    hollowId: run.hollowId,
    result: run.result,
    stepIndex: run.stepIndex,
    daily: run.daily,
    state: run,
  };
  await db.delveRuns.put(row);
  const existingMeta = await db.delveMeta.get(META_KEY);
  await db.delveMeta.put(walletRow(batch, existingMeta));

  const results = await grantMany(
    db,
    (batch.ledger ?? []).map((entry) => ({ ...entry, at: today })),
  );
  return {
    applied: true,
    stepsApplied: Math.max(0, run.stepIndex - (previous?.stepIndex ?? 0)),
    granted: results.filter((r) => r.granted).length,
  };
}

function validate(batch: DelveBatch): void {
  if (!batch.run.runId) throw new Error('A delve batch needs the run id it belongs to');
  if (!Number.isFinite(batch.run.stepIndex))
    throw new Error(`Run ${batch.run.runId} has no usable step index`);
}

/**
 * Commit one advance. A batch that does not increase the stored step index is refused without
 * writing anything, and every write in an accepted batch shares one transaction.
 */
export async function commitBatch(db: PocketDb, batch: DelveBatch): Promise<CommitResult> {
  validate(batch);
  const { run } = batch;

  return db.transaction('rw', db.delveRuns, db.delveMeta, db.rewards, async () => {
    const previous = await db.delveRuns.get(run.runId);
    // A run row only ever exists once the first batch landed, so an unseen run is at its start.
    const from = previous?.stepIndex ?? 0;
    if (run.stepIndex <= from) {
      return {
        applied: false,
        skipped: run.stepIndex === from ? ('duplicate' as const) : ('stale' as const),
        stepsApplied: 0,
        granted: 0,
      };
    }
    return writeAccepted(db, batch, previous);
  });
}

/** Write the first row of a run at step zero. Refuses silently when the run already exists. */
export async function createRun(db: PocketDb, batch: DelveBatch): Promise<CommitResult> {
  validate(batch);
  if (batch.run.stepIndex !== 0) {
    throw new Error(`A new run must start at step 0, not ${batch.run.stepIndex}`);
  }
  return db.transaction('rw', db.delveRuns, db.delveMeta, db.rewards, async () => {
    const previous = await db.delveRuns.get(batch.run.runId);
    if (previous) {
      return { applied: false, skipped: 'duplicate' as const, stepsApplied: 0, granted: 0 };
    }
    return writeAccepted(db, batch, undefined);
  });
}

/**
 * Persist a choice resolution, a reroll or an explicit retreat. The step index must stay put; the
 * stored run must actually be waiting on something, or the incoming state must be an ending. That
 * second clause is what lets a retreat work from an ordinary room and still blocks a stale sheet.
 */
export async function commitChoice(db: PocketDb, batch: DelveBatch): Promise<CommitResult> {
  validate(batch);
  const { run } = batch;

  return db.transaction('rw', db.delveRuns, db.delveMeta, db.rewards, async () => {
    const previous = await db.delveRuns.get(run.runId);
    if (!previous) {
      return { applied: false, skipped: 'missing' as const, stepsApplied: 0, granted: 0 };
    }
    if (run.stepIndex !== previous.stepIndex) {
      return {
        applied: false,
        skipped: run.stepIndex < previous.stepIndex ? ('stale' as const) : ('duplicate' as const),
        stepsApplied: 0,
        granted: 0,
      };
    }
    const waiting = previous.state.pendingChoice !== null;
    const ended = previous.state.result === 'active' && run.result !== 'active';
    const openedChoice = run.pendingChoice !== null;
    if (!waiting && !ended && !openedChoice) {
      return { applied: false, skipped: 'duplicate' as const, stepsApplied: 0, granted: 0 };
    }
    return writeAccepted(db, batch, previous);
  });
}

/** Write the meta/wallet pair on its own (catch-up timestamp, Forge purchases, Workshop crafting). */
export async function saveMetaWallet(
  db: PocketDb,
  write: MetaWalletWrite,
): Promise<MetaWallet & { oilGranted?: number }> {
  return db.transaction('rw', db.delveMeta, async () => {
    const existing = await db.delveMeta.get(META_KEY);
    const oilGranted = write.oilGranted ?? existing?.oilGranted;
    const row: DelveMetaRow = {
      key: META_KEY,
      value: write.meta,
      oil: boundedOil(write.oil, write.oilCapacity),
      ...(oilGranted !== undefined ? { oilGranted } : {}),
      updatedAt: write.now,
    };
    await db.delveMeta.put(row);
    return {
      meta: write.meta,
      oil: row.oil,
      ...(oilGranted !== undefined ? { oilGranted } : {}),
    };
  });
}

export async function loadRun(db: PocketDb, runId: string): Promise<DelveRunRow | undefined> {
  return db.delveRuns.get(runId);
}

/** The run to resume, if any. A finished run stays in history but never occupies this slot. */
export async function loadActiveRun(db: PocketDb): Promise<DelveRunRow | undefined> {
  const rows = await db.delveRuns.where('result').equals('active').toArray();
  if (rows.length === 0) return undefined;
  return rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

export async function loadMeta(db: PocketDb): Promise<MetaWallet | null> {
  const row = await db.delveMeta.get(META_KEY);
  if (!row) return null;
  return { meta: row.value, oil: row.oil };
}

export type DelveRunRowSummary = Omit<DelveRunRow, 'state'> & { state: RunState };

/** Newest first; the UI keeps its own small limit so a long history cannot paint a huge list. */
export async function listDelveRuns(db: PocketDb): Promise<DelveRunRowSummary[]> {
  const rows = await db.delveRuns.toArray();
  return rows.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0));
}
