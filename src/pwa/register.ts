import { registerSW } from 'virtual:pwa-register';

export interface PwaState {
  offlineReady: boolean;
  needRefresh: boolean;
}

type Listener = (state: PwaState) => void;

let state: PwaState = { offlineReady: false, needRefresh: false };
const listeners = new Set<Listener>();
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;
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
  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      emit({ offlineReady: true });
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
  await updateServiceWorker?.(true);
}

export function pwaState(): PwaState {
  return state;
}
