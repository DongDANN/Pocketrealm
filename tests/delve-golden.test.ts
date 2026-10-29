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
 * Delete that one key and the same five replays returned the Gate 7b-6 digests (83710653…, 7fbf913c…,
 * 317ae9b8…, 5491625f…, fd1fa460…) exactly, and every material pile lands on the same Hollow it was
 * gathered in — which is the proof that no generation, combat or reward number moved.
 *
 * Gate 7c-3 re-recorded them a third time, again only because the shape grew: run end now writes the
 * Dust ladder's bookkeeping into `DelveMeta.skills` (the swing count each skill pays one dust per ten
 * of, plus its remainder) and increments `DelveMeta.dust`. Two independent proofs that nothing else
 * moved: hash the run alone and all five return the values captured *before* the ladder existed
 * (0cb18781…, dd27f7c3…, 635549aee…, 5a0d2a0f…, 93fbd3a3…), and zero the dust and the book back out
 * with `materialsFrom` still deleted and all five return the Gate 7b-6 digests verbatim. Every golden
 * skill sits at LV1, because a golden run never spends the dust it earns, so the +8%-per-rung potency
 * multiplier is never applied and the damage sums are the same numbers they were before the ladder.
 *
 * Gate 7d re-recorded all five because the descent itself moved on purpose, not the shape: every
 * floor now carries one of ten rules (§8 E.1) that changes what the fight will honour — energy costs,
 * guard reflection, inverted elements, critical healing, shop prices, rest, drops, the boon pool,
 * spawn stats, Mark duration, or who may be targeted — and every boss phase now adds a named
 * behaviour (§8 E.2) instead of a damage multiplier. Rules are drawn from their own RNG stream, so
 * floor layouts sit exactly where they did in 7c; the replays diverge because the fights and the
 * rooms around them are priced differently. The auxiliary hashes keep their old jobs: one proves the
 * run knows nothing of the meta it earned, the other proves the Dust ladder and the provenance
 * ledger are the only meta fields excluded from it.
 *
 * Gate 7e re-recorded all five for both reasons at once. The hashed shape grew by `skipRewardsLeft`,
 * and the money moved because a floor now pays 8% interest on the Glint held while it was walked
 * (§9), credited at its end; the treasure cache also pauses to ask take-or-skip, though the Glint it
 * pays and its runId-keyed boon roll are unchanged. A headless replay never skips, so no golden
 * carries a boost — the skip's ×1.8 is pinned separately in tests/delve-patience.test.ts, and the
 * difference between the 7d and 7e digests is interest plus the one new key.
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
  /** The same replay with `materialsFrom` and the whole Dust ladder taken back out of the meta. */
  hashBeforeLadder: string;
  /** The replay with the meta excluded entirely: the run's own book, independent of what it earned. */
  runHash: string;
}

const CASES: GoldenCase[] = [
  {
    label: 'H1 seed 12345',
    seed: 12345,
    hollow: 1,
    level: 5,
    hash: 'c6e7c4907d92278c',
    hashBeforeLadder: '2fbf210c5dc4ddec',
    runHash: 'b66f6365bd5cf1a2',
  },
  {
    label: 'H2 golden-ratio seed',
    seed: 0x9e3779b1,
    hollow: 2,
    level: 6,
    hash: '1c2203bf0ccee3a8',
    hashBeforeLadder: 'b1a7c9dd2fce8850',
    runHash: '7a869dd2abd69ce2',
  },
  {
    label: 'H3 seed 777',
    seed: 777,
    hollow: 3,
    level: 8,
    hash: '2e98f7ab412af353',
    hashBeforeLadder: 'ecf3f0f23678821c',
    runHash: '44bed27cc8d79f76',
  },
  {
    label: 'H2 seed 4242',
    seed: 4242,
    hollow: 2,
    level: 9,
    hash: 'd1592d4da94beaed',
    hashBeforeLadder: 'd64b2e4e0d093f30',
    runHash: '430ec30780e72490',
  },
  {
    label: 'H3 seed 20261025',
    seed: 20261025,
    hollow: 3,
    level: 12,
    hash: 'bd283277d68347c1',
    hashBeforeLadder: 'bdd30a8a2515507a',
    runHash: '0e7daa70e285b590',
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

  it('hashes the run without the meta it earned', () => {
    for (const c of CASES) {
      const { run } = stateOf(c);
      expect(stateHash({ run: { ...run, log: [] } }), c.label).toBe(c.runHash);
    }
  });

  it('hashes the meta with the Dust ladder and provenance ledger taken back out', () => {
    for (const c of CASES) {
      const { run, meta } = stateOf(c);
      const beforeLadder = { ...meta, dust: 0, skills: {} };
      delete beforeLadder.materialsFrom;
      expect(stateHash({ run: { ...run, log: [] }, meta: beforeLadder }), c.label).toBe(
        c.hashBeforeLadder,
      );
    }
  });

  it('earns dust from swings but never spends it, so no golden hit is potentied', () => {
    for (const c of CASES) {
      const { meta } = stateOf(c);
      for (const [id, skill] of Object.entries(meta.skills)) {
        expect(skill.level, `${c.label} ${id}`).toBe(1);
      }
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
