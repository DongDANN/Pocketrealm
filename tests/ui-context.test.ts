import { describe, expect, it } from 'vitest';
import { dateOf } from '../src/core/dates';
import { makeWriteContext, randomId, systemClock } from '../src/ui/lib/systemContext';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('production clock', () => {
  it('reports the local calendar date, not the UTC one', () => {
    const clock = systemClock();
    expect(clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(clock.today()).toBe(dateOf(clock.now()));
  });

  it('moves forward in real time', () => {
    const clock = systemClock();
    expect(clock.now()).toBeGreaterThan(1_700_000_000_000);
  });
});

describe('id generator', () => {
  it('makes uuid-shaped ids', () => {
    expect(randomId()).toMatch(UUID_V4);
  });

  it('never repeats', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 2_000; i++) ids.add(randomId());
    expect(ids.size).toBe(2_000);
  });

  it('still works where crypto.randomUUID is missing', () => {
    const crypto = globalThis.crypto as Crypto | undefined;
    const saved = crypto?.randomUUID;
    if (crypto)
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(randomId()).toMatch(UUID_V4);
    } finally {
      if (crypto && saved) {
        Object.defineProperty(crypto, 'randomUUID', { value: saved, configurable: true });
      }
    }
  });
});

describe('write context', () => {
  it('carries a clock and a fresh id per call', () => {
    const ctx = makeWriteContext();
    expect(ctx.clock.today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ctx.newId()).not.toBe(ctx.newId());
  });

  it('accepts an injected clock so a test can freeze the day', () => {
    const ctx = makeWriteContext({ now: () => 0, today: () => '2026-01-01' });
    expect(ctx.clock.today()).toBe('2026-01-01');
  });
});
