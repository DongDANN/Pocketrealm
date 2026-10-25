/**
 * Sparks cosmetics (SPEC 6.7). Sparks come only from real progress and in-game play, and nothing
 * here changes budgeting math, rewards, or access. Companion items are visual only; realm items are
 * keepsakes the Realm scene can show. The catalogue is pure data so the shop, the save file and the
 * tests all use the same ids and prices.
 */

export type CosmeticKind = 'hat' | 'scarf' | 'color' | 'realm';

export interface CosmeticDef {
  id: string;
  name: string;
  kind: CosmeticKind;
  /** Sparks price. Free keepsakes are granted by play and never sold. */
  price: number;
  blurb: string;
  /** Which companion slot this occupies; realm keepsakes have none. */
  slot?: 'hat' | 'scarf' | 'color';
}

export const COSMETICS: readonly CosmeticDef[] = [
  // Hats.
  {
    id: 'hat-moss-cap',
    name: 'Moss Cap',
    kind: 'hat',
    slot: 'hat',
    price: 15,
    blurb: 'A soft cap of woven moss. Smells faintly of rain.',
  },
  {
    id: 'hat-ember-hood',
    name: 'Ember Hood',
    kind: 'hat',
    slot: 'hat',
    price: 25,
    blurb: 'A warm hood that keeps its own little glow.',
  },
  {
    id: 'hat-copper-circlet',
    name: 'Copper Circlet',
    kind: 'hat',
    slot: 'hat',
    price: 40,
    blurb: 'Thin copper wire, bent into a patient circle.',
  },
  {
    id: 'hat-bellvine-crown',
    name: 'Bellvine Crown',
    kind: 'hat',
    slot: 'hat',
    price: 60,
    blurb: 'Tiny bells that ring only for good news.',
  },
  {
    id: 'hat-stargazer-pin',
    name: 'Stargazer Pin',
    kind: 'hat',
    slot: 'hat',
    price: 60,
    blurb: 'A bright pin for looking up between entries.',
  },
  {
    id: 'hat-rain-hat',
    name: 'Rain Hat',
    kind: 'hat',
    slot: 'hat',
    price: 90,
    blurb: 'Broad-brimmed and entirely unbothered by weather.',
  },
  // Scarves.
  {
    id: 'scarf-amber',
    name: 'Amber Scarf',
    kind: 'scarf',
    slot: 'scarf',
    price: 15,
    blurb: 'Knitted in the colour of a full lantern.',
  },
  {
    id: 'scarf-rootwrap',
    name: 'Root Wrap',
    kind: 'scarf',
    slot: 'scarf',
    price: 25,
    blurb: 'A strip of clean root fibre, surprisingly warm.',
  },
  {
    id: 'scarf-tide-ribbon',
    name: 'Tide Ribbon',
    kind: 'scarf',
    slot: 'scarf',
    price: 40,
    blurb: 'Blue-green, and always slightly cool to the touch.',
  },
  {
    id: 'scarf-ember-stole',
    name: 'Ember Stole',
    kind: 'scarf',
    slot: 'scarf',
    price: 60,
    blurb: 'Long enough to wrap twice on cold mornings.',
  },
  {
    id: 'scarf-cloud-collar',
    name: 'Cloud Collar',
    kind: 'scarf',
    slot: 'scarf',
    price: 60,
    blurb: 'A puff of pale cloth that never quite settles.',
  },
  {
    id: 'scarf-ledger-sash',
    name: 'Ledger Sash',
    kind: 'scarf',
    slot: 'scarf',
    price: 90,
    blurb: 'A neat sash with a tiny pocket for a pencil stub.',
  },
  // Colours (an aura, not a repaint: the sprite stays readable).
  {
    id: 'color-lichen',
    name: 'Lichen Green',
    kind: 'color',
    slot: 'color',
    price: 15,
    blurb: 'A quiet green ring, like the edge of a stone.',
  },
  {
    id: 'color-lamp',
    name: 'Lamp Amber',
    kind: 'color',
    slot: 'color',
    price: 25,
    blurb: 'A warm ring that matches the lantern.',
  },
  {
    id: 'color-deep-teal',
    name: 'Deep Teal',
    kind: 'color',
    slot: 'color',
    price: 40,
    blurb: 'Cool and steady, for long evenings.',
  },
  {
    id: 'color-ash-violet',
    name: 'Ash Violet',
    kind: 'color',
    slot: 'color',
    price: 60,
    blurb: 'The colour the sky goes just before rain.',
  },
  {
    id: 'color-paper-white',
    name: 'Paper White',
    kind: 'color',
    slot: 'color',
    price: 90,
    blurb: 'A pale ring that catches every bit of light.',
  },
  // Realm keepsakes.
  {
    id: 'realm-garden-lantern',
    name: 'Garden Lantern',
    kind: 'realm',
    price: 20,
    blurb: 'A second lantern for the path down to the water.',
  },
  {
    id: 'realm-little-bridge',
    name: 'Little Bridge',
    kind: 'realm',
    price: 30,
    blurb: 'Wide enough for one companion and a good thought.',
  },
  {
    id: 'realm-kite-string',
    name: 'Kite String',
    kind: 'realm',
    price: 30,
    blurb: 'Something bright, tugging at the sky.',
  },
  {
    id: 'realm-moss-fountain',
    name: 'Moss Fountain',
    kind: 'realm',
    price: 45,
    blurb: 'A shallow basin, a slow drip, a lot of moss.',
  },
  {
    id: 'realm-reading-nook',
    name: 'Reading Nook',
    kind: 'realm',
    price: 60,
    blurb: 'A bench under the eaves. The ledger can wait a minute.',
  },
  {
    id: 'realm-ember-brazier',
    name: 'Ember Brazier',
    kind: 'realm',
    price: 75,
    blurb: 'Warm light for the island when the Hollows are cold.',
  },
  {
    id: 'realm-observatory-bench',
    name: 'Observatory Bench',
    kind: 'realm',
    price: 100,
    blurb: 'A place to watch the map go one row further.',
  },
];

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((item) => item.id === id);
}

/** A codex-completion keepsake: earned, never sold. */
export const CODEX_COSMETIC_ID = 'codex-sage';

export function cosmeticSlot(kind: CosmeticKind): 'hat' | 'scarf' | 'color' | undefined {
  if (kind === 'hat' || kind === 'scarf' || kind === 'color') return kind;
  return undefined;
}

export function cosmeticsByKind(kind: CosmeticKind): readonly CosmeticDef[] {
  return COSMETICS.filter((item) => item.kind === kind);
}

/** Sparks after purchases. Purchases are receipts, so this is ledger Sparks minus their cost. */
export function availableSparks(sparks: number, spent: number): number {
  return Math.max(0, Math.trunc(sparks) - Math.max(0, Math.trunc(spent)));
}

/** What the companion is wearing, from a slot map; unknown ids are ignored. */
export function equippedInSlot(
  equipped: Readonly<Record<string, string>> | undefined,
  slot: 'hat' | 'scarf' | 'color',
): string | undefined {
  const id = equipped?.[slot];
  if (!id) return undefined;
  const item = cosmeticById(id);
  return item && item.slot === slot ? id : undefined;
}
