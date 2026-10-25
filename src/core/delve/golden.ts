/**
 * Canonical state hashing for golden-run and fuzz tests (SPEC 6.11 N). Object keys are sorted, so
 * insertion order can never change a hash; non-finite numbers are marked instead of silently
 * becoming null, so a hash comparison also catches NaN drift.
 */

import { hashCombine, hashString } from '../rng';

export function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? `${value}` : `!${String(value)}`;
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'function':
    case 'symbol':
      return '!fn';
    default: {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
    }
  }
}

/** Stable 16-hex digest of any JSON-ish value. Same value, same digest, across runs and seeds. */
export function stateHash(value: unknown): string {
  const text = canonical(value);
  const a = hashString(text);
  const b = hashCombine(a, hashString(`${text.length}:${text.slice(0, 4096)}`));
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}
