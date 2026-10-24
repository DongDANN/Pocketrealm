import { describe, expect, it } from 'vitest';
import { colorHex, MASTER_PALETTE } from '../src/art/palette';
import { createPixmap, fillRect } from '../src/art/px';
import { encodePNG } from '../scripts/lib/png';

describe('art palette', () => {
  it('has 64 unique master colors and no duplicates', () => {
    expect(MASTER_PALETTE).toHaveLength(65);
    const rest = MASTER_PALETTE.slice(1);
    expect(new Set(rest.map((c) => c.toLowerCase())).size).toBe(64);
  });

  it('rejects unknown colors', () => {
    expect(() => colorHex(999)).toThrow();
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
