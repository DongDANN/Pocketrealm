import { describe, expect, it } from 'vitest';
import { createPixmap } from '../src/art/px';
import { UI_ASSETS } from '../src/art/ui';
import {
  artSpecs,
  previewCounts,
  uiAssetCount,
  validateArt,
  validateExports,
  validateFrames,
  type FrameSpec,
} from '../scripts/lib/art-validate';

describe('art validator', () => {
  it('passes the shipped Gate 0.5 set and generated exports', () => {
    expect(validateArt()).toEqual([]);
  });

  it('has unique keys and the minimum companion/enemy frame counts', () => {
    const specs = artSpecs();
    const keys = specs.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(specs.find((spec) => spec.key === 'companion.warden.idle')?.frames).toHaveLength(6);
    expect(specs.find((spec) => spec.key === 'enemy.tollbug.attack')?.frames).toHaveLength(5);
    expect(specs.filter((spec) => spec.key.startsWith('ui.')).map((spec) => spec.key)).toEqual(
      UI_ASSETS.map((asset) => asset.key),
    );
  });

  it('flags wrong canvas sizes, bad palette indices and empty frames', () => {
    const wrongSize = createPixmap(2, 2, 1);
    const badPalette = createPixmap(4, 4, 1);
    badPalette.data[3] = 250;
    const empty = createPixmap(4, 4);
    const spec: FrameSpec = {
      key: 'test.broken',
      frames: [wrongSize, badPalette, empty],
      width: 4,
      height: 4,
      minFrames: 4,
      distinctFrames: true,
    };
    const messages = validateFrames(spec).map((issue) => issue.message);
    expect(messages).toContain('is 2x2, expected 4x4');
    expect(messages).toContain('uses palette index 250, max 64');
    expect(messages).toContain('is fully transparent');
    expect(messages).toContain('has 3 frames, needs at least 4');
  });

  it('flags frozen animations', () => {
    const frame = createPixmap(4, 4, 2);
    const spec: FrameSpec = {
      key: 'test.frozen',
      frames: [frame, createPixmap(4, 4, 2)],
      width: 4,
      height: 4,
      minFrames: 2,
      distinctFrames: true,
    };
    expect(validateFrames(spec)).toEqual([
      { key: 'test.frozen', message: 'frames 1 and 2 are identical' },
    ]);
  });

  it('reports missing exports instead of silently passing', () => {
    const { pngs, gifs } = previewCounts();
    const issues = validateExports('missing-art-root');
    expect(issues).toHaveLength(pngs + gifs + uiAssetCount());
    expect(issues.every((issue) => issue.message.includes('is missing'))).toBe(true);
  });
});
