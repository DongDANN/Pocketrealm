/**
 * Capsules (DELVE_REDESIGN §7 D.3–D.5) — the only way a skill enters the collection.
 *
 * The chain is run → materials → a capsule crafted in the Workshop → the player chooses when to open
 * it. Nothing here is time-gated: a capsule stays in inventory forever, costs materials alone (never
 * Embers, so the Forge tree keeps a single uncontested sink, and never money), and pays out when the
 * player decides to look.
 *
 * Three rules shape every draw, and all three are printed on the capsule before it is opened (§7 D.4):
 * no dud (never a Common from a capsule), hard pity (an Epic or better after ten that missed), and
 * relevance (one of any three matches the tag or element the player uses most). The first is a floor
 * on the tier band, the second overrides the roll, the third chooses within the tier the roll landed on
 * — which is why `capsuleOdds` is computed from the same code that draws rather than written beside it.
 */

import { hashCombine, hashString, mulberry32, type Rng } from '../rng';
import { BOON_TAGS } from './data/boons';
import { SKILLS, skillById, type CatalogueSkill } from './data/skills';
import type { Element } from './data/elements';
import { deepestPayee, spendMaterials } from './materials';
import type {
  BoonTag,
  CapsuleCeiling,
  CapsuleReveal,
  DelveMeta,
  HollowId,
  Materials,
  Rarity,
} from './types';

/** §7 D.3: materials only, fixed, and no Ember cost anywhere in the chain. */
export const CAPSULE_COST: Materials = { ore: 2, herb: 1, echo: 0 };

/** §7 D.3: the deepest Hollow that paid sets the best tier the capsule can hold. */
export const CAPSULE_CEILING: Record<HollowId, CapsuleCeiling> = {
  1: 'rare',
  2: 'epic',
  3: 'mythic',
};

/**
 * §7 D.3's bands, lifted by §7 D.4 layer 1. A Hollow 1 capsule would reach down to Common, but the
 * no-dud guarantee lifts the floor to Uncommon, so Common is not a capsule prize at all: the twenty-two
 * Commons are what a companion knows before it owns anything (§7 D.2, wired with the moveset in 7c-4).
 */
export const CEILING_BAND: Record<CapsuleCeiling, readonly Rarity[]> = {
  rare: ['uncommon', 'rare'],
  epic: ['uncommon', 'rare', 'epic'],
  mythic: ['rare', 'epic', 'mythic'],
};

/** §7 D.1's base weights, renormalised inside a band by `capsuleOdds`. */
export const TIER_WEIGHT: Record<Rarity, number> = {
  common: 45,
  uncommon: 28,
  rare: 16,
  epic: 8,
  mythic: 3,
};

/** §7 D.6: what a duplicate is worth the moment it is drawn. */
export const DUST_BY_RARITY: Record<Rarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 8,
  epic: 20,
  mythic: 50,
};

/** §7 D.4 layer 2: capsules without an Epic+ before one is guaranteed. */
export const HARD_PITY = 10;
/** §7 D.4 layer 3: one of any three capsules must match what the player actually uses. */
export const RELEVANCE_WINDOW = 3;

const CEILINGS: readonly CapsuleCeiling[] = ['rare', 'epic', 'mythic'];

export function isCapsuleCeiling(value: string): value is CapsuleCeiling {
  return (CEILINGS as readonly string[]).includes(value);
}

/** Capsules held, by ceiling. An unknown key reads as empty rather than throwing on a stored row. */
export function capsulesHeld(meta: DelveMeta): Record<CapsuleCeiling, number> {
  const held: Record<CapsuleCeiling, number> = { rare: 0, epic: 0, mythic: 0 };
  for (const [key, count] of Object.entries(meta.capsules ?? {})) {
    if (isCapsuleCeiling(key) && count > 0) held[key] = Math.trunc(count);
  }
  return held;
}

/** Craft one capsule from the deepest Hollow whose materials can pay the fixed price (§7 D.3). */
export function craftCapsule(meta: DelveMeta): {
  meta: DelveMeta;
  ok: boolean;
  reason: string;
  ceiling: CapsuleCeiling | null;
} {
  const paid = spendMaterials(meta, CAPSULE_COST);
  if (!paid.ok || !paid.paidFrom) {
    return {
      meta,
      ok: false,
      reason: 'A capsule costs 2 Ore and 1 Herb.',
      ceiling: null,
    };
  }
  const ceiling = CAPSULE_CEILING[paid.paidFrom];
  return {
    meta: {
      ...paid.meta,
      capsules: { ...meta.capsules, [ceiling]: (meta.capsules?.[ceiling] ?? 0) + 1 },
    },
    ok: true,
    reason: `Crafted a ${ceiling}-ceiling capsule.`,
    ceiling,
  };
}

/**
 * What crafting one right now would produce, without spending anything. The Workshop prints the band
 * and the odds from this before the player commits, so the disclosure and `craftCapsule` cannot disagree:
 * both ask the ledger the same question. A `paidFrom` of null means the book cannot cover the price.
 */
export function craftPreview(meta: DelveMeta): {
  canCraft: boolean;
  paidFrom: HollowId | null;
  ceiling: CapsuleCeiling | null;
} {
  const paidFrom = deepestPayee(meta, CAPSULE_COST);
  return {
    canCraft: paidFrom !== null,
    paidFrom,
    ceiling: paidFrom === null ? null : CAPSULE_CEILING[paidFrom],
  };
}

/**
 * The odds the player is shown before opening, computed from the same band, floor and pity state the
 * draw will use (§7 D.4's disclosure). They sum to 100 because they are the draw's own distribution:
 * relevance only ever chooses *within* the tier that was rolled, so it cannot move a result down.
 */
export function capsuleOdds(
  ceiling: CapsuleCeiling,
  pitySinceEpic: number,
): { rarity: Rarity; percent: number }[] {
  const band = pitySinceEpic >= HARD_PITY ? hardPityBand(ceiling) : CEILING_BAND[ceiling];
  const total = band.reduce((sum, r) => sum + TIER_WEIGHT[r], 0);
  return band.map((rarity) => ({
    rarity,
    percent: Math.round((TIER_WEIGHT[rarity] / total) * 1000) / 10,
  }));
}

/** The tiers hard pity can actually reach inside this capsule's band. */
function hardPityBand(ceiling: CapsuleCeiling): readonly Rarity[] {
  const reachable = CEILING_BAND[ceiling].filter((r) => r === 'epic' || r === 'mythic');
  return reachable.length > 0 ? reachable : CEILING_BAND[ceiling];
}

/**
 * The tag the player uses most, measured on lifetime uses rather than what is equipped, because
 * relevance is about how they actually play (§7 D.4 layer 3). Null until the collection has been used
 * at all — a brand-new book has no favourite tag to be served.
 */
export function dominantTag(meta: DelveMeta): BoonTag | null {
  const tally = new Map<BoonTag, number>();
  for (const [id, state] of Object.entries(meta.skills ?? {})) {
    const skill = skillById(id);
    if (!skill) continue;
    tally.set(skill.tag, (tally.get(skill.tag) ?? 0) + state.lifetime);
  }
  let best: BoonTag | null = null;
  let bestCount = 0;
  for (const tag of BOON_TAGS) {
    const count = tally.get(tag) ?? 0;
    if (count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

/** The element the player uses most, on the same lifetime tally. */
export function dominantElement(meta: DelveMeta): Element | null {
  const tally = new Map<Element, number>();
  for (const [id, state] of Object.entries(meta.skills ?? {})) {
    const skill = skillById(id);
    if (!skill?.element) continue;
    tally.set(skill.element, (tally.get(skill.element) ?? 0) + state.lifetime);
  }
  let best: Element | null = null;
  let bestCount = 0;
  for (const [element, count] of [...tally.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count > bestCount) {
      best = element;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : null;
}

/** §7 D.5: contents keyed on the book's own seed and the capsule's issue number, and nothing else. */
function capsuleRng(bookSeed: number, capsuleIndex: number): Rng {
  return mulberry32(hashCombine(bookSeed >>> 0, hashString(`capsule:${capsuleIndex}`)) >>> 0);
}

function rollTier(rng: Rng, band: readonly Rarity[]): Rarity {
  const total = band.reduce((sum, r) => sum + TIER_WEIGHT[r], 0);
  let point = rng.float() * total;
  for (const rarity of band) {
    point -= TIER_WEIGHT[rarity];
    if (point < 0) return rarity;
  }
  return band[band.length - 1]!;
}

/**
 * Open one capsule: draw, grant, and move the pity counters, in a single write.
 *
 * The grant happens here rather than when the reveal is acknowledged, so closing the app mid-animation
 * cannot lose the prize or roll a new one — the meta row already holds both the result (`capsuleReveal`)
 * and the advanced `capsuleIndex` (§7 D.5). Once written, the next open reads the next capsule number,
 * so there is no state a player can return to that re-rolls the capsule they are looking at.
 */
export function openCapsule(
  meta: DelveMeta,
  bookSeed: number,
  ceiling: CapsuleCeiling,
): { meta: DelveMeta; ok: boolean; reason: string; reveal: CapsuleReveal | null } {
  const held = capsulesHeld(meta)[ceiling];
  if (held <= 0) {
    return { meta, ok: false, reason: 'No capsule of that make to open.', reveal: null };
  }
  const index = meta.capsuleIndex ?? 0;
  const rng = capsuleRng(bookSeed, index);

  const pityDue = (meta.pitySinceEpic ?? 0) >= HARD_PITY;
  const band = pityDue ? hardPityBand(ceiling) : CEILING_BAND[ceiling];

  const tag = dominantTag(meta);
  const element = dominantElement(meta);
  // Two misses in a row means this is the third capsule of the window, and the third owes a match.
  const relevanceDue =
    (meta.capsuleTagStreak ?? 0) >= RELEVANCE_WINDOW - 1 && (tag !== null || element !== null);

  const skill = drawFromBand(rng, rollTier(rng, band), tag, element, relevanceDue);

  const owned = meta.skills ?? {};
  const duplicate = Boolean(owned[skill.id]);
  const reveal: CapsuleReveal = {
    index,
    ceiling,
    skillId: skill.id,
    rarity: skill.rarity,
    duplicate,
  };
  const matched =
    (tag !== null && skill.tag === tag) || (element !== null && skill.element === element);

  return {
    meta: {
      ...meta,
      skills: duplicate ? owned : { ...owned, [skill.id]: { level: 1, uses: 0, lifetime: 0 } },
      dust: (meta.dust ?? 0) + (duplicate ? DUST_BY_RARITY[skill.rarity] : 0),
      capsules: { ...meta.capsules, [ceiling]: held - 1 },
      capsuleIndex: index + 1,
      // A Hollow 1 capsule can never reach Epic, so it neither advances nor spends the hard pity:
      // counting it would strand the counter at ten with nothing to buy, and the disclosure would
      // promise an Epic this capsule could not deliver.
      pitySinceEpic:
        ceiling === 'rare'
          ? (meta.pitySinceEpic ?? 0)
          : skill.rarity === 'epic' || skill.rarity === 'mythic'
            ? 0
            : (meta.pitySinceEpic ?? 0) + 1,
      capsuleTagStreak: matched ? 0 : (meta.capsuleTagStreak ?? 0) + 1,
      capsuleReveal: reveal,
    },
    ok: true,
    reason: duplicate
      ? `Knew ${skill.name} already — ${DUST_BY_RARITY[skill.rarity]} Skill Dust.`
      : `Learned ${skill.name}.`,
    reveal,
  };
}

/**
 * The skill a tier roll buys.
 *
 * When relevance is due (§7 D.4 layer 3) the pool narrows to the player's dominant tag or element. A
 * tier whose band entry holds no match — which today only happens for the two tags with no Mythic — lets
 * the roll stand instead of trading the prize sideways or down: a guarantee that served relevance by
 * handing back a less valuable capsule than the one printed on the front would trade one broken promise
 * for another. The streak does not reset on that miss, so the next capsule pays the debt.
 */
function drawFromBand(
  rng: Rng,
  tier: Rarity,
  tag: BoonTag | null,
  element: Element | null,
  mustMatch: boolean,
): CatalogueSkill {
  const at = SKILLS.filter((s) => s.rarity === tier);
  if (!mustMatch) return rng.pick(at);
  const matching = at.filter(
    (s) => (tag !== null && s.tag === tag) || (element !== null && s.element === element),
  );
  return rng.pick(matching.length > 0 ? matching : at);
}

/** Clear the printed reveal once the player has acknowledged it. The prize is already granted. */
export function dismissCapsuleReveal(meta: DelveMeta): DelveMeta {
  return { ...meta, capsuleReveal: null };
}
