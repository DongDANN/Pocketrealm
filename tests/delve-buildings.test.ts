/**
 * Gate 1.6e — Realm buildings: milestone unlocks from real budgeting behaviour, upgrades that
 * spend materials and Embers, the +10% combined Delve-power cap, and the per-building effects
 * (Treasury start Glint, Library mastery gain, Smithy ATK, Observatory look-ahead, Workshop
 * crafting discount).
 */

import { describe, expect, it } from 'vitest';
import {
  emptyMeta,
  economyMods,
  newRun,
  stepRun,
  type AutopilotPolicy,
  type DelveMeta,
  type RoomDef,
} from '../src/core/delve';
import {
  BUILDINGS,
  BUILDING_POWER_CAP,
  buildingById,
  buildingMilestones,
  buildingPower,
  lookaheadRows,
  masteryMult,
  unlockBuilding,
  upgradeBuilding,
} from '../src/core/delve/buildings';

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), embers: 500, ...over };
}

const NO_MILESTONES = {
  savingsGoalReached: false,
  weeklyReviewDone: false,
  companionLevel: 1,
  totalLoggedDays: 0,
};

describe('building definitions', () => {
  it('defines five buildings with milestones, upgrades, and costs', () => {
    expect(BUILDINGS.map((b) => b.id)).toEqual([
      'treasury',
      'library',
      'smithy',
      'observatory',
      'workshop',
    ]);
    for (const b of BUILDINGS) {
      expect(b.milestone.length).toBeGreaterThan(0);
      expect(b.effect.length).toBeGreaterThan(0);
      expect(b.maxLevel).toBe(2);
      const cost = b.cost(1);
      expect(cost.ore + cost.herb + cost.echo).toBeGreaterThan(0);
      expect(cost.embers).toBeGreaterThan(0);
    }
    expect(buildingById('library')?.name).toBe('Library');
    expect(buildingById('nope')).toBeUndefined();
  });
});

describe('milestone unlocks', () => {
  it('gates each building behind its real budgeting milestone', () => {
    expect(buildingMilestones(NO_MILESTONES)).toEqual({
      treasury: false,
      library: false,
      smithy: false,
      observatory: false,
      workshop: true,
    });
    expect(buildingMilestones({ ...NO_MILESTONES, savingsGoalReached: true }).treasury).toBe(true);
    expect(buildingMilestones({ ...NO_MILESTONES, weeklyReviewDone: true }).library).toBe(true);
    expect(buildingMilestones({ ...NO_MILESTONES, companionLevel: 10 }).smithy).toBe(true);
    expect(buildingMilestones({ ...NO_MILESTONES, totalLoggedDays: 30 }).observatory).toBe(true);
    // Milestones are process/savings only — never "spend less" style signals.
    expect(Object.keys(buildingMilestones(NO_MILESTONES))).not.toContain('underBudget');
  });

  it('unlocks a building only when its milestone is met', () => {
    const locked = unlockBuilding(metaWith({}), 'treasury', buildingMilestones(NO_MILESTONES));
    expect(locked.ok).toBe(false);
    expect(locked.meta.buildingLevels['treasury']).toBeUndefined();

    const open = unlockBuilding(
      metaWith({}),
      'treasury',
      buildingMilestones({ ...NO_MILESTONES, savingsGoalReached: true }),
    );
    expect(open.ok).toBe(true);
    expect(open.meta.buildingLevels['treasury']).toBe(1);

    const again = unlockBuilding(
      open.meta,
      'treasury',
      buildingMilestones({ ...NO_MILESTONES, savingsGoalReached: true }),
    );
    expect(again.ok).toBe(false);
  });
});

describe('upgrades and the power cap', () => {
  it('upgrades a building with materials and Embers', () => {
    const meta = metaWith({
      buildingLevels: { treasury: 1 },
      materials: { ore: 4, herb: 2, echo: 0 },
      embers: 500,
    });
    const out = upgradeBuilding(meta, 'treasury');
    expect(out.ok).toBe(true);
    expect(out.meta.buildingLevels['treasury']).toBe(2);
    expect(out.meta.materials).toEqual({ ore: 0, herb: 0, echo: 0 });
    expect(out.meta.embers).toBe(460);

    const maxed = upgradeBuilding(out.meta, 'treasury');
    expect(maxed.ok).toBe(false);
    expect(maxed.reason).toMatch(/max level/i);

    const locked = upgradeBuilding(metaWith({}), 'treasury');
    expect(locked.ok).toBe(false);
    expect(locked.reason).toMatch(/not unlocked/i);

    const poor = upgradeBuilding(
      metaWith({ buildingLevels: { treasury: 1 }, materials: { ore: 0, herb: 0, echo: 0 } }),
      'treasury',
    );
    expect(poor.ok).toBe(false);
    expect(poor.reason).toMatch(/material/i);
  });

  it('caps combined building bonuses at +10% Delve power', () => {
    expect(BUILDING_POWER_CAP).toBe(10);
    expect(buildingPower({})).toBe(0);
    expect(buildingPower({ treasury: 1 })).toBe(0);
    expect(buildingPower({ treasury: 2 })).toBe(5);
    expect(buildingPower({ treasury: 2, library: 2 })).toBe(10);

    let meta = metaWith({
      buildingLevels: { treasury: 2, library: 2 },
      materials: { ore: 99, herb: 99, echo: 99 },
    });
    for (const id of ['smithy', 'observatory', 'workshop']) {
      meta = { ...meta, buildingLevels: { ...meta.buildingLevels, [id]: 1 } };
      const out = upgradeBuilding(meta, id);
      expect(out.ok).toBe(false);
      expect(out.reason).toMatch(/cap/i);
      expect(out.meta.buildingLevels[id]).toBe(1);
    }
  });
});

describe('building effects', () => {
  it('Library multiplies mastery gain and Observatory extends look-ahead', () => {
    expect(masteryMult(metaWith({}))).toBe(1);
    expect(masteryMult(metaWith({ buildingLevels: { library: 1 } }))).toBe(1.1);
    expect(masteryMult(metaWith({ buildingLevels: { library: 2 } }))).toBe(1.2);
    expect(lookaheadRows(metaWith({}))).toBe(0);
    expect(lookaheadRows(metaWith({ buildingLevels: { observatory: 1 } }))).toBe(1);
    expect(lookaheadRows(metaWith({ buildingLevels: { observatory: 2 } }))).toBe(2);
  });

  it('Treasury adds starting Glint per level', () => {
    const base = newRun(1, 1, 5, metaWith({}));
    const lvl2 = newRun(1, 1, 5, metaWith({ buildingLevels: { treasury: 2 } }));
    expect(economyMods(base, {}).startGlint).toBe(0);
    expect(economyMods(lvl2, {}).startGlint).toBe(20);
  });

  it('Smithy tempers companion ATK by 3% per level', () => {
    const base = newRun(7, 1, 5, metaWith({}));
    const lvl2 = newRun(7, 1, 5, metaWith({ buildingLevels: { smithy: 2 } }));
    expect(lvl2.unit.atk - base.unit.atk).toBe(Math.round(base.unit.atk * 0.06));
    expect(lvl2.unit.hp).toBe(base.unit.hp);
  });

  it('Observatory reveals one extra map row ahead in fork choices', () => {
    const mkRoom = (kind: RoomDef['kind'], id: string): RoomDef => ({
      id,
      kind,
      enemies: [],
      optionSeed: 1,
    });
    const plan = {
      floor: 1,
      rows: [
        [mkRoom('skirmish', 'a')],
        [mkRoom('shop', 'b'), mkRoom('event', 'c')],
        [mkRoom('rest', 'd')],
      ],
    };
    const noLook = newRun(3, 1, 5, metaWith({}));
    noLook.floorPlan = plan;
    noLook.row = 1;
    const campPolicy: AutopilotPolicy = {
      mode: 'camp',
      tagPriority: ['guard'],
      retreatHpPercent: 0,
      route: 'balanced',
    };
    const out0 = stepRun(noLook, {
      now: 0,
      oil: 10,
      oilCapacity: 100,
      signals: {
        checkedInToday: false,
        envelopesWithinAllowance: 0,
        contributedToGoalLast7d: false,
        reviewedLast7d: false,
      },
      meta: metaWith({}),
      policy: campPolicy,
      today: '2026-10-25',
    });
    expect(out0.run.pendingChoice?.kind).toBe('fork');
    for (const o of out0.run.pendingChoice!.options) expect(o.detail ?? '').not.toContain('→');

    const withLook = newRun(3, 1, 5, metaWith({ buildingLevels: { observatory: 1 } }));
    withLook.floorPlan = plan;
    withLook.row = 1;
    const out1 = stepRun(withLook, {
      now: 0,
      oil: 10,
      oilCapacity: 100,
      signals: {
        checkedInToday: false,
        envelopesWithinAllowance: 0,
        contributedToGoalLast7d: false,
        reviewedLast7d: false,
      },
      meta: metaWith({ buildingLevels: { observatory: 1 } }),
      policy: campPolicy,
      today: '2026-10-25',
    });
    expect(out1.run.pendingChoice?.kind).toBe('fork');
    for (const o of out1.run.pendingChoice!.options) expect(o.detail).toContain('→ Rest');
  });
});
