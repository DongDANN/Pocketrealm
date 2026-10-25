import { describe, expect, it } from 'vitest';
import { buildWarden } from '../src/art/companion';
import { C } from '../src/art/palette';
import { px } from '../src/art/px';
import { SCENE_H, SCENE_W } from '../src/art/scenes/rootfall';
import {
  composeRealm,
  groundAt,
  periodForHour,
  plotBox,
  plotOf,
  REALM_BUILDINGS,
  type RealmPeriod,
} from '../src/art/scenes/realm';
import { sceneIssues } from '../scripts/lib/art-validate';

const PERIODS: RealmPeriod[] = ['dawn', 'day', 'dusk', 'night'];
const BUILT = Object.fromEntries(REALM_BUILDINGS.map((id) => [id, 2]));
const BARE = Object.fromEntries(REALM_BUILDINGS.map((id) => [id, 0]));
const warden = buildWarden().idle[0]!;

/** Every pixel of one palette index, so a light can be proven to be where it is claimed. */
function countColor(pixmap: ReturnType<typeof composeRealm>, color: number): number {
  let n = 0;
  for (const value of pixmap.data) if (value === color) n++;
  return n;
}

describe('realm diorama', () => {
  it('passes the shared scene validator, which covers every period and build state', () => {
    expect(sceneIssues()).toEqual([]);
  });

  it('maps the clock to four skies and never a fifth', () => {
    for (const hour of Array.from({ length: 24 }, (_, i) => i)) {
      expect(PERIODS).toContain(periodForHour(hour));
    }
    expect([periodForHour(3), periodForHour(6), periodForHour(12), periodForHour(19)]).toEqual([
      'night',
      'dawn',
      'day',
      'dusk',
    ]);
  });

  it('keeps the island surface one continuous curve, so nothing floats', () => {
    let previous = groundAt(19, 0);
    let jumps = 0;
    for (let x = 20; x < SCENE_W - 19; x++) {
      const y = groundAt(x, 0);
      if (Math.abs(y - previous) > 2) jumps++;
      previous = y;
    }
    expect(jumps).toBe(0);
    expect(groundAt(160, 0)).toBeLessThan(groundAt(160, 6));
  });

  it('puts every plot on the turf, not on the rim or in the sky', () => {
    for (const id of REALM_BUILDINGS) {
      const box = plotBox(id);
      const anchor = plotOf(id);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(SCENE_W);
      expect(box.y + box.h).toBeLessThanOrEqual(SCENE_H);
      // The plot sits on the surface curve, within the few rows of hand-placed depth.
      expect(Math.abs(anchor.y - groundAt(box.x + (box.w >> 1), 0))).toBeLessThanOrEqual(3);
      // The tap box covers the feet, or a tap just above them would select nothing.
      expect(box.y + box.h).toBeGreaterThan(anchor.y);
    }
  });

  it('shows an unbuilt plot as a bare post, and only lights it after sundown', () => {
    const day = composeRealm(2, 0, 'day', BARE, {});
    const night = composeRealm(2, 0, 'night', BARE, {});
    expect(countColor(day, C.amber1)).toBe(0);
    expect(countColor(night, C.amber1)).toBeGreaterThan(0);
  });

  it('never draws a building the player has not paid for', () => {
    const bare = composeRealm(2, 0, 'day', BARE, {});
    const built = composeRealm(2, 0, 'day', BUILT, {});
    // Building five towers repaints the sky above them not at all.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < SCENE_W; x++)
        expect(px(bare, x, y), `sky ${x},${y}`).toBe(px(built, x, y));
    }
    // Each plot changes on its own, so no building is hiding behind its neighbour's box.
    for (const id of REALM_BUILDINGS) {
      const one = composeRealm(2, 0, 'day', { [id]: 1 }, {});
      const box = plotBox(id);
      let inside = 0;
      for (let y = box.y; y < box.y + box.h; y++) {
        for (let x = box.x; x < box.x + box.w; x++) if (px(bare, x, y) !== px(one, x, y)) inside++;
      }
      expect(inside, `${id} did not change its own plot`).toBeGreaterThan(20);
    }
  });

  it('moves the layers by different whole amounts when the player looks around', () => {
    const centre = composeRealm(0, 0, 'day', BARE, {});
    const left = composeRealm(0, -1, 'day', BARE, {});
    let moved = 0;
    for (let y = 0; y < SCENE_H; y++) {
      for (let x = 0; x < SCENE_W - 2; x++) {
        if (px(centre, x, y) !== px(left, x, y)) moved++;
      }
    }
    expect(moved).toBeGreaterThan(0);
    // Integer parallax: no column is left uncovered at either end of the pan.
    for (const look of [-1, 1]) {
      const frame = composeRealm(0, look, 'day', BARE, {});
      expect(frame.data.some((value) => value === 0)).toBe(false);
    }
  });

  it('stands the companion on the turf rather than in front of it', () => {
    const withCompanion = composeRealm(0, 0, 'day', BARE, { companion: warden, companionX: 152 });
    const without = composeRealm(0, 0, 'day', BARE, {});
    let added = 0;
    for (let i = 0; i < withCompanion.data.length; i++)
      if (withCompanion.data[i] !== without.data[i]) added++;
    expect(added).toBeGreaterThan(200);
  });
});
