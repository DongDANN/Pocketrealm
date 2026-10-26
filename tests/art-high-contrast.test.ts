import { describe, expect, it } from 'vitest';
import { C, colorHex, contrastRatio, highContrastColor } from '../src/art/palette';

const PANEL = '#151322';
const HIGH_CONTRAST_PANEL = '#0a0910';
const PAPER = '#fff6dd';

/** The tones screens actually paint text with, not every colour in the ramps. */
const TEXT_TONES = [
  C.paper1,
  C.paper2,
  C.paper3,
  C.amber1,
  C.amber2,
  C.amber3,
  C.moss1,
  C.moss2,
  C.ember1,
  C.cyan2,
];

describe('money and label contrast', () => {
  it('the default money tone clears AAA on the ledger panel', () => {
    expect(contrastRatio(colorHex(C.paper0), PANEL)).toBeGreaterThanOrEqual(7);
  });

  it('every text tone used on the dark panels clears AA before high contrast', () => {
    for (const tone of TEXT_TONES) {
      expect(contrastRatio(colorHex(tone), PANEL), colorHex(tone)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('high contrast text remapping', () => {
  it('raises every dark-panel text tone to AAA', () => {
    for (const tone of TEXT_TONES) {
      const mapped = highContrastColor(tone);
      expect(
        contrastRatio(colorHex(mapped), HIGH_CONTRAST_PANEL),
        colorHex(mapped),
      ).toBeGreaterThanOrEqual(7);
    }
  });

  it('keeps ink text dark on the paper panels', () => {
    for (const tone of [C.ink300, C.ink400, C.ink500]) {
      const mapped = highContrastColor(tone);
      expect(contrastRatio(colorHex(mapped), PAPER), colorHex(mapped)).toBeGreaterThanOrEqual(7);
    }
  });

  it('leaves the lightest tones alone', () => {
    expect(highContrastColor(C.paper0)).toBe(C.paper0);
    expect(highContrastColor(C.ink900)).toBe(C.ink900);
  });
});
