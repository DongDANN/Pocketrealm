import { describe, expect, it } from 'vitest';
import { makeToastStore } from '../src/ui/lib/toast';

/**
 * A store whose expiry timers only fire when the test fires them, so no test waits on a real clock
 * and the cancel path is observable through `live()`.
 */
function harness() {
  const fired: Array<() => void> = [];
  const store = makeToastStore({
    schedule(fn) {
      fired.push(fn);
      return () => {
        const index = fired.indexOf(fn);
        if (index >= 0) fired.splice(index, 1);
      };
    },
  });
  return {
    store,
    live: () => fired.length,
    fire(index: number) {
      const fn = fired[index];
      if (!fn) throw new Error(`No timer at ${index}`);
      fired.splice(index, 1);
      fn();
    },
  };
}

describe('toast store', () => {
  it('starts empty', () => {
    const { store } = harness();
    expect(store.get()).toEqual([]);
  });

  it('shows a pushed message with a neutral tone by default', () => {
    const { store } = harness();
    store.push('Saved');
    expect(store.get().map((t) => t.text)).toEqual(['Saved']);
    expect(store.get()[0]!.tone).toBe('neutral');
  });

  it('returns the same snapshot object until something changes', () => {
    const { store } = harness();
    store.push('Saved');
    const first = store.get();
    expect(store.get()).toBe(first);
    store.push('Again');
    expect(store.get()).not.toBe(first);
  });

  it('notifies subscribers only when the list actually changes', () => {
    const { store } = harness();
    let seen = 0;
    store.subscribe(() => {
      seen++;
    });
    store.push('Saved');
    store.push('Logged');
    expect(seen).toBe(2);
  });

  it('expires a toast when its timer fires, leaving the others alone', () => {
    const { store, fire } = harness();
    store.push('First');
    store.push('Second');
    fire(0);
    expect(store.get().map((t) => t.text)).toEqual(['Second']);
  });

  it('cancels the timer when a toast is dismissed', () => {
    const { store, live } = harness();
    const a = store.push('First');
    store.push('Second');
    expect(live()).toBe(2);
    store.dismiss(a.id);
    expect(store.get().map((t) => t.text)).toEqual(['Second']);
    expect(live()).toBe(1);
  });

  it('keeps only the newest few toasts', () => {
    const { store, live } = harness();
    for (const text of ['a', 'b', 'c', 'd', 'e']) store.push(text);
    expect(store.get().map((t) => t.text)).toEqual(['c', 'd', 'e']);
    expect(live()).toBe(3);
  });

  it('carries a tone so a reward reads differently from a warning', () => {
    const { store } = harness();
    store.push('Overspent', { tone: 'warn' });
    store.push('+10 XP', { tone: 'reward' });
    expect(store.get().map((t) => t.tone)).toEqual(['warn', 'reward']);
  });

  it('replaces a repeated message instead of stacking identical toasts', () => {
    const { store, live } = harness();
    store.push('Saved');
    store.push('Saved');
    expect(store.get().map((t) => t.text)).toEqual(['Saved']);
    expect(live()).toBe(1);
  });

  it('unsubscribes', () => {
    const { store } = harness();
    let seen = 0;
    const off = store.subscribe(() => {
      seen++;
    });
    store.push('Saved');
    off();
    store.push('Again');
    expect(seen).toBe(1);
  });
});
