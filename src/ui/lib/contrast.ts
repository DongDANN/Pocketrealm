import { useSyncExternalStore } from 'react';

export type ContrastMode = 'normal' | 'high';

const STORAGE_KEY = 'pocketrealm.contrast';

function read(): ContrastMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'high' ? 'high' : 'normal';
  } catch {
    return 'normal';
  }
}

function apply(mode: ContrastMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.contrast = mode;
}

let mode: ContrastMode = typeof window === 'undefined' ? 'normal' : read();
if (typeof window !== 'undefined') apply(mode);
const listeners = new Set<() => void>();

export function getHighContrast(): boolean {
  return mode === 'high';
}

export function setHighContrast(on: boolean): void {
  const next: ContrastMode = on ? 'high' : 'normal';
  if (next === mode) return;
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this visit when storage is unavailable.
  }
  apply(mode);
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The accessibility switch: shell colours and bitmap text both follow it. */
export function useHighContrast(): boolean {
  return useSyncExternalStore(subscribe, getHighContrast, () => false);
}
