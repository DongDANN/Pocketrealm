/**
 * Gate 1.6f — worker integrity (SPEC 6.11 M and N). Catch-up runs in a module Web Worker in the
 * app, so the job payload must be structured-cloneable, the job function must touch no DOM or
 * clock, and running it inside a real worker thread must produce byte-identical state to running
 * it in the main thread. The chunked worker path must also equal the non-chunked path.
 */

import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import {
  applySteps,
  catchUpChunks,
  catchUpStepCount,
  emptyMeta,
  newRun,
  runCatchUpJob,
  stateHash,
  type CatchUpJobRequest,
  type DelveMeta,
  type StepContext,
} from '../src/core/delve';
import { NO_SIGNALS, NOW, POLICY, TODAY } from './delve-helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A 12-hour absence is the worst case the spec cares about: 1440 steps of ceiling. */
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

function request(seed: number, absenceMs = TWELVE_HOURS): CatchUpJobRequest {
  const meta: DelveMeta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
  const run = newRun(seed, 1, 8, meta);
  const ctx: StepContext = {
    now: NOW + absenceMs,
    oil: 1440,
    oilCapacity: 1440,
    signals: { ...NO_SIGNALS, checkedInToday: true, envelopesWithinAllowance: 3 },
    meta,
    policy: { ...POLICY },
    today: TODAY,
  };
  return {
    run,
    ctx,
    maxSteps: catchUpStepCount(ctx.meta.lastStepAt, ctx.now),
    chunkSize: 64,
  };
}

describe('catch-up job', () => {
  it('takes a structured-cloneable payload and needs no clock or DOM', () => {
    const req = request(1234);
    expect(structuredClone(req)).toEqual(req);
    const out = runCatchUpJob(req);
    expect(out.progress.length).toBeGreaterThan(0);
    expect(out.result.applied).toBeGreaterThan(0);
    expect(out.result.run.stepIndex).toBe(out.result.applied);
    expect(out.logs.join(' ')).toContain(`applied ${out.result.applied} steps`);
  });

  it('agrees with the direct helpers on the main thread', () => {
    const req = request(99);
    const job = runCatchUpJob(req);
    const direct = applySteps(req.run, req.ctx, req.maxSteps);
    expect(stateHash(job.result)).toEqual(stateHash(direct));
    let last = direct;
    for (const chunk of catchUpChunks(req.run, req.ctx, req.maxSteps, req.chunkSize)) last = chunk;
    expect(stateHash(job.result)).toEqual(stateHash(last));
  });

  it('produces identical state inside a real worker thread', async () => {
    const req = request(20261025);
    const main = runCatchUpJob(req);
    const worker = new Worker(new URL('./fixtures/catchUp.worker.mjs', import.meta.url), {
      workerData: req,
    });
    const fromWorker = await new Promise<{
      result: typeof main.result;
      hash: string;
      ms: number;
    }>((resolve, reject) => {
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => code !== 0 && reject(new Error(`worker exited ${code}`)));
    });
    await worker.terminate();
    expect(fromWorker.hash).toBe(stateHash(main.result));
    expect(fromWorker.result.run.result).toBe(main.result.run.result);
    expect(fromWorker.result.ledger).toEqual(main.result.ledger);
    expect(fromWorker.result.applied).toBe(main.result.applied);
  });

  it('clears a 12-hour backlog (1440 steps) fast enough to stay under the SPEC budget', () => {
    // A 12 h absence is at most 1440 steps; the app starts the next run when one ends, so the
    // worst case is a chain of runs covering the whole window.
    let applied = 0;
    let chunks = 0;
    const started = performance.now();
    for (let seed = 1; applied < 1440 && seed < 200; seed++) {
      const out = runCatchUpJob(request(seed));
      applied += out.result.applied;
      chunks += out.progress.length;
    }
    const ms = performance.now() - started;
    expect(applied).toBeGreaterThanOrEqual(1440);
    expect(chunks).toBeGreaterThan(1);
    // SPEC 6.11 M targets about 2 s on a throttled mid-range phone; Node on this CPU must clear it
    // by a wide margin. The bound is loose on purpose so CI jitter cannot flake it.
    expect(ms).toBeLessThan(2000);
    console.info(`1440 catch-up steps across chained runs: ${ms.toFixed(0)}ms`);
  });

  it('grants no steps for a backwards clock or an absence under one step', () => {
    const req = request(5, -DAY_MS);
    expect(catchUpStepCount(NOW, NOW - DAY_MS)).toBe(0);
    expect(runCatchUpJob(req).result.applied).toBe(0);
    expect(runCatchUpJob(request(6, 10_000)).result.applied).toBe(0);
  });
});
