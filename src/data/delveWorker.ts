/**
 * Main-thread transport for the catch-up worker. A browser gets a real module worker; anything
 * without `window` (Node tests, scripts) runs the same job in-process. The controller catches a
 * transport failure and falls back to the in-process job, so being offline or in an old browser
 * can delay the progress bar but never lose catch-up.
 */

import {
  runCatchUpJob,
  type CatchUpJobRequest,
  type CatchUpJobResponse,
  type CatchUpResult,
} from '../core/delve';

export type CatchUpProgress = (chunk: CatchUpResult) => void;

export type CatchUpRunner = (
  request: CatchUpJobRequest,
  onProgress?: CatchUpProgress,
) => Promise<CatchUpJobResponse>;

type WorkerMessage =
  | { type: 'progress'; chunk: CatchUpResult }
  | { type: 'done'; response: CatchUpJobResponse }
  | { type: 'error'; message: string };

/** False in Node/Vitest, where the same job runs synchronously and no worker file is loaded. */
function canUseWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export function runCatchUpRemote(
  request: CatchUpJobRequest,
  onProgress?: CatchUpProgress,
): Promise<CatchUpJobResponse> {
  if (!canUseWorker()) return Promise.resolve(runCatchUpJob(request, onProgress));

  return new Promise<CatchUpJobResponse>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./workers/delveCatchup.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let settled = false;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      run();
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') onProgress?.(message.chunk);
      else if (message.type === 'done') finish(() => resolve(message.response));
      else finish(() => reject(new Error(message.message)));
    };
    worker.onerror = (event) => {
      finish(() => reject(new Error(event.message || 'Catch-up worker failed.')));
    };
    worker.postMessage({ type: 'catchup', request });
  });
}
