/** Deterministic hashing and seeded RNG. No Math.random() anywhere in core. */

export function hashString(input: string): number {
  // FNV-1a 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine two hashes into one 32-bit unsigned value. */
export function hashCombine(a: number, b: number): number {
  let h = a ^ Math.imul(b, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export interface Rng {
  /** Uniform uint32. */
  next(): number;
  /** Uniform integer in [0, bound). */
  int(bound: number): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** Pick one element. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates shuffle of a copy. */
  shuffle<T>(items: readonly T[]): T[];
}

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) >>> 0;
  };
  return {
    next,
    int(bound: number): number {
      if (bound <= 0) throw new Error('RNG bound must be positive');
      return next() % bound;
    },
    float(): number {
      return next() / 0x1_0000_0000;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[next() % items.length]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = next() % (i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/** Deterministic selection of k distinct items from a list for a given seed. */
export function seededPick<T>(seed: number, items: readonly T[], count: number): T[] {
  return mulberry32(seed).shuffle(items).slice(0, count);
}
