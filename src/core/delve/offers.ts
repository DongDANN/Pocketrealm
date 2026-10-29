/**
 * Boon offers. Deterministic: same run state, same seed, same offer. The player picks from the
 * offer; nothing here chooses for them.
 */

import { hashCombine, hashString, mulberry32, type Rng } from '../rng';
import { BOONS, MAX_BOON_LEVEL, RARITY_WEIGHT, type BoonLike } from './data/boons';
import { FUSIONS, anyBoonById } from './data/fusions';
import type { BoonTag, RunState, Rarity } from './types';

export function offerRng(run: RunState, salt: string): Rng {
  return mulberry32(hashCombine(hashString(run.runId), hashString(salt)));
}

/** Most-held tag; ties break by seeded pick. Defaults to a seeded tag when none are held. */
export function topTag(run: RunState): BoonTag {
  const counts = new Map<BoonTag, number>();
  for (const id of run.boons) {
    const b = anyBoonById(id);
    if (!b) continue;
    counts.set(b.tag, (counts.get(b.tag) ?? 0) + 1);
  }
  const best = Math.max(0, ...counts.values());
  const candidates = (['guard', 'fury', 'fortune', 'vigor', 'thrift'] as BoonTag[]).filter(
    (t) => (counts.get(t) ?? 0) === best,
  );
  return candidates[offerRng(run, 'top-tag').int(candidates.length)]!;
}

const RARITY_UP: Record<Rarity, Rarity> = {
  common: 'uncommon',
  uncommon: 'rare',
  rare: 'epic',
  epic: 'epic',
  mythic: 'mythic',
};

function effectiveRarity(run: RunState, b: BoonLike): Rarity {
  return run.relics.includes('relic-inkwell') ? RARITY_UP[b.rarity] : b.rarity;
}

/**
 * Weighted, distinct offer of `count` boons. Tag affinity boosts weights for tags already held;
 * bad-luck protection forces a top-tag boon in when two consecutive offers missed it. Held boons
 * below max level stay in the pool (level-up offers); maxed boons never appear. `salt` varies the
 * draw (used by Forge rerolls); the default salt keys off the step index. `allow` narrows the pool
 * further — a floor rule can forbid a boon, and the offer has to respect the ban rather than price
 * something the run cannot take.
 */
export function buildBoonOffer(
  run: RunState,
  count: number,
  salt?: string,
  allow?: (boon: BoonLike) => boolean,
): { offer: BoonLike[]; offerStreak: number } {
  const rng = offerRng(run, salt ?? `offer-${run.stepIndex}`);
  const pool: BoonLike[] = [...BOONS, ...FUSIONS].filter((b) => {
    if (allow && !allow(b)) return false;
    if (!run.boons.includes(b.id)) return true;
    return (run.boonLevels[b.id] ?? 0) < MAX_BOON_LEVEL;
  });
  if (pool.length === 0) return { offer: [], offerStreak: run.offerStreak };
  const tagCounts = new Map<BoonTag, number>();
  for (const id of run.boons) {
    const b = anyBoonById(id);
    if (b) tagCounts.set(b.tag, (tagCounts.get(b.tag) ?? 0) + 1);
  }
  const pick = (forcedTag?: BoonTag): BoonLike => {
    const candidates = forcedTag ? pool.filter((b) => b.tag === forcedTag) : pool;
    const list = candidates.length > 0 ? candidates : pool;
    let total = 0;
    const weights = list.map((b) => {
      const w = RARITY_WEIGHT[effectiveRarity(run, b)] * (1 + (tagCounts.get(b.tag) ?? 0) * 0.5);
      total += w;
      return w;
    });
    let roll = rng.int(Math.max(1, Math.round(total)));
    for (let i = 0; i < list.length; i++) {
      if (roll < weights[i]!) return list[i]!;
      roll -= weights[i]!;
    }
    return list[list.length - 1]!;
  };

  const chosen: BoonLike[] = [];
  const top = topTag(run);
  if (run.offerStreak >= 2) chosen.push(pick(top));
  while (chosen.length < Math.min(count, pool.length)) {
    const next = pick();
    if (!chosen.includes(next)) chosen.push(next);
  }
  const hasTop = chosen.some((b) => b.tag === top);
  return { offer: chosen, offerStreak: hasTop ? 0 : run.offerStreak + 1 };
}
