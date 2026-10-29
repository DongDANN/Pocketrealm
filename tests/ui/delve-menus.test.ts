/**
 * Gate 7g-4 — the print-logic behind the bag, the companion's summary and the Pokédex.
 *
 * These are the same honesty tests the collection screens already carry, applied to the three menus
 * the reskin rebuilt: a bag row's price is the price the craft charges (discount included), a move
 * grid never shows a fifth cell, and an unsighted Pokédex page keeps the species name out of every
 * string, accessible name included.
 */

import { describe, expect, it } from 'vitest';
import {
  CODEX_SPECIES,
  CONSUMABLES,
  DEFAULT_BUILD,
  ENEMIES,
  EQUIP_SLOTS,
  buildActives,
  craftConsumable,
  emptyMeta,
  equipConsumable,
  type DelveMeta,
} from '../../src/core/delve';
import { C } from '../../src/art/palette';
import { movesetBoard } from '../../src/ui/lib/delveCollection';
import {
  bagBoard,
  dexBoard,
  elementColor,
  elementLabel,
  moveCells,
  moveLine,
} from '../../src/ui/lib/delveMenus';

function rich(over: Partial<DelveMeta> = {}): DelveMeta {
  return {
    ...emptyMeta(),
    embers: 500,
    materials: { ore: 99, herb: 99, echo: 99 },
    ...over,
  };
}

describe('the bag', () => {
  it('prices every item against the ledger and names what is missing', () => {
    const board = bagBoard(emptyMeta());
    expect(board.rows.map((row) => row.id)).toEqual(CONSUMABLES.map((def) => def.id));
    expect(board.rows.every((row) => !row.canCraft)).toBe(true);
    const draught = board.rows[0]!;
    expect(draught.missing).toEqual(['Herb', 'Embers']);
    expect(draught.costLine).toBe('Costs 0 ore · 2 herb · 0 echo · 10 Embers.');
    expect(draught.stock).toBe(0);
    expect(draught.equipped).toBe(false);
  });

  it('charges the Workshop discount, not the base price', () => {
    const board = bagBoard(rich({ buildingLevels: { workshop: 2 } }));
    const draught = board.rows[0]!;
    expect(draught.embers).toBe(8);
    expect(draught.costLine).toContain('8 Embers');
    expect(draught.canCraft).toBe(true);
  });

  it('shows an equipped copy out of the stock, in the pocket it fills', () => {
    let meta = rich();
    meta = craftConsumable(meta, 'healing-draught').meta;
    meta = craftConsumable(meta, 'healing-draught').meta;
    meta = equipConsumable(meta, 'healing-draught').meta;
    const board = bagBoard(meta);
    const draught = board.rows[0]!;
    expect(draught.stock).toBe(1);
    expect(draught.equipped).toBe(true);
    expect(board.slots).toEqual([
      { id: 'healing-draught', name: 'Healing Draught' },
      { id: null, name: '' },
      { id: null, name: '' },
    ]);
    expect(board.equippedCount).toBe(1);
    expect(board.cap).toBe(3);
  });

  it('keeps one pocket per equipped copy, even of the same item', () => {
    let meta = rich();
    for (let i = 0; i < 2; i += 1) meta = craftConsumable(meta, 'fire-oil').meta;
    meta = equipConsumable(meta, 'fire-oil').meta;
    meta = equipConsumable(meta, 'fire-oil').meta;
    const board = bagBoard(meta);
    expect(board.slots.map((slot) => slot.name)).toEqual(['Fire Oil', 'Fire Oil', '']);
    expect(board.rows.find((row) => row.id === 'fire-oil')!.stock).toBe(0);
    expect(board.startLine).toContain('start the next run');
  });
});

describe('the summary', () => {
  const board = movesetBoard(emptyMeta(), 1, DEFAULT_BUILD, false);

  it('prints exactly four cells, in slot order, and names the empty doors', () => {
    const cells = moveCells(board);
    expect(cells).toHaveLength(EQUIP_SLOTS);
    expect(cells.map((cell) => cell.index)).toEqual([1, 2, 3, 4]);
    expect(cells[0]!.slot?.id).toBe(buildActives(DEFAULT_BUILD)[0]!.id);
    expect(cells[1]!.slot?.id).toBe(buildActives(DEFAULT_BUILD)[1]!.id);
    expect(cells[2]!.slot).toBeNull();
    expect(cells[2]!.emptyLine).toBe('Empty — equip a known active below.');
  });

  it('trims a board that somehow carried a fifth active rather than growing a door', () => {
    const first = board.slots[0]!;
    const five = { ...board, slots: [first, first, first, first, first] };
    expect(moveCells(five)).toHaveLength(EQUIP_SLOTS);
  });

  it('names an empty cell and what would fill it', () => {
    const empty = moveCells({ ...board, slots: [] });
    expect(empty.every((cell) => cell.slot === null)).toBe(true);
    expect(empty[0]!.emptyLine).toBe('Empty — equip a known active below.');
  });

  it('reads a move as tier, type and level — and omits what the move does not have', () => {
    const slot = {
      ...board.slots[0]!,
      tierLabel: 'Uncommon',
      element: 'frost',
      leveled: true,
      level: 2,
    };
    expect(moveLine(slot)).toBe('Uncommon · Frost · LV2');
    expect(moveLine({ ...slot, element: '', leveled: false })).toBe('Uncommon');
  });

  it('colours each element from its own ramp, and an unknown one by the paper ink', () => {
    expect(elementLabel('umbra')).toBe('Umbra');
    expect(elementLabel('')).toBe('');
    expect(elementColor('ember')).toBe(C.amber2);
    expect(elementColor('frost')).toBe(C.frost1);
    expect(elementColor('gale')).toBe(C.teal2);
    expect(elementColor('umbra')).toBe(C.violet1);
    expect(elementColor('')).toBe(C.paper1);
  });
});

describe('the Pokédex', () => {
  it('numbers every page once and names none of the unsighted ones', () => {
    const board = dexBoard(emptyMeta());
    expect(board.groups.map((group) => group.label)).toEqual([
      'Rootfall Warren',
      'Cinder Vault',
      'Umbral Deep',
      'Elites',
      'Bosses',
    ]);
    expect(board.groups.map((group) => group.total)).toEqual([4, 3, 3, 3, 3]);
    expect(board.total).toBe(CODEX_SPECIES.length);
    expect(board.seen).toBe(0);
    expect(board.entries.map((entry) => entry.number)).toEqual(
      Array.from({ length: CODEX_SPECIES.length }, (_, index) => index + 1),
    );
    const first = board.entries[0]!;
    expect(first.label).toBe('#001');
    expect(board.firstId).toBe(ENEMIES[0]!.id);
    expect(first.name).toBe('???');
    expect(first.badge).toBe('');
    expect(first.aria).toBe('Entry 1, not sighted');
    expect(
      board.entries.every((entry) => entry.aria === `Entry ${entry.number}, not sighted`),
    ).toBe(true);
  });

  it('reveals lore at mastery 3, weakness at 2, and only "sighted" below that', () => {
    const def = ENEMIES[0]!;
    const sighted = (xp: number): ReturnType<typeof dexBoard> =>
      dexBoard({ ...emptyMeta(), codex: [def.id], mastery: { [def.id]: xp } });

    const lore = sighted(30).entries[0]!;
    expect(lore.name).toBe(def.name);
    expect(lore.badge).toBe('M3');
    expect(lore.detail).toBe(`${def.lore} Weak to ${def.weakness}, resists ${def.resistance}.`);

    const weak = sighted(20).entries[0]!;
    expect(weak.detail).toBe(`Weak to ${def.weakness}, resists ${def.resistance}. Mastery 2/10.`);

    const seen = sighted(10).entries[0]!;
    expect(seen.detail).toBe('Sighted. Mastery 1/10 — 10 XP. Stats still hidden.');
  });

  it('opens on the first sighted page, and leaves its neighbours unnamed', () => {
    const second = ENEMIES[1]!;
    const board = dexBoard({ ...emptyMeta(), codex: [second.id] });
    expect(board.firstId).toBe(second.id);
    expect(board.entries[0]!.sighted).toBe(false);
    expect(board.entries[1]!.name).toBe(second.name);
    expect(board.groups[0]!.seen).toBe(1);
    expect(board.seen).toBe(1);
  });

  it('records a studied boss only once the page itself is sighted', () => {
    const boss = CODEX_SPECIES[CODEX_SPECIES.length - 1]!;
    const studied = dexBoard({
      ...emptyMeta(),
      codex: [boss],
      bossKnowledge: [boss],
    }).entries.at(-1)!;
    expect(studied.studied).toBe(true);
    const unseen = dexBoard({ ...emptyMeta(), bossKnowledge: [boss] }).entries.at(-1)!;
    expect(unseen.studied).toBe(false);
  });
});
