/**
 * Module Web Worker for Delve catch-up (SPEC 6.11 M). It owns no state: one request in, one
 * response out, plus a progress message per chunk. The simulation itself lives in
 * `core/delve/workerJob`, so Node tests exercise exactly the bytes this worker runs.
 */

import {
  runCatchUpJob,
  type CatchUpJobRequest,
  type CatchUpJobResponse,
  type CatchUpResult,
} from '../../core/delve';

type WorkerRequest = { type: 'catchup'; request: CatchUpJobRequest };

type WorkerResponse =
  | { type: 'progress'; chunk: CatchUpResult }
  | { type: 'done'; response: CatchUpJobResponse }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message?.type !== 'catchup') return;
  const post = (payload: WorkerResponse) => scope.postMessage(payload);
  try {
    const response = runCatchUpJob(message.request, (chunk) => post({ type: 'progress', chunk }));
    post({ type: 'done', response });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
