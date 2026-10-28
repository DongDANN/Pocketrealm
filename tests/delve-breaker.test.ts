/**
 * Gate 1.6f — Breaker persona (SPEC 6.11 N, restated by DELVE_REDESIGN §6). Oil now buys a run, so
 * one paid run is the unit. The max sweep proves every build clears the Heat 5 Hollow 3 ceiling at
 * full power; the rush probe proves an empty account cannot skip the game in one run the moment the
 * gate opens. The rounds-per-floor objective from §11 lands with the 4-skill sets in 7c.
 */

import { describe, expect, it } from 'vitest';
import { BUILDS, HEAT_MAX, HOLLOW_FLOORS, CODEX_SPECIES } from '../src/core/delve';
import { BUILDINGS, BUILDING_POWER_CAP, buildingPower } from '../src/core/delve/buildings';
import {
  BREAKER_LEVEL,
  BREAKER_ROUTES,
  BREAKER_RUSH_LEVEL,
  buildMaxMeta,
  runBreaker,
} from '../scripts/sim-delve';

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
  const maxed = runBreaker(SEEDS);
  const rush = runBreaker(SEEDS, { level: BREAKER_RUSH_LEVEL, maxed: false });

  it('sweeps every build and route at the ceiling', () => {
    expect(maxed).toHaveLength(BUILDS.length * BREAKER_ROUTES.length);
    for (const r of maxed) {
      expect(r.level).toBe(BREAKER_LEVEL);
      expect(r.heat).toBe(HEAT_MAX);
      expect(r.floorTarget).toBe(HOLLOW_FLOORS[3]);
    }
  });

  it('lets every build at full power clear the Heat 5 ceiling in one run', () => {
    const dead = maxed.filter((r) => !r.cleared);
    expect(dead.map((d) => `${d.buildId}/${d.route}`)).toEqual([]);
  });

  it('no empty account one-runs the deepest Hollow the moment its gate opens', () => {
    expect(rush).toHaveLength(BUILDS.length * BREAKER_ROUTES.length);
    const rushed = rush.filter((r) => r.cleared);
    expect(rushed.map((d) => `${d.buildId}/${d.route}`)).toEqual([]);
  });

  it('still makes progress, so neither sweep is vacuous', () => {
    for (const r of [...maxed, ...rush]) {
      expect(r.steps, `${r.buildId}/${r.route} took no steps`).toBeGreaterThan(0);
      expect(r.deepestFloor, `${r.buildId}/${r.route} never left floor 1`).toBeGreaterThan(1);
    }
    const bestRushFloor = Math.max(...rush.map((r) => r.deepestFloor));
    expect(bestRushFloor).toBeGreaterThan(1);
  });
});
