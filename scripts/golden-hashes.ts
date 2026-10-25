/**
 * Print the golden-run state hashes pinned by tests/delve-golden.test.ts. Re-run this and update
 * the CASES table only when a balance change was intentional.
 *
 * Usage: npm run sim:golden
 */

import { stateHash, type HollowId } from '../src/core/delve';
import { playToEnd } from '../tests/delve-helpers';

const CASES: { seed: number; hollow: HollowId; level: number }[] = [
  { seed: 12345, hollow: 1, level: 5 },
  { seed: 0x9e3779b1, hollow: 2, level: 6 },
  { seed: 777, hollow: 3, level: 8 },
  { seed: 4242, hollow: 2, level: 9 },
  { seed: 20261025, hollow: 3, level: 12 },
];

for (const c of CASES) {
  const { run, meta } = playToEnd(c.seed, c.hollow, c.level);
  console.log(
    `seed ${c.seed} hollow ${c.hollow} level ${c.level} -> ${stateHash({ run: { ...run, log: [] }, meta })} (${run.result}, floor ${run.floor}, step ${run.stepIndex})`,
  );
}
