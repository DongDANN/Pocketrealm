/**
 * Gate 1.6e — Workshop: run materials (Ore/Herb/Echo), crafting the four consumables,
 * the 3-slot loadout, and the "Lantern Oil can never be crafted" guard.
 */

import { describe, expect, it } from 'vitest';
import { emptyMeta, newRun, type DelveMeta, type RoomDef } from '../src/core/delve';
import {
  CONSUMABLES,
  addMaterials,
  consumableById,
  craftConsumable,
  dropMaterials,
  emberCraftCost,
  equipConsumable,
  unequipConsumable,
} from '../src/core/delve/workshop';

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), embers: 200, ...over };
}

const room = (kind: RoomDef['kind'], id = 'f1r1c0'): RoomDef => ({
  id,
  kind,
  enemies: kind === 'skirmish' ? ['tollbug'] : kind === 'elite' ? ['thornheart'] : ['thorncrown'],
  optionSeed: 7,
});

describe('consumable definitions', () => {
  it('defines exactly the four craftables with material+ember costs only', () => {
    expect(CONSUMABLES.map((c) => c.id)).toEqual([
      'healing-draught',
      'fire-oil',
      'smoke-scroll',
      'shield-charm',
    ]);
    for (const c of CONSUMABLES) {
      expect(c.effect.length).toBeGreaterThan(0);
      const costKeys = Object.keys(c.cost);
      for (const k of costKeys) expect(['ore', 'herb', 'echo', 'embers']).toContain(k);
      expect(costKeys).not.toContain('oil');
      expect(c.cost.embers).toBeGreaterThan(0);
    }
    expect(consumableById('fire-oil')?.name).toBe('Fire Oil');
    expect(consumableById('nope')).toBeUndefined();
  });
});

describe('crafting', () => {
  it('crafts a consumable by spending materials and Embers', () => {
    const meta = metaWith({ materials: { ore: 0, herb: 2, echo: 0 }, embers: 100 });
    const out = craftConsumable(meta, 'healing-draught');
    expect(out.ok).toBe(true);
    expect(out.meta.consumableStock['healing-draught']).toBe(1);
    expect(out.meta.materials).toEqual({ ore: 0, herb: 0, echo: 0 });
    expect(out.meta.embers).toBe(90);
  });

  it('refuses to craft without enough materials or Embers', () => {
    const poor = craftConsumable(
      metaWith({ materials: { ore: 0, herb: 1, echo: 0 }, embers: 100 }),
      'healing-draught',
    );
    expect(poor.ok).toBe(false);
    expect(poor.reason).toMatch(/material/i);
    expect(poor.meta.materials).toEqual({ ore: 0, herb: 1, echo: 0 });
    expect(poor.meta.consumableStock['healing-draught']).toBeUndefined();
    expect(poor.meta.embers).toBe(100);

    const broke = craftConsumable(
      metaWith({ materials: { ore: 0, herb: 9, echo: 0 }, embers: 5 }),
      'healing-draught',
    );
    expect(broke.ok).toBe(false);
    expect(broke.reason).toMatch(/ember/i);
  });

  it('workshop upgrade 2 cuts the Ember part of craft costs by 20%', () => {
    expect(emberCraftCost(metaWith({ buildingLevels: {} }), 40)).toBe(40);
    expect(emberCraftCost(metaWith({ buildingLevels: { workshop: 1 } }), 40)).toBe(40);
    expect(emberCraftCost(metaWith({ buildingLevels: { workshop: 2 } }), 40)).toBe(32);
  });
});

describe('loadout slots', () => {
  it('equips stock into at most 3 slots and unequips back', () => {
    let meta = metaWith({ consumableStock: { 'shield-charm': 2, 'fire-oil': 2 } });
    for (const id of ['shield-charm', 'fire-oil', 'fire-oil']) {
      const out = equipConsumable(meta, id);
      expect(out.ok).toBe(true);
      meta = out.meta;
    }
    expect(meta.equippedConsumables).toEqual(['shield-charm', 'fire-oil', 'fire-oil']);
    expect(meta.consumableStock).toEqual({ 'shield-charm': 1, 'fire-oil': 0 });

    const fourth = equipConsumable(meta, 'shield-charm');
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toMatch(/slot/i);

    const back = unequipConsumable(meta, 'fire-oil');
    expect(back.ok).toBe(true);
    expect(back.meta.equippedConsumables).toEqual(['shield-charm', 'fire-oil']);
    expect(back.meta.consumableStock['fire-oil']).toBe(1);
  });

  it('snapshots the equipped loadout into a new run with fresh per-run state', () => {
    const meta = metaWith({ equippedConsumables: ['fire-oil', 'shield-charm'] });
    const run = newRun(1, 1, 5, meta);
    expect(run.consumables).toEqual(['fire-oil', 'shield-charm']);
    expect(run.consumablesUsed).toEqual({});
    expect(run.materials).toEqual({ ore: 0, herb: 0, echo: 0 });
  });
});

describe('material drops', () => {
  it('drops 1 material from skirmishes, 2 from elites, Echo+Ore from bosses', () => {
    const run = newRun(42, 1, 5, metaWith({}));
    for (const kind of ['skirmish', 'elite', 'boss'] as const) {
      const drops = dropMaterials(run, room(kind));
      const total = drops.ore + drops.herb + drops.echo;
      if (kind === 'skirmish') expect(total).toBe(1);
      if (kind === 'elite') expect(total).toBe(2);
      if (kind === 'boss') expect(drops).toEqual({ ore: 1, herb: 0, echo: 1 });
    }
  });

  it('is deterministic for the same run and room', () => {
    const run = newRun(42, 1, 5, metaWith({}));
    const a = dropMaterials(run, room('elite', 'f1r2c1'));
    const b = dropMaterials(run, room('elite', 'f1r2c1'));
    expect(a).toEqual(b);
  });

  it('addMaterials sums component-wise', () => {
    expect(addMaterials({ ore: 1, herb: 2, echo: 0 }, { ore: 2, herb: 0, echo: 1 })).toEqual({
      ore: 3,
      herb: 2,
      echo: 1,
    });
  });
});
