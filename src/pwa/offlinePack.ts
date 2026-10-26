/**
 * First run downloads the whole app before the service worker can answer a cold launch offline.
 * The strip is shown only for that first copy: a dev build, a browser with no service worker, or a
 * tab that already has a controller has nothing to wait for.
 */
export function shouldPrepareOfflinePack(input: {
  production: boolean;
  hasServiceWorker: boolean;
  hasController: boolean;
}): boolean {
  return input.production && input.hasServiceWorker && !input.hasController;
}

/** A failed registration must not leave a permanent strip; the frame is already usable. */
export const PACK_PATIENCE_MS = 30_000;
