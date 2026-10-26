import { registerSW } from 'virtual:pwa-register';
import { PACK_PATIENCE_MS, shouldPrepareOfflinePack } from './offlinePack';

export interface PwaState {
  offlineReady: boolean;
  needRefresh: boolean;
  /** The first offline copy is being written on this visit. */
  preparing: boolean;
  /** The app shell can answer a cold launch offline on this visit. */
  packReady: boolean;
}

type Listener = (state: PwaState) => void;

let state: PwaState = {
  offlineReady: false,
  needRefresh: false,
  preparing: false,
  packReady: false,
};
const listeners = new Set<Listener>();
let initialized = false;

function emit(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener(state);
}

export function subscribePwa(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function initPWA(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;

  const hasController = navigator.serviceWorker.controller !== null;
  if (hasController) emit({ packReady: true });

  if (shouldPrepareOfflinePack({ production: true, hasServiceWorker: true, hasController })) {
    emit({ preparing: true });
    const markReady = () => emit({ preparing: false, packReady: true });
    const stopWaiting = () => {
      if (state.preparing) emit({ preparing: false });
    };
    navigator.serviceWorker.addEventListener('controllerchange', markReady, { once: true });
    window.setTimeout(stopWaiting, PACK_PATIENCE_MS);
  }

  registerSW({
    immediate: true,
    onOfflineReady() {
      emit({ offlineReady: true, preparing: false, packReady: true });
    },
    onNeedRefresh() {
      emit({ needRefresh: true });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Check for updates when the app becomes visible again, at most hourly.
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        const now = Date.now();
        if (now - lastCheck > 60 * 60 * 1000) {
          lastCheck = now;
          void registration.update();
        }
      });
    },
  });
}

export async function reloadForUpdate(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    window.location.reload();
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.waiting) {
    window.location.reload();
    return;
  }

  // The virtual register module only reloads when its own "was already controlled" flag is set.
  // On the first visit the controller arrives by claim, so that flag stays false; a build shipped
  // during that same session would activate the new worker but leave the stale page running.
  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(reload, 4_000);
}

export function pwaState(): PwaState {
  return state;
}
