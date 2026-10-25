import { describe, expect, it } from 'vitest';
import {
  ascend,
  burst,
  coverage,
  drawEffect,
  drawParticle,
  impact,
  puff,
  shockwave,
  slash,
  stepParticle,
  type Effect,
} from '../src/art/effects';
import { C, MASTER_PALETTE } from '../src/art/palette';
import { createPixmap, px } from '../src/art/px';

const EFFECTS: [string, Effect][] = [
  ['slash', slash(C.frost1)],
  ['impact', impact(C.amber2)],
  ['shockwave', shockwave(C.rose2)],
  ['ascend', ascend(C.moss2)],
  ['puff', puff(C.ink500)],
];

function opaque(pixmap: { data: Uint8Array }): number {
  let n = 0;
  for (const value of pixmap.data) if (value !== 0) n++;
  return n;
}

describe('delve effect strips', () => {
  it('gives every effect four or more distinct 32x32 frames', () => {
    for (const [name, effect] of EFFECTS) {
      expect(effect.frames.length, name).toBeGreaterThanOrEqual(4);
      expect(effect.fps, name).toBeGreaterThanOrEqual(12);
      for (const [i, frame] of effect.frames.entries()) {
        expect([frame.w, frame.h], `${name} frame ${i}`).toEqual([32, 32]);
        expect(opaque(frame), `${name} frame ${i} is empty`).toBeGreaterThan(0);
        for (const value of frame.data) {
          expect(value, `${name} frame ${i} palette`).toBeLessThan(MASTER_PALETTE.length);
        }
      }
      const hashes = effect.frames.map((frame) => Buffer.from(frame.data).toString('base64'));
      expect(new Set(hashes).size, `${name} repeats a frame`).toBe(hashes.length);
    }
  });

  it('thins out instead of ending solid, which is what makes it a hit and not a sticker', () => {
    for (const [name, effect] of EFFECTS) {
      const peak = Math.max(...effect.frames.map((_, i) => coverage(effect, i)));
      expect(coverage(effect, effect.frames.length - 1), name).toBeLessThan(peak);
    }
  });

  it('draws centred, so a caller never has to know the strip size', () => {
    const [name, effect] = EFFECTS[1]!;
    const target = createPixmap(64, 64);
    drawEffect(target, effect, 0, 32, 32);
    const blank = createPixmap(64, 64);
    drawEffect(blank, effect, 0, 16, 16);
    expect(opaque(target)).toBe(opaque(blank));
    expect(px(target, 32, 32)).not.toBe(0);
    expect(name).toBe('impact');
  });

  it('clips a strip drawn at the edge instead of writing outside the pixmap', () => {
    const [, effect] = EFFECTS[0]!;
    const target = createPixmap(20, 20);
    expect(() => drawEffect(target, effect, 0, 0, 0)).not.toThrow();
    expect(target.data.length).toBe(400);
  });
});

describe('delve particles', () => {
  it('throws the same debris for the same seed and different debris for a different one', () => {
    const a = burst(10, 20, C.ember2, 12, -1, 7);
    const b = burst(10, 20, C.ember2, 12, -1, 7);
    const c = burst(10, 20, C.ember2, 12, -1, 8);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    expect(a).toHaveLength(12);
  });

  it('aims the burst along the ground the caller is standing on', () => {
    const right = burst(10, 20, C.ember2, 8, 1, 3);
    const left = burst(10, 20, C.ember2, 8, -1, 3);
    expect(right.every((p) => p.vx > 0)).toBe(true);
    expect(left.every((p) => p.vx < 0)).toBe(true);
  });

  it('dies on its own clock rather than leaving dust on the stage', () => {
    const bounds = { w: 320, h: 180 };
    for (const p of burst(160, 90, C.ember2, 16, 1, 11, { ttl: 20 })) {
      let steps = 0;
      while (stepParticle(p, bounds) && steps < 600) steps++;
      expect(steps, 'particle never died').toBeLessThan(600);
      expect(steps).toBeGreaterThan(1);
    }
  });

  it('draws inside the frame and thins itself near the end of its life', () => {
    const target = createPixmap(8, 8);
    const [p] = burst(4, 4, C.rose2, 1, 1, 2);
    expect(() => drawParticle(target, p!)).not.toThrow();
    expect(opaque(target)).toBeGreaterThan(0);
    // Every other frame goes dark once a particle is most of the way through its life, which is the
    // only reason a 26-frame burst reads as debris settling rather than as a trail of dots.
    const spent = { ...p!, life: 20, ttl: 24 };
    const after = createPixmap(8, 8);
    drawParticle(after, spent);
    expect(opaque(after)).toBe(0);
    drawParticle(after, { ...spent, life: 19 });
    expect(opaque(after)).toBeGreaterThan(0);
  });
});
