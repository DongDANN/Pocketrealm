/**
 * Gate 2b — batched Delve persistence (SPEC 6.9). The engine advances one step at a time and never
 * touches storage; this writes a whole advance — run state, meta, oil wallet and the rewards the
 * batch proposes — inside one Dexie transaction, idempotent by `runId` + `stepIndex`.
 *
 * Why the idempotence key is the step index: the app can die between the engine finishing a batch
 * and the write landing, or the same batch can be sent twice after a reload. Either way, refusing a
 * batch whose step index does not move forward means a step is applied exactly once and a reward is
 * banked exactly once. The ledger's own key idempotence is the second belt, not the first.
 */

import { clampOil } from '../core/rewards';
import type { LocalDate } from '../core/types';
import type { DelveMeta, RunState, StepOutcome } from '../core/delve';
import type { DelveRunRow, PocketDb } from './db';
import { grantMany } from './ledger';

/** The single meta document. Core's DelveMeta has no oil field, so the wallet rides on the row. */
export const META_KEY = 'meta';

export interface DelveBatch {
  run: RunState;
  meta: DelveMeta;
  /** Absolute Lantern Oil balance after the batch, not a delta. */
  oil: number;
  /** Reward hooks proposed by the engine, capped and deduplicated by the ledger. */
  ledger?: StepOutcome['ledger'];
  /** Local date the ledger rows are stamped with; injected so tests control it. */
  today: LocalDate;
  /** Epoch ms for the row timestamps; injected, never read from the clock here. */
  now: number;
}

export interface CommitResult {
  applied: boolean;
  /** Why a batch was refused: it was already stored, or it would rewind progress. */
  skipped?: 'duplicate' | 'stale';
  /** Steps this write moved the run forward. */
  stepsApplied: number;
  /** Reward rows the ledger actually accepted. */
  granted: number;
}

export interface MetaWallet {
  meta: DelveMeta;
  oil: number;
}

/**
 * Commit one batch. A batch that does not increase the stored step index is refused without writing
 * anything, and every write in an accepted batch shares one transaction: it lands whole or not at all.
 */
export async function commitBatch(db: PocketDb, batch: DelveBatch): Promise<CommitResult> {
  const { run, meta, oil, today, now } = batch;
  if (!run.runId) throw new Error('A delve batch needs the run id it belongs to');
  if (!Number.isFinite(run.stepIndex)) throw new Error(`Run ${run.runId} has no usable step index`);

  return db.transaction('rw', db.delveRuns, db.delveMeta, db.rewards, async () => {
    const previous = await db.delveRuns.get(run.runId);
    const from = previous?.stepIndex ?? 0;
    if (run.stepIndex <= from) {
      return {
        applied: false,
        skipped: run.stepIndex === from ? ('duplicate' as const) : ('stale' as const),
        stepsApplied: 0,
        granted: 0,
      };
    }

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
    await db.delveMeta.put({ key: META_KEY, value: meta, oil: clampOil(oil), updatedAt: now });

    const specs = (batch.ledger ?? []).map((entry) => ({ ...entry, at: today }));
    const results = await grantMany(db, specs);
    return {
      applied: true,
      stepsApplied: run.stepIndex - from,
      granted: results.filter((r) => r.granted).length,
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
