/**
 * The catch-up job boundary (SPEC 6.11 M). The app runs this inside a module Web Worker; Node
 * tests run the exact same function in-process. The payload is plain JSON (structured-clone
 * safe), the clock arrives injected on the context, and the only side channel is the progress
 * list — so a worker and the main thread can be compared byte for byte.
 */

import { catchUpChunks, type CatchUpResult } from './catchup';
import type { RunState, StepContext } from './types';

export interface CatchUpJobRequest {
  run: RunState;
  ctx: StepContext;
  /** Upper bound on steps; the caller computes it from the elapsed time and available oil. */
  maxSteps: number;
  /** Rooms per progress report. */
  chunkSize?: number;
}

export interface CatchUpJobResponse {
  /** Final state patch the main thread persists. */
  result: CatchUpResult;
  /** One entry per chunk, so the UI can paint a progress bar from a single postMessage. */
  progress: CatchUpResult[];
  /** Human-readable trace of what happened, for logs and crash reports. */
  logs: string[];
}

/**
 * Run a whole catch-up synchronously; used by the worker and by Node tests alike. `onProgress` is
 * called after every chunk, so a worker can post a determinate progress bar without changing the
 * simulation or the returned patch.
 */
export function runCatchUpJob(
  req: CatchUpJobRequest,
  onProgress?: (chunk: CatchUpResult) => void,
): CatchUpJobResponse {
  const chunkSize = req.chunkSize ?? 32;
  const logs: string[] = [];
  const progress: CatchUpResult[] = [];
  const idle: CatchUpResult = {
    run: req.run,
    meta: req.ctx.meta,
    applied: 0,
    ledger: [],
    oilSpent: 0,
  };
  if (req.maxSteps <= 0) {
    logs.push('no steps available (clock rewound or not enough time elapsed).');
    return { result: idle, progress, logs };
  }
  try {
    let result = idle;
    for (const chunk of catchUpChunks(req.run, req.ctx, req.maxSteps, chunkSize)) {
      result = chunk;
      progress.push(chunk);
      onProgress?.(chunk);
    }
    logs.push(
      `applied ${result.applied} steps, spent ${result.oilSpent} oil, result ${result.run.result}.`,
    );
    return { result, progress, logs };
  } catch (error) {
    logs.push(error instanceof Error ? error.message : String(error));
    return { result: idle, progress, logs };
  }
}
