import { useSyncExternalStore } from 'react';

/**
 * One place for the short messages a screen shows after an action: a reward, a refusal that explains
 * itself, a saved export. Kept outside React so a write path can announce something without threading
 * a callback through the tree, and so the store is testable without a DOM.
 */

export type ToastTone = 'neutral' | 'reward' | 'warn';

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface ToastStore {
  /** Stable snapshot: the same array reference until the list changes. */
  get(): readonly Toast[];
  subscribe(onChange: () => void): () => void;
  push(text: string, options?: { tone?: ToastTone; ms?: number }): Toast;
  dismiss(id: number): void;
  clear(): void;
}

export interface ToastStoreOptions {
  /** Returns a cancel function, so a dismissed toast never fires later. */
  schedule(fn: () => void, ms: number): () => void;
}

/** A fourth toast is a wall of text; the newest is the one that matters. */
const MAX_VISIBLE = 3;
const DEFAULT_MS = 3_200;

let nextId = 1;

export function makeToastStore(options: ToastStoreOptions): ToastStore {
  let items: Toast[] = [];
  let snapshot: readonly Toast[] = Object.freeze([] as Toast[]);
  const timers = new Map<number, () => void>();
  const listeners = new Set<() => void>();

  const publish = () => {
    snapshot = Object.freeze([...items]);
    for (const listener of [...listeners]) listener();
  };

  const arm = (id: number, ms: number) => {
    const cancel = options.schedule(() => {
      timers.delete(id);
      items = items.filter((item) => item.id !== id);
      publish();
    }, ms);
    timers.set(id, cancel);
  };

  const drop = (id: number) => {
    timers.get(id)?.();
    timers.delete(id);
    items = items.filter((item) => item.id !== id);
  };

  return {
    get: () => snapshot,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    push(text, pushOptions) {
      const last = items[items.length - 1];
      if (last && last.text === text) drop(last.id);
      const toast: Toast = { id: nextId++, text, tone: pushOptions?.tone ?? 'neutral' };
      const next = [...items, toast];
      const overflow = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
      items = next.slice(-MAX_VISIBLE);
      publish();
      arm(toast.id, pushOptions?.ms ?? DEFAULT_MS);
      for (const old of overflow) drop(old.id);
      return toast;
    },
    dismiss(id) {
      if (!items.some((item) => item.id === id)) return;
      drop(id);
      publish();
    },
    clear() {
      if (items.length === 0) return;
      for (const item of [...items]) drop(item.id);
      publish();
    },
  };
}

/** The app store, with the real timer injected here rather than in a component. */
export const toasts: ToastStore = makeToastStore({
  schedule(fn, ms) {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
});

/** Announce something from anywhere, including outside React. */
export function say(text: string, tone: ToastTone = 'neutral'): Toast {
  return toasts.push(text, { tone });
}

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(toasts.subscribe, toasts.get, toasts.get);
}
