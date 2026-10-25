/**
 * Gate 1.6f — Breaker persona (SPEC 6.11 N). The Breaker sweeps every build and route with a
 * maximally kitted meta at Heat 5 in Hollow 3 on Trickle's free-oil budget only. A build that
 * clears that in under a day is degenerate and fails the balance check, so the sweep asserts it
 * never happens and records how deep it actually got.
 */

import { describe, expect, it } from 'vitest';
import { BUILDS, HEAT_MAX, HOLLOW_FLOORS, CODEX_SPECIES } from '../src/core/delve';
import { BUILDINGS, BUILDING_POWER_CAP, buildingPower } from '../src/core/delve/buildings';
import { BREAKER_ROUTES, buildMaxMeta, runBreaker } from '../scripts/sim-delve';

const SEEDS = [0xb1e0001, 0xb1e0002, 0xb1e0003];

describe('Breaker meta', () => {
  it('maxes everything without breaking the building power cap', () => {
    const meta = buildMaxMeta();
    expect(buildingPower(meta.buildingLevels)).toBe(BUILDING_POWER_CAP);
    expect(Object.keys(meta.buildingLevels).length).toBe(BUILDINGS.length);
    expect(meta.cards).toHaveLength(3);
    expect(Object.keys(meta.mastery).length).toBe(CODEX_SPECIES.length);
    expect(meta.equippedConsumables.length).toBeGreaterThan(0);
    expect(meta.clearedHollows).toEqual([1, 2, 3]);
  });
});

describe('Breaker sweep', () => {
  const results = runBreaker(1, SEEDS);

  it('sweeps every build and route', () => {
    expect(results).toHaveLength(BUILDS.length * BREAKER_ROUTES.length);
    for (const r of results) {
      expect(r.heat).toBe(HEAT_MAX);
      expect(r.floorTarget).toBe(HOLLOW_FLOORS[3]);
    }
  });

  it('finds no degenerate build at Heat 5 Hollow 3 on Trickle oil in a day', () => {
    const degenerate = results.filter((r) => r.clearedInADay);
    expect(degenerate.map((d) => `${d.buildId}/${d.route}`)).toEqual([]);
  });

  it('still makes progress, so the sweep is not vacuous', () => {
    for (const r of results) {
      expect(r.steps, `${r.buildId}/${r.route} spent no oil`).toBeGreaterThan(0);
      expect(r.deepestFloor, `${r.buildId}/${r.route} never left floor 1`).toBeGreaterThan(1);
    }
    const bestFloor = Math.max(...results.map((r) => r.deepestFloor));
    expect(bestFloor).toBeGreaterThan(1);
  });
});
