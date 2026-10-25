/**
 * The Workshop (SPEC 6.11 H, small version). Runs drop Ore, Herb, and Echo; the Workshop crafts
 * four consumables that equip into 3 run-start slots. Crafting spends materials and Embers only —
 * Lantern Oil can never be crafted or bought, so oil still comes from habits and the free trickle.
 */

import { offerRng } from './autopilot';
import type { DelveMeta, Materials, RoomDef, RunState } from './types';

export const CONSUMABLE_SLOTS = 3;

export interface ConsumableDef {
  id: string;
  name: string;
  /** Crafting cost: materials and Embers only (never oil). */
  cost: { ore: number; herb: number; echo: number; embers: number };
  /** Human-readable effect for logs and UI. */
  effect: string;
}

export const CONSUMABLES: readonly ConsumableDef[] = [
  {
    id: 'healing-draught',
    name: 'Healing Draught',
    cost: { ore: 0, herb: 2, echo: 0, embers: 10 },
    effect: 'Heals 50% HP the first time you drop to 30% HP or below, once per run.',
  },
  {
    id: 'fire-oil',
    name: 'Fire Oil',
    cost: { ore: 1, herb: 1, echo: 0, embers: 15 },
    effect: 'Your first fight of the run starts with every enemy Burning.',
  },
  {
    id: 'smoke-scroll',
    name: 'Smoke Scroll',
    cost: { ore: 0, herb: 1, echo: 1, embers: 15 },
    effect: 'The first killing blow against you (outside a boss room) is escaped at 1 HP instead.',
  },
  {
    id: 'shield-charm',
    name: 'Shield Charm',
    cost: { ore: 2, herb: 0, echo: 0, embers: 10 },
    effect: 'Your first fight of the run starts with +8 Shield.',
  },
];

export function consumableById(id: string): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}

export const EMPTY_MATERIALS: Materials = { ore: 0, herb: 0, echo: 0 };

export function addMaterials(a: Materials, b: Materials): Materials {
  return { ore: a.ore + b.ore, herb: a.herb + b.herb, echo: a.echo + b.echo };
}

/** Workshop upgrade 2 cuts the Ember part of craft costs by 20%. */
export function emberCraftCost(meta: DelveMeta, base: number): number {
  const lvl = meta.buildingLevels?.['workshop'] ?? 0;
  const discount = lvl >= 2 ? 20 : 0;
  return Math.max(1, Math.round((base * (100 - discount)) / 100));
}

/** Craft one consumable into the stock, spending materials and Embers. */
export function craftConsumable(
  meta: DelveMeta,
  id: string,
): { meta: DelveMeta; ok: boolean; reason: string } {
  const def = consumableById(id);
  if (!def) return { meta, ok: false, reason: 'Unknown consumable.' };
  const mats = meta.materials ?? EMPTY_MATERIALS;
  if (mats.ore < def.cost.ore || mats.herb < def.cost.herb || mats.echo < def.cost.echo) {
    return { meta, ok: false, reason: 'Not enough materials.' };
  }
  const embers = emberCraftCost(meta, def.cost.embers);
  if (meta.embers < embers) return { meta, ok: false, reason: 'Not enough Embers.' };
  return {
    meta: {
      ...meta,
      embers: meta.embers - embers,
      materials: {
        ore: mats.ore - def.cost.ore,
        herb: mats.herb - def.cost.herb,
        echo: mats.echo - def.cost.echo,
      },
      consumableStock: {
        ...(meta.consumableStock ?? {}),
        [def.id]: (meta.consumableStock?.[def.id] ?? 0) + 1,
      },
    },
    ok: true,
    reason: `Crafted ${def.name}.`,
  };
}

/** Equip a stocked consumable into a free run-start slot. */
export function equipConsumable(
  meta: DelveMeta,
  id: string,
): { meta: DelveMeta; ok: boolean; reason: string } {
  const stock = meta.consumableStock?.[id] ?? 0;
  if (stock <= 0) return { meta, ok: false, reason: 'None in stock.' };
  const equipped = meta.equippedConsumables ?? [];
  if (equipped.length >= CONSUMABLE_SLOTS) {
    return { meta, ok: false, reason: 'All 3 slots are full.' };
  }
  return {
    meta: {
      ...meta,
      consumableStock: { ...(meta.consumableStock ?? {}), [id]: stock - 1 },
      equippedConsumables: [...equipped, id],
    },
    ok: true,
    reason: 'Equipped.',
  };
}

/** Return an equipped consumable to the stock. */
export function unequipConsumable(
  meta: DelveMeta,
  id: string,
): { meta: DelveMeta; ok: boolean; reason: string } {
  const equipped = meta.equippedConsumables ?? [];
  const at = equipped.indexOf(id);
  if (at < 0) return { meta, ok: false, reason: 'Not equipped.' };
  return {
    meta: {
      ...meta,
      consumableStock: {
        ...(meta.consumableStock ?? {}),
        [id]: (meta.consumableStock?.[id] ?? 0) + 1,
      },
      equippedConsumables: equipped.filter((_, i) => i !== at),
    },
    ok: true,
    reason: 'Unequipped.',
  };
}

/** Material drops for a won fight, deterministic per run and room. */
export function dropMaterials(run: RunState, room: RoomDef): Materials {
  const rng = offerRng(run, `materials-${room.id}`);
  if (room.kind === 'boss') return { ore: 1, herb: 0, echo: 1 };
  const one = (): Materials =>
    rng.int(2) === 0 ? { ore: 1, herb: 0, echo: 0 } : { ore: 0, herb: 1, echo: 0 };
  const drops = room.kind === 'elite' ? addMaterials(one(), one()) : one();
  return drops;
}
