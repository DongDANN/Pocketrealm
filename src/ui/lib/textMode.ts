import { useSyncExternalStore } from 'react';

export type TextMode = 'pixel' | 'system';

const STORAGE_KEY = 'pocketrealm.text';

function read(): TextMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'system' ? 'system' : 'pixel';
  } catch {
    return 'pixel';
  }
}

let mode: TextMode = typeof window === 'undefined' ? 'pixel' : read();
const listeners = new Set<() => void>();

export function getTextMode(): TextMode {
  return mode;
}

export function setTextMode(next: TextMode): void {
  if (next === mode) return;
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this visit when storage is unavailable.
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Global "Readable text" mode: the bitmap face by default, system mono when swapped. */
export function useTextMode(): TextMode {
  return useSyncExternalStore(subscribe, getTextMode, () => 'pixel');
}
