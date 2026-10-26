import { useState, useSyncExternalStore } from 'react';
import { isIos, isStandalone } from '../../pwa/display';

/** Chrome/Edge/Android expose this; Safari does not, hence the manual instructions. */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallChoice = 'accepted' | 'dismissed' | 'unavailable';

const DISMISS_KEY = 'pocketrealm.installCard';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

let dismissed = typeof window === 'undefined' ? false : readDismissed();
const dismissalListeners = new Set<() => void>();

function subscribeDismissal(listener: () => void): () => void {
  dismissalListeners.add(listener);
  return () => dismissalListeners.delete(listener);
}

function dismissCard(): void {
  if (dismissed) return;
  dismissed = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // The card still stays closed for this visit when storage is unavailable.
  }
  for (const listener of [...dismissalListeners]) listener();
}

let deferred: InstallEvent | null = null;
let snap = { available: false, installed: typeof window === 'undefined' ? false : isStandalone() };
const listeners = new Set<() => void>();

function publish(): void {
  snap = { available: deferred !== null, installed: snap.installed };
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Captured at module load, not when Today happens to mount: the one prompt a browser gives can
// arrive during onboarding, and a user who walks to another screen must not lose the card.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (raw) => {
    raw.preventDefault();
    deferred = raw as InstallEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    snap = { available: false, installed: true };
    for (const listener of [...listeners]) listener();
  });
}

async function promptInstall(): Promise<InstallChoice> {
  const captured = deferred;
  if (!captured) return 'unavailable';
  await captured.prompt();
  const choice = await captured.userChoice;
  deferred = null;
  publish();
  if (choice.outcome === 'dismissed') dismissCard();
  return choice.outcome;
}

/**
 * The install surface. Both Today and Settings read the same captured event, so installing from
 * either place closes the other. A dismissal is remembered for good; Settings keeps a way back.
 */
export function useInstallPrompt(): {
  available: boolean;
  ios: boolean;
  installed: boolean;
  dismissed: boolean;
  prompt: () => Promise<InstallChoice>;
  dismiss: () => void;
} {
  const state = useSyncExternalStore(
    subscribe,
    () => snap,
    () => snap,
  );
  const [ios] = useState(isIos);
  const dismissedNow = useSyncExternalStore(
    subscribeDismissal,
    () => dismissed,
    () => false,
  );

  return {
    available: state.available,
    ios,
    installed: state.installed,
    dismissed: dismissedNow,
    prompt: promptInstall,
    dismiss: dismissCard,
  };
}
