/**
 * What the bag, the companion's summary and the Pokédex print (Gate 7g-4).
 *
 * Same rule as `delveCollection.ts`: every number a row shows is the engine's own. The bag's price is
 * `emberCraftCost` and its missing list is the ledger `craftConsumable` will actually check; the
 * summary's four cells come from `movesetBoard`, padded to the slot count so the grid cannot show a
 * fifth door; the Pokédex numbers every species once, keeps an unsighted name off the page, and
 * reveals exactly what `masteryLevel` allows. Selection and motion are the screens' business — these
 * functions take data and return words.
 */

import { C } from '../../art/palette';
import {
  BOSSES,
  CONSUMABLE_SLOTS,
  CONSUMABLES,
  ELITES,
  ENEMIES,
  EQUIP_SLOTS,
  MAX_MASTERY_LEVEL,
  emberCraftCost,
  masteryLevel,
  type DelveMeta,
  type EnemyDef,
} from '../../core/delve';
import type { MovesetBoard, SlotRow } from './delveCollection';

/* -------------------------------------------------------------------------------------------
 * The bag
 * ----------------------------------------------------------------------------------------- */

/** One craftable consumable as a bag row prints it. */
export interface BagRow {
  id: string;
  name: string;
  effect: string;
  /** Copies in stock. An equipped copy has left the stock, so this is what a craft adds to. */
  stock: number;
  equipped: boolean;
  /** The Ember price after the Workshop discount — the same number `craftConsumable` charges. */
  embers: number;
  costLine: string;
  /** Pool names the ledger is short of; empty when the craft can be paid. */
  missing: string[];
  canCraft: boolean;
}

/** One pocket cell. `id` is null when nothing is equipped there. */
export interface PocketSlot {
  id: string | null;
  name: string;
}

export interface BagBoard {
  rows: BagRow[];
  /** Exactly `CONSUMABLE_SLOTS` cells, in equip order; empty pockets included. */
  slots: PocketSlot[];
  equippedCount: number;
  cap: number;
  startLine: string;
}

/**
 * The four items, priced against the ledger, plus the three pockets a run starts from.
 *
 * Stock and equip are separate numbers because the engine keeps them separate: equipping moves a copy
 * out of the stock into a pocket, so a row showing `×0` while equipped is telling the truth.
 */
export function bagBoard(meta: DelveMeta): BagBoard {
  const equipped = meta.equippedConsumables ?? [];
  const rows = CONSUMABLES.map<BagRow>((def) => {
    const embers = emberCraftCost(meta, def.cost.embers);
    const missing: string[] = [];
    if (meta.materials.ore < def.cost.ore) missing.push('Ore');
    if (meta.materials.herb < def.cost.herb) missing.push('Herb');
    if (meta.materials.echo < def.cost.echo) missing.push('Echo');
    if (meta.embers < embers) missing.push('Embers');
    return {
      id: def.id,
      name: def.name,
      effect: def.effect,
      stock: meta.consumableStock?.[def.id] ?? 0,
      equipped: equipped.includes(def.id),
      embers,
      costLine: `Costs ${def.cost.ore} ore · ${def.cost.herb} herb · ${def.cost.echo} echo · ${embers} Embers.`,
      missing,
      canCraft: missing.length === 0,
    };
  });
  const byId = new Map(CONSUMABLES.map((def) => [def.id, def.name]));
  return {
    rows,
    slots: Array.from({ length: CONSUMABLE_SLOTS }, (_, index) => {
      const id = equipped[index] ?? null;
      return { id, name: id ? (byId.get(id) ?? id) : '' };
    }),
    equippedCount: equipped.length,
    cap: CONSUMABLE_SLOTS,
    startLine:
      'Equipped consumables start the next run with you. They are spent when they fire and must be crafted again.',
  };
}

/* -------------------------------------------------------------------------------------------
 * The summary's move grid
 * ----------------------------------------------------------------------------------------- */

const ELEMENT_LABEL: Record<string, string> = {
  ember: 'Ember',
  frost: 'Frost',
  gale: 'Gale',
  umbra: 'Umbra',
};

const ELEMENT_COLOR: Record<string, number> = {
  ember: C.amber2,
  frost: C.frost1,
  gale: C.teal2,
  umbra: C.violet1,
};

/** The type badge's word. A skill with no element (a build passive) prints nothing instead. */
export function elementLabel(element: string): string {
  return ELEMENT_LABEL[element] ?? '';
}

/** The type badge's ink — the same hue family the element's art uses. */
export function elementColor(element: string): number {
  return ELEMENT_COLOR[element] ?? C.paper1;
}

/** One cell of the four. `slot` is null when the companion has left that cell empty. */
export interface MoveCell {
  /** 1-based, printed on the cell so the grid reads like a numbered moveset. */
  index: number;
  slot: SlotRow | null;
  /** What an empty cell says. Empty string when a move is in it. */
  emptyLine: string;
}

/**
 * The four cells, in slot order.
 *
 * The grid is always exactly `EQUIP_SLOTS` cells: a board that somehow carried five actives would be
 * trimmed rather than growing a fifth cell, because four is the promise the fight keeps.
 */
export function moveCells(board: MovesetBoard): MoveCell[] {
  return Array.from({ length: EQUIP_SLOTS }, (_, index) => {
    const slot = board.slots[index] ?? null;
    return {
      index: index + 1,
      slot,
      emptyLine: slot ? '' : 'Empty — equip a known active below.',
    };
  });
}

/** `Uncommon · Frost · LV2`: the line under a move's name, once per cell. */
export function moveLine(slot: SlotRow): string {
  const parts = [slot.tierLabel];
  const element = elementLabel(slot.element);
  if (element !== '') parts.push(element);
  if (slot.leveled) parts.push(`LV${slot.level}`);
  return parts.join(' · ');
}

/* -------------------------------------------------------------------------------------------
 * The Pokédex
 * ----------------------------------------------------------------------------------------- */

export interface DexEntry {
  id: string;
  /** 1-based across the whole shelf, the way a Pokédex numbers its pages. */
  number: number;
  /** `#001`. */
  label: string;
  /** The species name, or `???` until it is sighted. */
  name: string;
  sighted: boolean;
  masteryLevel: number;
  /** `M2`, or empty for an unsighted page. */
  badge: string;
  /** The sentence the page prints once its mastery allows it. */
  detail: string;
  studied: boolean;
  group: string;
  /** What a screen reader hears on the tile. An unsighted entry keeps its name out of it. */
  aria: string;
}

export interface DexGroup {
  key: string;
  label: string;
  seen: number;
  total: number;
  entries: DexEntry[];
}

export interface DexBoard {
  groups: DexGroup[];
  /** Every entry in shelf order. */
  entries: DexEntry[];
  seen: number;
  total: number;
  /** The page a fresh dex opens on: the first sighted entry, else the first page. */
  firstId: string;
}

const DEX_GROUPS: readonly { key: string; label: string; rows: readonly EnemyDef[] }[] = [
  { key: 'hollow1', label: 'Rootfall Warren', rows: ENEMIES.filter((e) => e.hollow === 1) },
  { key: 'hollow2', label: 'Cinder Vault', rows: ENEMIES.filter((e) => e.hollow === 2) },
  { key: 'hollow3', label: 'Umbral Deep', rows: ENEMIES.filter((e) => e.hollow === 3) },
  { key: 'elites', label: 'Elites', rows: ELITES },
  { key: 'bosses', label: 'Bosses', rows: BOSSES },
];

function detailOf(def: EnemyDef, xp: number, level: number): string {
  if (level >= 3) return `${def.lore} Weak to ${def.weakness}, resists ${def.resistance}.`;
  if (level >= 2) {
    return `Weak to ${def.weakness}, resists ${def.resistance}. Mastery ${level}/${MAX_MASTERY_LEVEL}.`;
  }
  return `Sighted. Mastery ${level}/${MAX_MASTERY_LEVEL} — ${xp} XP. Stats still hidden.`;
}

/**
 * The whole dex as numbered pages.
 *
 * A page the book has never been handed keeps the species name off every string the player reads,
 * including the tile's accessible name; it is counted, not named. Numbers are assigned across the
 * shelf rather than per group, so a species keeps one page number wherever it is filed.
 */
export function dexBoard(meta: DelveMeta): DexBoard {
  let number = 0;
  const groups = DEX_GROUPS.map<DexGroup>((group) => {
    const entries = group.rows.map<DexEntry>((def) => {
      number += 1;
      const sighted = meta.codex?.includes(def.id) === true;
      const xp = meta.mastery?.[def.id] ?? 0;
      const level = masteryLevel(xp);
      const studied = sighted && meta.bossKnowledge?.includes(def.id) === true;
      return {
        id: def.id,
        number,
        label: `#${String(number).padStart(3, '0')}`,
        name: sighted ? def.name : '???',
        sighted,
        masteryLevel: level,
        badge: sighted ? `M${level}` : '',
        detail: sighted
          ? detailOf(def, xp, level)
          : 'Not sighted yet. It appears here the first time you meet it.',
        studied,
        group: group.label,
        aria: sighted
          ? `${def.name}, entry ${number}, mastery ${level}`
          : `Entry ${number}, not sighted`,
      };
    });
    return {
      key: group.key,
      label: group.label,
      seen: entries.filter((entry) => entry.sighted).length,
      total: entries.length,
      entries,
    };
  });
  const entries = groups.flatMap((group) => group.entries);
  return {
    groups,
    entries,
    seen: entries.filter((entry) => entry.sighted).length,
    total: entries.length,
    firstId: (entries.find((entry) => entry.sighted) ?? entries[0]!).id,
  };
}
