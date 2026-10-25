/**
 * Catch-up with clock defense. The engine is pure; this module computes how many steps may be
 * applied after an absence: one step per 30 s, limited by available oil and a hard 12 h cap.
 * A backwards clock grants zero steps and never lowers maxSeenAt. Steps are applied one at a
 * time so the UI can chunk them and report progress.
 */

import { stepRun, type StepOutcome } from './engine';
import type { DelveMeta, RunState, StepContext } from './types';

export const STEP_MS = 30_000;
export const CATCH_UP_CAP_MS = 12 * 60 * 60 * 1000;

/** Elapsed ms since the last step, clamped to [0, 12 h]. Backwards clocks give 0. */
export function elapsedSteps(lastStepAt: number, now: number): number {
  if (now <= lastStepAt) return 0;
  return Math.min(Math.floor((now - lastStepAt) / STEP_MS), Math.floor(CATCH_UP_CAP_MS / STEP_MS));
}

/** How many steps a catch-up may run right now. */
export function catchUpStepCount(lastStepAt: number, now: number, oil: number): number {
  return Math.min(elapsedSteps(lastStepAt, now), Math.max(0, Math.trunc(oil)));
}

export interface CatchUpResult {
  run: RunState;
  meta: DelveMeta;
  applied: number;
  ledger: StepOutcome['ledger'];
  oilSpent: number;
}

/** Apply up to `maxSteps`, stopping early when the run ends or a choice is pending. */
export function applySteps(
  run: RunState,
  ctx: StepContext,
  maxSteps: number,
  onStep?: (run: RunState, i: number) => void,
): CatchUpResult {
  let r = run;
  let m = ctx.meta;
  let applied = 0;
  let oil = ctx.oil;
  const ledger: StepOutcome['ledger'] = [];
  for (let i = 0; i < maxSteps; i++) {
    const out = stepRun(r, { ...ctx, meta: m, oil });
    if (out.oilSpent === 0 && !out.ended) break;
    r = out.run;
    m = out.meta;
    oil -= out.oilSpent;
    ledger.push(...out.ledger);
    applied += 1;
    onStep?.(r, i);
    if (r.result !== 'active') break;
  }
  return { run: r, meta: m, applied, ledger, oilSpent: ctx.oil - oil };
}

/** Chunked catch-up: yields after every chunk so the UI can paint progress. */
export function* catchUpChunks(
  run: RunState,
  ctx: StepContext,
  maxSteps: number,
  chunkSize = 32,
): Generator<CatchUpResult, CatchUpResult, void> {
  let r = run;
  let m = ctx.meta;
  let oil = ctx.oil;
  let appliedTotal = 0;
  const ledger: StepOutcome['ledger'] = [];
  for (let start = 0; start < maxSteps; start += chunkSize) {
    const result = applySteps(r, { ...ctx, meta: m, oil }, Math.min(chunkSize, maxSteps - start));
    r = result.run;
    m = result.meta;
    oil -= result.oilSpent;
    appliedTotal += result.applied;
    ledger.push(...result.ledger);
    yield { run: r, meta: m, applied: appliedTotal, ledger, oilSpent: ctx.oil - oil };
    if (r.result !== 'active') break;
  }
  return { run: r, meta: m, applied: appliedTotal, ledger, oilSpent: ctx.oil - oil };
}
