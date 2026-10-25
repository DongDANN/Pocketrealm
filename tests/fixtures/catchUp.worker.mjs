/**
 * Worker-thread fixture for tests/delve-worker.test.ts. It registers the same TypeScript loader
 * the parent uses, imports the pure Delve core, and runs the identical `runCatchUpJob` the app's
 * module Web Worker runs — so the test can compare a real worker against the main thread.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { register } from 'tsx/esm/api';

const stop = register();
const { runCatchUpJob, stateHash } = await import('../../src/core/delve/index.ts');

const started = performance.now();
const out = runCatchUpJob(workerData);
const ms = performance.now() - started;
stop?.();

parentPort.postMessage({ result: out.result, logs: out.logs, hash: stateHash(out.result), ms });
