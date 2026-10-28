/**
 * Gate 2b — batched Delve persistence. SPEC 6.9's determinism rules say a step is the unit of
 * progress, so a batch write must be all-or-nothing and idempotent by `runId` + `stepIndex`: a
 * crash or a double claim can neither double-apply a step, lose one, nor bank a reward twice.
 */

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySteps,
  emptyMeta,
  newRun,
  stateHash,
  type DelveMeta,
  type RunState,
  type StepOutcome,
} from '../src/core/delve';
import type { PocketDb } from '../src/data/db';
import { commitBatch, loadActiveRun, loadMeta, loadRun } from '../src/data/delveStore';
import { dbOn } from './data-harness';
import { mkCtx, NOW, TODAY } from './delve-helpers';

const NAME = 'delve-store';

/** A committed batch is one engine advance: run, meta, oil wallet and the rewards it proposes. */
type LedgerEntry = StepOutcome['ledger'][number];

function batch(run: RunState, meta: DelveMeta, oil: number, ledger: LedgerEntry[]) {
  return { run, meta, oil, ledger, today: TODAY, now: NOW };
}

function walk(
  run: RunState,
  meta: DelveMeta,
  oil: number,
  steps: number,
): { batch: ReturnType<typeof batch>; index: number }[] {
  let r = run;
  let m = meta;
  const o = oil;
  const out: { batch: ReturnType<typeof batch>; index: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const res = applySteps(r, mkCtx(m, { oil: o }), 1);
    if (res.applied === 0) break;
    r = res.run;
    m = res.meta;
    out.push({ batch: batch(r, m, o, res.ledger), index: r.stepIndex });
  }
  return out;
}

describe('delve batch store', () => {
  let factory: IDBFactory;
  let db: PocketDb;

  beforeEach(() => {
    factory = new IDBFactory();
    db = dbOn(factory, NAME);
  });

  it('writes the run, the meta and the oil wallet together', async () => {
    const meta = emptyMeta();
    const run = newRun(7, 1, 4, meta);
    const [first] = walk(run, meta, 200, 1);
    expect(first).toBeDefined();

    const result = await commitBatch(db, first!.batch);
    expect(result).toMatchObject({ applied: true, stepsApplied: 1, granted: expect.any(Number) });

    const stored = await loadRun(db, run.runId);
    expect(stored?.stepIndex).toBe(first!.batch.run.stepIndex);
    expect(stored?.hollowId).toBe(1);
    expect(stored?.result).toBe('active');
    expect(stateHash(stored!.state)).toBe(stateHash(first!.batch.run));

    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(first!.batch.oil);
    expect(stateHash(wallet?.meta)).toBe(stateHash(first!.batch.meta));
  });

  it('has no meta and no active run before the first commit', async () => {
    expect(await loadMeta(db)).toBeNull();
    expect(await loadActiveRun(db)).toBeUndefined();
  });

  it('lands a step-by-step commit chain on exactly one batch of the same steps', async () => {
    const meta = emptyMeta();
    const run = newRun(11, 1, 4, meta);

    const stepwise = walk(run, meta, 200, 5);
    expect(stepwise.length).toBeGreaterThan(1);
    for (const s of stepwise) await commitBatch(db, s.batch);

    // Same engine path, but accumulated into a single write on a second database.
    const merged = applySteps(run, mkCtx(meta, { oil: 200 }), stepwise.length);
    const db2 = dbOn(new IDBFactory(), `${NAME}-merged`);
    const mergedResult = await commitBatch(db2, {
      ...batch(merged.run, merged.meta, 200, merged.ledger),
    });

    expect(await loadRun(db, run.runId)).toEqual(await loadRun(db2, run.runId));
    expect(await loadMeta(db)).toEqual(await loadMeta(db2));
    expect(mergedResult.applied).toBe(true);
    const stepwiseKeys = (await db.rewards.toArray()).map((e) => e.key);
    const mergedKeys = (await db2.rewards.toArray()).map((e) => e.key);
    expect(mergedKeys).toEqual(stepwiseKeys);
    expect(mergedResult.granted).toBe(mergedKeys.length);
  });

  it('treats a re-sent batch as a no-op after a reopen, so no reward is banked twice', async () => {
    const meta = emptyMeta();
    const run = newRun(3, 1, 4, meta);
    const chain = walk(run, meta, 200, 4);
    for (const s of chain) await commitBatch(db, s.batch);
    const runRow = await loadRun(db, run.runId);
    const wallet = await loadMeta(db);
    const keys = (await db.rewards.toArray()).map((e) => e.key);
    db.close();

    // Same factory, new connection: what a crash-and-reload looks like to the app.
    const again = dbOn(factory, NAME);
    const last = chain[chain.length - 1]!;

    const replay = await commitBatch(again, last.batch);
    expect(replay).toMatchObject({ applied: false, skipped: 'duplicate' });
    expect(await loadRun(again, run.runId)).toEqual(runRow);
    expect((await again.rewards.toArray()).map((e) => e.key)).toEqual(keys);
    expect(await loadMeta(again)).toEqual(wallet);

    // An older batch is refused the same way: the stored step index never moves backwards.
    const stale = await commitBatch(again, chain[0]!.batch);
    expect(stale).toMatchObject({ applied: false, skipped: 'stale' });
    expect((await loadRun(again, run.runId))?.stepIndex).toBe(last.batch.run.stepIndex);
  });

  it('rolls the whole batch back when one write in it fails', async () => {
    const meta = emptyMeta();
    const run = newRun(5, 1, 4, meta);
    const chain = walk(run, meta, 200, 40);
    // The batch under test has to carry a reward, otherwise the injected write failure never fires.
    const cut = chain.findIndex((s) => s.batch.ledger.length > 0);
    expect(cut).toBeGreaterThan(0);
    for (const s of chain.slice(0, cut)) await commitBatch(db, s.batch);
    const target = chain[cut]!;
    const before = await loadRun(db, run.runId);
    const walletBefore = await loadMeta(db);
    expect(before?.stepIndex).toBe(chain[cut - 1]!.batch.run.stepIndex);

    const failing = await db.rewards.add({
      key: 'sentinel',
      type: 'log',
      xp: 0,
      sparks: 0,
      at: TODAY,
    });
    expect(failing).toBe('sentinel');
    vi.spyOn(db.rewards, 'add').mockRejectedValue(new Error('quota'));

    await expect(commitBatch(db, target.batch)).rejects.toThrow('quota');
    expect(await loadRun(db, run.runId)).toEqual(before);
    expect(await loadMeta(db)).toEqual(walletBefore);
    const keys = (await db.rewards.toArray()).map((e) => e.key);
    expect(keys).toContain('sentinel');
    expect(keys).not.toContain(target.batch.ledger[0]!.key);
    vi.restoreAllMocks();
  });

  it('keeps a finished run in history but out of the active slot', async () => {
    const meta = emptyMeta();
    const run = newRun(9, 1, 4, meta);
    const chain = walk(run, meta, 200, 3);
    for (const s of chain) await commitBatch(db, s.batch);
    expect((await loadActiveRun(db))?.runId).toBe(run.runId);

    // Retreating is a step of its own: the state changes and the index moves forward.
    const last = chain[chain.length - 1]!.batch;
    await commitBatch(db, {
      ...last,
      run: { ...last.run, stepIndex: last.run.stepIndex + 1, result: 'retreated' },
    });

    expect(await loadActiveRun(db)).toBeUndefined();
    expect((await loadRun(db, run.runId))?.result).toBe('retreated');
  });

  it('refuses a batch that cannot say where the run stopped', async () => {
    const meta = emptyMeta();
    const run = newRun(13, 1, 4, meta);
    const [first] = walk(run, meta, 200, 1);
    expect(first).toBeDefined();

    // A step index that is not a number never loses the `<=` comparison, so without a guard it is
    // accepted and banks a row every later read inherits. A batch with no run id cannot be keyed.
    await expect(
      commitBatch(db, { ...first!.batch, run: { ...first!.batch.run, stepIndex: NaN } }),
    ).rejects.toThrow(/step index/);
    await expect(
      commitBatch(db, { ...first!.batch, run: { ...first!.batch.run, runId: '' } }),
    ).rejects.toThrow(/run id/);

    await expect(db.delveRuns.count()).resolves.toBe(0);
    expect(await loadMeta(db)).toBeNull();
  });
});
