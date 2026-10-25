import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  ELITES,
  ENEMIES,
  HOLLOW_FLOORS,
  flattenRooms,
  floorSeed,
  generateFloor,
  type HollowId,
} from '../src/core/delve';

describe('delve map generation', () => {
  it('is deterministic for the same seed, hollow, and floor', () => {
    for (const hollow of [1, 2, 3] as const) {
      for (let floor = 1; floor <= HOLLOW_FLOORS[hollow]; floor++) {
        expect(generateFloor(0x1234, hollow, floor)).toEqual(generateFloor(0x1234, hollow, floor));
        expect(generateFloor(0xbeef, hollow, floor)).toEqual(generateFloor(0xbeef, hollow, floor));
      }
    }
  });

  it('derives a distinct seed per floor, hollow, and user seed', () => {
    expect(floorSeed(42, 1, 1)).not.toBe(floorSeed(42, 1, 2));
    expect(floorSeed(42, 1, 1)).not.toBe(floorSeed(42, 2, 1));
    expect(floorSeed(42, 1, 1)).not.toBe(floorSeed(43, 1, 1));
  });

  it('builds 3-5 rows with a single first skirmish row and a single final row', () => {
    for (const hollow of [1, 2, 3] as const) {
      for (let floor = 1; floor <= HOLLOW_FLOORS[hollow]; floor++) {
        const plan = generateFloor(7, hollow, floor);
        expect(plan.floor).toBe(floor);
        expect(plan.rows.length).toBeGreaterThanOrEqual(3);
        expect(plan.rows.length).toBeLessThanOrEqual(5);
        expect(plan.rows[0]).toHaveLength(1);
        expect(plan.rows[0]![0]!.kind).toBe('skirmish');
        const last = plan.rows[plan.rows.length - 1]!;
        expect(last).toHaveLength(1);
        const isBossFloor = floor === HOLLOW_FLOORS[hollow];
        expect(last[0]!.kind).toBe(isBossFloor ? 'boss' : 'rest');
        for (let r = 1; r < plan.rows.length - 1; r++) {
          expect(plan.rows[r]!.length).toBeGreaterThanOrEqual(2);
          expect(plan.rows[r]!.length).toBeLessThanOrEqual(3);
        }
        for (let r = 0; r < plan.rows.length; r++) {
          for (let c = 0; c < plan.rows[r]!.length; c++) {
            expect(plan.rows[r]![c]!.id).toBe(`f${floor}r${r}c${c}`);
          }
        }
      }
    }
  });

  it('keeps elites off floors 1-3', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const hollow of [1, 2, 3] as const) {
        for (let floor = 1; floor <= 3; floor++) {
          const plan = generateFloor(seed, hollow, floor);
          for (const row of plan.rows) {
            for (const room of row) expect(room.kind).not.toBe('elite');
          }
        }
      }
    }
  });

  it('spawns 2-enemy skirmishes only from floor 5, and they do occur', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const hollow of [1, 2, 3] as const) {
        for (let floor = 1; floor <= 4; floor++) {
          const plan = generateFloor(seed, hollow, floor);
          for (const row of plan.rows) {
            for (const room of row) expect(room.enemies.length).toBeLessThanOrEqual(1);
          }
        }
      }
    }
    let sawPair = false;
    for (let seed = 0; seed < 40 && !sawPair; seed++) {
      for (const hollow of [1, 2, 3] as const) {
        for (let floor = 5; floor <= HOLLOW_FLOORS[hollow] && !sawPair; floor++) {
          const plan = generateFloor(seed, hollow, floor);
          for (const row of plan.rows) {
            for (const room of row) if (room.enemies.length === 2) sawPair = true;
          }
        }
      }
    }
    expect(sawPair).toBe(true);
  });

  it('picks the right enemy pools per hollow and room kind', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const hollow of [1, 2, 3] as HollowId[]) {
        const plan = generateFloor(seed, hollow, 4);
        const pool = new Set(ENEMIES.filter((e) => e.hollow === hollow).map((e) => e.id));
        for (const row of plan.rows) {
          for (const room of row) {
            if (room.kind === 'skirmish') {
              for (const id of room.enemies) expect(pool.has(id)).toBe(true);
            }
            if (room.kind === 'elite') expect(room.enemies).toEqual([ELITES[hollow - 1]!.id]);
            if (room.kind === 'boss') expect(room.enemies).toEqual([BOSSES[hollow - 1]!.id]);
          }
        }
      }
    }
  });

  it('resolves rows through flattenRooms', () => {
    const plan = generateFloor(11, 1, 4);
    const flat = flattenRooms(plan, []);
    expect(flat).toHaveLength(plan.rows.length);
    for (let r = 0; r < plan.rows.length; r++) {
      expect(flat[r]).toBe(plan.rows[r]![0]);
    }
    const picks = plan.rows.map((row) => (row.length > 1 ? 1 : 0));
    const flat2 = flattenRooms(plan, picks);
    for (let r = 0; r < plan.rows.length; r++) {
      const row = plan.rows[r]!;
      expect(flat2[r]).toBe(row[Math.min(picks[r] ?? 0, row.length - 1)]);
    }
  });
});
