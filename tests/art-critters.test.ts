import { describe, expect, it } from 'vitest';
import { C, MASTER_PALETTE } from '../src/art/palette';
import type { Pixmap } from '../src/art/px';
import {
  bestiaryIds,
  buildCritter,
  critterRecipe,
  enemyFrames,
  unartoredIds,
} from '../src/art/critters';
import { BOSSES, ELITES, ENEMIES } from '../src/core/delve/data/enemies';
import { silhouetteDistance } from '../scripts/lib/art-validate';

const SETS = ['idle', 'attack', 'hurt', 'faint'] as const;
const MIN_FRAMES: Record<(typeof SETS)[number], number> = { idle: 4, attack: 5, hurt: 3, faint: 3 };

function opaque(frame: Pixmap): number {
  return frame.data.reduce((count, value) => (value === 0 ? count : count + 1), 0);
}

function mask(frame: Pixmap): Uint8Array {
  const out = new Uint8Array(frame.data.length);
  for (let i = 0; i < frame.data.length; i++) out[i] = frame.data[i] ? 1 : 0;
  return out;
}

describe('bestiary sprite families', () => {
  it('has a family for every bestiary id', () => {
    expect(unartoredIds()).toEqual([]);
    expect(bestiaryIds()).toHaveLength(ENEMIES.length + ELITES.length + BOSSES.length);
  });

  it('draws palette-locked 32x32 frames with the minimum pose counts', () => {
    for (const id of bestiaryIds()) {
      const frames = enemyFrames(id);
      expect(frames, id).not.toBeNull();
      for (const set of SETS) {
        const poses = frames![set];
        expect(poses.length, `${id}.${set}`).toBeGreaterThanOrEqual(MIN_FRAMES[set]);
        for (const [index, frame] of poses.entries()) {
          expect([frame.w, frame.h], `${id}.${set} frame ${index + 1}`).toEqual([32, 32]);
          expect(frame.data.length, `${id}.${set} frame ${index + 1}`).toBe(32 * 32);
          for (const value of frame.data) {
            expect(value, `${id}.${set} frame ${index + 1} palette`).toBeLessThan(
              MASTER_PALETTE.length,
            );
          }
          expect(opaque(frame), `${id}.${set} frame ${index + 1} is empty`).toBeGreaterThan(0);
        }
        const hashes = new Set(poses.map((frame) => Buffer.from(frame.data).toString('base64')));
        expect(hashes.size, `${id}.${set} has frozen frames`).toBe(poses.length);
      }
    }
  });

  it('thins out across the faint set', () => {
    for (const id of bestiaryIds()) {
      const frames = enemyFrames(id)!;
      const [first, last] = [frames.faint[0]!, frames.faint[frames.faint.length - 1]!];
      expect(opaque(last)).toBeLessThan(opaque(first));
    }
  });

  it('gives every species its own silhouette', () => {
    const shapes = bestiaryIds().map((id) => {
      const frames = enemyFrames(id)!;
      return [id, mask(frames.idle[1] ?? frames.idle[0]!)] as const;
    });
    let closest = 1;
    for (let i = 0; i < shapes.length; i++) {
      for (let j = i + 1; j < shapes.length; j++) {
        const [idA, a] = shapes[i]!;
        const [idB, b] = shapes[j]!;
        const distance = silhouetteDistance(a, b);
        if (distance < closest) closest = distance;
        expect(distance, `${idA} and ${idB} read as the same shape`).toBeGreaterThanOrEqual(0.18);
      }
    }
  });

  it('keeps bodies mid-tone so sprites read on dark ground', () => {
    for (const id of bestiaryIds()) {
      for (const set of SETS) {
        for (const frame of enemyFrames(id)![set]) {
          const bright = frame.data.filter(
            (value) => value === C.paper0 || value === C.paper1,
          ).length;
          const opaqueCount = opaque(frame);
          expect(bright / opaqueCount, `${id}.${set} blown out`).toBeLessThanOrEqual(0.15);
        }
      }
    }
  });

  it('is a pure function of the recipe', () => {
    for (const id of bestiaryIds()) {
      const recipe = critterRecipe(id);
      if (!recipe) continue;
      const again = buildCritter(recipe);
      expect(Buffer.from(again.idle[0]!.data)).toEqual(Buffer.from(enemyFrames(id)!.idle[0]!.data));
    }
  });

  it('spreads the roster across every archetype', () => {
    const used = new Set<string>();
    for (const id of bestiaryIds()) {
      const recipe = critterRecipe(id);
      if (recipe) used.add(recipe.archetype);
    }
    for (const archetype of ['crawler', 'blob', 'rootfist', 'floater', 'beast', 'husk']) {
      expect(used, `archetype ${archetype} unused`).toContain(archetype);
    }
  });
});
