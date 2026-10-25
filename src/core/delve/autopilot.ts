/**
 * Boon offer algorithm and Autopilot decisions. Both are fully deterministic: same run state,
 * same seed, same policy ⇒ same choices. Every Autopilot choice is logged with its reason.
 */

import { hashCombine, hashString, mulberry32, type Rng } from '../rng';
import { BOONS, RARITY_WEIGHT, boonById, type Boon } from './data/boons';
import type { AutopilotPolicy, BoonTag, PendingChoice, RoomDef, RunState, Rarity } from './types';

export function offerRng(run: RunState, salt: string): Rng {
  return mulberry32(hashCombine(hashString(run.runId), hashString(salt)));
}

/** Most-held tag; ties break by seeded pick. Defaults to a seeded tag when none are held. */
export function topTag(run: RunState): BoonTag {
  const counts = new Map<BoonTag, number>();
  for (const id of run.boons) {
    const b = boonById(id);
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
};

function effectiveRarity(run: RunState, b: Boon): Rarity {
  return run.relics.includes('relic-inkwell') ? RARITY_UP[b.rarity] : b.rarity;
}

/**
 * Weighted, distinct offer of `count` boons. Tag affinity boosts weights for tags already held;
 * bad-luck protection forces a top-tag boon in when two consecutive offers missed it.
 */
export function buildBoonOffer(
  run: RunState,
  count: number,
): { offer: Boon[]; offerStreak: number } {
  const rng = offerRng(run, `offer-${run.stepIndex}`);
  const held = new Set(run.boons);
  const pool = BOONS.filter((b) => !held.has(b.id));
  const tagCounts = new Map<BoonTag, number>();
  for (const id of run.boons) {
    const b = boonById(id);
    if (b) tagCounts.set(b.tag, (tagCounts.get(b.tag) ?? 0) + 1);
  }
  const pick = (forcedTag?: BoonTag): Boon => {
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

  const chosen: Boon[] = [];
  const top = topTag(run);
  if (run.offerStreak >= 2) chosen.push(pick(top));
  while (chosen.length < count) {
    const next = pick();
    if (!chosen.includes(next)) chosen.push(next);
  }
  const hasTop = chosen.some((b) => b.tag === top);
  return { offer: chosen, offerStreak: hasTop ? 0 : run.offerStreak + 1 };
}

/** Autopilot picks a boon: first tag in the priority list that is offered, else highest rarity. */
export function autopilotBoon(
  policy: AutopilotPolicy,
  offer: readonly Boon[],
): { boon: Boon; reason: string } {
  for (const tag of policy.tagPriority) {
    const match = offer.find((b) => b.tag === tag);
    if (match)
      return { boon: match, reason: `Autopilot: picked ${match.name} (top priority tag ${tag}).` };
  }
  const rarityOrder: Rarity[] = ['epic', 'rare', 'uncommon', 'common'];
  const best = [...offer].sort(
    (a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity),
  )[0]!;
  return {
    boon: best,
    reason: `Autopilot: no priority tag offered; picked highest rarity (${best.name}).`,
  };
}

const ROUTE_ORDER: Record<AutopilotPolicy['route'], string[]> = {
  safe: ['rest', 'shop', 'event', 'treasure', 'skirmish', 'elite'],
  greedy: ['elite', 'treasure', 'event', 'shop', 'skirmish', 'rest'],
  balanced: ['treasure', 'skirmish', 'rest', 'event', 'shop', 'elite'],
};

/** Autopilot picks a fork room by route preference. */
export function autopilotFork(
  run: RunState,
  policy: AutopilotPolicy,
  rooms: readonly RoomDef[],
): { room: RoomDef; reason: string } {
  if (policy.route === 'balanced') {
    const rng = offerRng(run, `fork-${run.stepIndex}`);
    const hpRatio = run.unit.hp / run.unit.maxHp;
    let candidates = rooms;
    let caution = '';
    if (hpRatio < 0.35 && rooms.some((r) => r.kind === 'rest')) {
      candidates = rooms.filter((r) => r.kind === 'rest');
      caution = `HP at ${Math.round(hpRatio * 100)}%, seeking rest. `;
    } else if (hpRatio < 0.65 && rooms.some((r) => r.kind !== 'elite')) {
      candidates = rooms.filter((r) => r.kind !== 'elite');
      caution = `HP at ${Math.round(hpRatio * 100)}%, avoiding elites. `;
    }
    const room = candidates[rng.int(candidates.length)]!;
    return { room, reason: `${caution}Autopilot: balanced route picked ${room.kind} by seed.` };
  }
  const order = ROUTE_ORDER[policy.route];
  const best = [...rooms].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0]!;
  return { room: best, reason: `Autopilot: ${policy.route} route prefers ${best.kind}.` };
}

/** Autopilot event decision: safe route takes the first option, greedy the last, balanced seeds. */
export function autopilotEvent(
  run: RunState,
  policy: AutopilotPolicy,
  choice: Pick<PendingChoice, 'options'>,
): { optionId: string; reason: string } {
  const options = choice.options;
  let optionId: string;
  if (policy.route === 'safe') {
    optionId = options[0]!.id;
    return { optionId, reason: `Autopilot: safe route took "${options[0]!.label}".` };
  }
  if (policy.route === 'greedy') {
    optionId = options[options.length - 1]!.id;
    return {
      optionId,
      reason: `Autopilot: greedy route took "${options[options.length - 1]!.label}".`,
    };
  }
  const pick = options[offerRng(run, `event-${run.stepIndex}`).int(options.length)]!;
  return { optionId: pick.id, reason: `Autopilot: balanced route rolled "${pick.label}".` };
}
