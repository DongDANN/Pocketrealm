import { describe, expect, it } from 'vitest';
import { SPECIES, speciesByKey, type SpeciesPart } from '../src/core/companion';
import { MASTER_PALETTE } from '../src/art/palette';
import { speciesIdleFrames, speciesSprite, STAGE_PX } from '../src/art/species';

function counts(pixmap: { data: Uint8Array }): number {
  let drawn = 0;
  for (const index of pixmap.data) if (index !== 0) drawn++;
  return drawn;
}

function colorsOf(pixmap: { data: Uint8Array }): Set<number> {
  const seen = new Set<number>();
  for (const index of pixmap.data) if (index !== 0) seen.add(index);
  return seen;
}

describe('species sprites', () => {
  it('draws every species on the shared 32x32 stage', () => {
    for (const species of SPECIES) {
      const sprite = speciesSprite(species);
      expect(sprite.w, species.key).toBe(STAGE_PX);
      expect(sprite.h, species.key).toBe(STAGE_PX);
      expect(counts(sprite), species.key).toBeGreaterThan(20);
    }
  });

  it('leaves the stage corners transparent so sprites tile without a box', () => {
    for (const species of SPECIES) {
      const sprite = speciesSprite(species);
      expect(sprite.data[0]).toBe(0);
      expect(sprite.data[STAGE_PX * STAGE_PX - 1]).toBe(0);
    }
  });

  it('uses only master-palette colors', () => {
    for (const species of SPECIES) {
      for (const index of colorsOf(speciesSprite(species))) {
        expect(MASTER_PALETTE[index], `${species.key} index ${index}`).toBeTruthy();
      }
    }
  });

  it('gives each species its own silhouette', () => {
    const [a, b, c] = SPECIES.map((species) => speciesSprite(species));
    expect(a!.data).not.toEqual(b!.data);
    expect(b!.data).not.toEqual(c!.data);
  });

  it('is deterministic, so a re-render never shuffles the companion', () => {
    for (const species of SPECIES) {
      expect(speciesSprite(species).data).toEqual(speciesSprite(species).data);
    }
  });

  it('grows the sprite as the companion levels, without changing its body', () => {
    const mossling = speciesByKey('mossling')!;
    const stage1 = counts(speciesSprite(mossling, 1));
    const stage2 = counts(speciesSprite(mossling, 2));
    const stage3 = counts(speciesSprite(mossling, 3));
    const stage4 = counts(speciesSprite(mossling, 4));
    expect(stage2).toBeGreaterThan(stage1);
    expect(stage3).toBeGreaterThan(stage2);
    expect(stage4).toBeGreaterThan(stage3);
  });

  it('never draws an unknown species key by throwing', () => {
    const stranger = { key: 'nobody', name: 'Nobody', blurb: '', build: SPECIES[0]!.build };
    expect(counts(speciesSprite(stranger))).toBeGreaterThan(20);
  });

  it('paints each role its own color so eyes read against the body', () => {
    for (const species of SPECIES) {
      expect(colorsOf(speciesSprite(species)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws each core shape differently, so a species recipe means something', () => {
    const box = { x: 8, y: 4, w: 12, h: 22 };
    const round = counts(single('round', box));
    const oval = rowWidths(single('oval', box)).length;
    const blob = counts(single('blob', box));
    const drop = rowWidths(single('drop', box));

    // A ball is taller than the same box squashed into an oval.
    expect(rowWidths(single('round', box)).length).toBeGreaterThan(oval);
    // A blob carries straight sides a ball cannot have.
    expect(blob).toBeGreaterThan(round);
    // A drop comes to a point: narrow at the top, wide along the bottom.
    expect(drop[0]!).toBeLessThan(drop[drop.length - 1]!);
  });
});

/** One part in a box, on a known palette, so a shape test measures only the shape. */
function single(shape: SpeciesPart['shape'], box: { x: number; y: number; w: number; h: number }) {
  return speciesSprite({
    key: 'mossling',
    name: 'Probe',
    blurb: '',
    build: [{ id: 'probe', shape, role: 'body', ...box }],
  });
}

/** Drawn width per row, empty rows dropped, so taper is readable as a list. */
function rowWidths(pixmap: { w: number; h: number; data: Uint8Array }): number[] {
  const widths: number[] = [];
  for (let y = 0; y < pixmap.h; y++) {
    let width = 0;
    for (let x = 0; x < pixmap.w; x++) if (pixmap.data[y * pixmap.w + x] !== 0) width++;
    if (width > 0) widths.push(width);
  }
  return widths;
}

describe('species idle animation', () => {
  it('breathes in two frames without losing a pixel', () => {
    const species = speciesByKey('mossling')!;
    const [rest, dip] = speciesIdleFrames(species);
    expect(rest!.data).not.toEqual(dip!.data);
    expect(counts(dip!)).toBe(counts(rest!));
    expect(rest!.w).toBe(STAGE_PX);
    expect(dip!.h).toBe(STAGE_PX);
  });

  it('keeps the same evolution stage across frames', () => {
    const species = speciesByKey('tollbug')!;
    const frames = speciesIdleFrames(species, 3);
    expect(frames).toHaveLength(2);
    for (const frame of frames)
      expect(counts(frame)).toBeGreaterThan(counts(speciesSprite(species, 1)));
  });
});
