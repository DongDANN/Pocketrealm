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
 * now end fainted, because the headless decider never braces — bracing is the player's call. The
 * golden pins that ending, and 7c/7f own making a player better at avoiding it.
 *
 * Gate 7c-2 re-recorded all five for the same reason 7b-1 did: the hashed shape grew. `DelveMeta`
 * gained `materialsFrom`, the per-Hollow provenance ledger a capsule's tier ceiling reads (§7 D.3).
 * Delete that one key and the same five replays return the Gate 7b-6 digests (83710653…, 7fbf913c…,
 * 317ae9b8…, 5491625f…, fd1fa460…) exactly, and every material pile lands on the same Hollow it was
 * gathered in — which is the proof that no generation, combat or reward number moved.
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
  /** The same replay with `materialsFrom` stripped out of the meta (Gate 7b-6's shape). */
  hashWithoutLedger: string;
}

const CASES: GoldenCase[] = [
  {
    label: 'H1 seed 12345',
    seed: 12345,
    hollow: 1,
    level: 5,
    hash: 'c39220a1d5e4b7f8',
    hashWithoutLedger: '837106532b87b6aa',
  },
  {
    label: 'H2 golden-ratio seed',
    seed: 0x9e3779b1,
    hollow: 2,
    level: 6,
    hash: '54436a238366b9d7',
    hashWithoutLedger: '7fbf913c7da7c523',
  },
  {
    label: 'H3 seed 777',
    seed: 777,
    hollow: 3,
    level: 8,
    hash: 'e81b2310ed671b71',
    hashWithoutLedger: '317ae9b8898d8b8b',
  },
  {
    label: 'H2 seed 4242',
    seed: 4242,
    hollow: 2,
    level: 9,
    hash: '9850885dc742970e',
    hashWithoutLedger: '5491625f617eb6e9',
  },
  {
    label: 'H3 seed 20261025',
    seed: 20261025,
    hollow: 3,
    level: 12,
    hash: '1b2f147fca52d3ac',
    hashWithoutLedger: 'fd1fa46095a964c5',
  },
];

function stateOf(c: Pick<GoldenCase, 'seed' | 'hollow' | 'level'>) {
  return playToEnd(c.seed, c.hollow, c.level);
}

function hashOf(c: Pick<GoldenCase, 'seed' | 'hollow' | 'level'>): string {
  const { run, meta } = stateOf(c);
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

  it('moved only because the provenance ledger joined the shape', () => {
    for (const c of CASES) {
      const { run, meta } = stateOf(c);
      const beforeLedger = { ...meta };
      delete beforeLedger.materialsFrom;
      expect(stateHash({ run: { ...run, log: [] }, meta: beforeLedger }), c.label).toBe(
        c.hashWithoutLedger,
      );
    }
  });

  it('banks each pile under the Hollow the run walked, and mints none of its own', () => {
    for (const c of CASES) {
      const { run, meta } = stateOf(c);
      expect(meta.materials, c.label).toEqual(run.materials);
      const ledger = meta.materialsFrom!;
      for (const id of [1, 2, 3] as HollowId[]) {
        if (id !== run.hollowId) expect(ledger[id]).toEqual({ ore: 0, herb: 0, echo: 0 });
      }
    }
  });
});
