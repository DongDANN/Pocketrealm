/**
 * Gate 1.6f — golden runs (SPEC 6.11 N). A canonical state hash pins five fixed scenarios: the
 * same seed must always replay to the same hash, the hash must ignore key insertion order, and the
 * pinned values catch any accidental change to generation, combat, or reward math. Logs are
 * stripped from the hash so rewording a line cannot rot a golden.
 *
 * Gate 7b-1 re-recorded all five because the hashed *shape* grew: `RunState` gained `orders`,
 * `floorRule` and `skipOutstanding`, and `DelveMeta` gained the collection fields. Delete those
 * eleven keys and the same five replays return the Gate 7a digests (9d19056d…, b118ad62…, 78fab713…,
 * ad6e6ddd…, 96d2bfc2…) exactly, which is the proof that no generation, combat or reward number
 * moved.
 *
 * Gate 7b-6 re-recorded them again, and this time the model moved with them: the cut deleted `cards`
 * and `policy` from the run and the meta, a fight room now stores the orders its player gave it, oil
 * buys the descent instead of each room, a boon offer no longer holds a run in the room it already
 * answered, and a shop with a full boon shelf no longer offers one it cannot sell. All five replays
 * now end fainted, which is what the headless decider does when no order of its ever says `guard` —
 * the golden pins that, and 7c/7f own making a player better at it.
 */

import { describe, expect, it } from 'vitest';
import { stateHash, type HollowId } from '../src/core/delve';
import { playToEnd } from './delve-helpers';

interface GoldenCase {
  label: string;
  seed: number;
  hollow: HollowId;
  level: number;
  /** Recorded from the engine; re-record deliberately when balance intentionally moves. */
  hash: string;
}

const CASES: GoldenCase[] = [
  { label: 'H1 seed 12345', seed: 12345, hollow: 1, level: 5, hash: '837106532b87b6aa' },
  {
    label: 'H2 golden-ratio seed',
    seed: 0x9e3779b1,
    hollow: 2,
    level: 6,
    hash: '7fbf913c7da7c523',
  },
  { label: 'H3 seed 777', seed: 777, hollow: 3, level: 8, hash: '317ae9b8898d8b8b' },
  { label: 'H2 seed 4242', seed: 4242, hollow: 2, level: 9, hash: '5491625f617eb6e9' },
  { label: 'H3 seed 20261025', seed: 20261025, hollow: 3, level: 12, hash: 'fd1fa46095a964c5' },
];

function hashOf(c: Pick<GoldenCase, 'seed' | 'hollow' | 'level'>): string {
  const { run, meta } = playToEnd(c.seed, c.hollow, c.level);
  return stateHash({ run: { ...run, log: [] }, meta });
}

describe('state hash', () => {
  it('is independent of key insertion order', () => {
    expect(stateHash({ a: 1, b: { c: 2, d: 3 } })).toBe(stateHash({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it('changes when any value changes', () => {
    const base = stateHash({ a: 1, b: 'two', c: [3, 4] });
    expect(stateHash({ a: 2, b: 'two', c: [3, 4] })).not.toBe(base);
    expect(stateHash({ a: 1, b: 'three', c: [3, 4] })).not.toBe(base);
    expect(stateHash({ a: 1, b: 'two', c: [3, 5] })).not.toBe(base);
  });

  it('hashes arrays, null, and non-finite numbers stably', () => {
    expect(stateHash([1, 2, 3])).toBe(stateHash([1, 2, 3]));
    expect(stateHash([1, 2, 3])).not.toBe(stateHash([3, 2, 1]));
    expect(stateHash(null)).toBe(stateHash(null));
    expect(stateHash(null)).not.toBe(stateHash({}));
    expect(stateHash(NaN)).not.toBe(stateHash(null));
    expect(stateHash(Infinity)).not.toBe(stateHash(NaN));
  });
});

describe('golden runs', () => {
  it('replay identically for the same seed', () => {
    for (const c of CASES) expect(hashOf(c)).toBe(hashOf(c));
  });

  it('pin the five fixed scenarios', () => {
    for (const c of CASES) expect(hashOf(c), c.label).toBe(c.hash);
  });
});
