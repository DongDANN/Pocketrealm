import { dateOf } from '../../core/dates';
import type { Clock } from '../../core/types';
import type { WriteContext } from '../../data/repos';

/**
 * The two things the pure core refuses to reach for itself: the wall clock and a fresh id. Everything
 * below this layer receives them, so a test can freeze a day or pin a seed and the browser code stays
 * honest about what it borrowed.
 */

export function systemClock(): Clock {
  return {
    now: () => Date.now(),
    today: () => dateOf(Date.now()),
  };
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** v4-shaped id: `crypto.randomUUID` where the browser offers it, an equivalent fallback where not. */
export function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function makeWriteContext(clock: Clock = systemClock()): WriteContext {
  return { clock, newId: randomId };
}
