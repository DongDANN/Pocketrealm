import { describe, expect, it } from 'vitest';
import { C, colorHex, MASTER_PALETTE } from '../src/art/palette';
import { createPixmap, fillRect } from '../src/art/px';
import { encodePNG } from '../scripts/lib/png';
import { encodeGif } from '../scripts/lib/gif';

describe('art palette', () => {
  it('has 64 unique master colors and no duplicates', () => {
    expect(MASTER_PALETTE).toHaveLength(65);
    const rest = MASTER_PALETTE.slice(1);
    expect(new Set(rest.map((c) => c.toLowerCase())).size).toBe(64);
  });

  it('rejects unknown colors', () => {
    expect(() => colorHex(999)).toThrow();
  });

  it('keeps money and UI text pairs at WCAG AA contrast', () => {
    const pairs: Array<[string, number, number]> = [
      ['money ink on parchment', C.ink900, C.paper0],
      ['money ink on paper rule', C.ink900, C.paper1],
      ['button ink on amber', C.ink900, C.amber2],
      ['paper on delve panel', C.paper0, C.ink700],
      ['secondary paper on delve panel', C.paper2, C.ink700],
      ['muted paper on delve panel', C.paper3, C.ink700],
      ['faint paper on delve panel', C.paper4, C.ink700],
      ['ink on parchment', C.ink500, C.paper0],
    ];
    for (const [name, foreground, background] of pairs) {
      expect(contrast(foreground, background), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('encodes a PNG with a valid signature', () => {
    const pix = createPixmap(4, 4, 1);
    fillRect(pix, 1, 1, 2, 2, 2);
    const png = encodePNG(pix.w, pix.h, rgba(pix));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  });
});

function contrast(a: number, b: number): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const high = Math.max(l1, l2);
  const low = Math.min(l1, l2);
  return (high + 0.05) / (low + 0.05);
}

function luminance(index: number): number {
  const hex = colorHex(index);
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function rgba(pix: ReturnType<typeof createPixmap>): Uint8Array {
  const out = new Uint8Array(pix.w * pix.h * 4);
  for (let i = 0; i < pix.data.length; i++) {
    const idx = pix.data[i] ?? 0;
    if (!idx) continue;
    const hex = colorHex(idx);
    out[i * 4] = parseInt(hex.slice(1, 3), 16);
    out[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    out[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('animated GIF export', () => {
  const frames = [createPixmap(3, 3, 1), createPixmap(3, 3, 2), createPixmap(3, 3, 3)];

  it('writes a looping GIF89a with one control block per frame', () => {
    const gif = Buffer.from(encodeGif(frames, 100));
    expect(gif.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    expect(gif.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
    expect(gif.includes(Buffer.from([0x21, 0xff, 0x0b]))).toBe(true);
    let controls = 0;
    let cursor = 0;
    const marker = Buffer.from([0x21, 0xf9, 0x04]);
    while ((cursor = gif.indexOf(marker, cursor)) !== -1) {
      controls += 1;
      cursor += marker.length;
    }
    expect(controls).toBe(frames.length);
    expect(gif.subarray(-1)[0]).toBe(0x3b);
  });

  it('rejects frames of different sizes and empty input', () => {
    expect(() => encodeGif([], 100)).toThrow(/at least one frame/);
    expect(() => encodeGif([createPixmap(2, 2, 1), createPixmap(3, 2, 1)], 100)).toThrow(
      /same dimensions/,
    );
  });
});
