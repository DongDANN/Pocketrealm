import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { colorHex } from '../../src/art/palette';
import { blit, createPixmap, fillRect, type Pixmap } from '../../src/art/px';
import { drawText, measureText, GLYPH_H } from '../../src/art/font5x7';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, Buffer.from(data), crcBuf]);
}

export function pixmapToRGBA(pix: Pixmap): Uint8Array {
  const rgba = new Uint8Array(pix.w * pix.h * 4);
  for (let i = 0; i < pix.data.length; i++) {
    const idx = pix.data[i]!;
    if (idx === 0) continue;
    const hex = colorHex(idx);
    rgba[i * 4] = parseInt(hex.slice(1, 3), 16);
    rgba[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    rgba[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

export function encodePNG(w: number, h: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== w * h * 4) throw new Error('RGBA buffer size mismatch');
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolor + alpha
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export function savePixmap(path: string, pix: Pixmap): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(pix.w, pix.h, pixmapToRGBA(pix)));
}

export function saveRGBA(path: string, w: number, h: number, rgba: Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(w, h, rgba));
}

export function scalePixmap(pix: Pixmap, factor: number): Pixmap {
  if (!Number.isInteger(factor) || factor < 1) throw new Error('Scale must be a positive integer');
  const out = createPixmap(pix.w * factor, pix.h * factor);
  for (let y = 0; y < pix.h; y++) {
    for (let x = 0; x < pix.w; x++) {
      const c = pix.data[y * pix.w + x]!;
      if (!c) continue;
      fillRect(out, x * factor, y * factor, factor, factor, c);
    }
  }
  return out;
}

export interface SheetOptions {
  background: number;
  title: string;
  subtitle?: string;
  titleColor: number;
  textColor: number;
  pad?: number;
}

/**
 * Lay out assets in a grid, each scaled by the supplied factor, with labels.
 */
export function contactSheet(
  items: readonly { pix: Pixmap; label: string; scale?: number }[],
  opts: SheetOptions,
): Pixmap {
  const pad = opts.pad ?? 12;
  const labelScale = 1;
  const labelH = GLYPH_H * labelScale + 4;
  const cellW = Math.max(
    100,
    ...items.map((it) => it.pix.w * (it.scale ?? 3) + pad * 2),
    measureText('0102030405060708') + 2,
  );
  const cellH = Math.max(...items.map((it) => it.pix.h * (it.scale ?? 3) + pad * 2 + labelH));
  const cols = Math.min(4, Math.max(1, items.length));
  const rows = Math.ceil(items.length / cols);
  const header = 34;
  const width = cols * cellW + pad * 2;
  const height = header + rows * cellH + pad * 2 + 24;
  const sheet = createPixmap(width, height, opts.background);
  drawText(sheet, pad, pad, opts.title, opts.titleColor, 2);
  if (opts.subtitle) {
    drawText(sheet, pad, pad + 18, opts.subtitle, opts.textColor, 1);
  }
  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * cellW;
    const y = header + row * cellH;
    fillRect(sheet, x + 2, y + 2, cellW - 4, cellH - 4, opts.background);
    const scale = item.scale ?? 3;
    const scaled = scalePixmap(item.pix, scale);
    const dx = x + Math.floor((cellW - scaled.w) / 2);
    const dy = y + pad + Math.floor((cellH - labelH - pad * 2 - scaled.h) / 2);
    blit(sheet, scaled, dx, dy);
    drawText(sheet, x + pad, y + cellH - labelH - 4, item.label, opts.textColor, labelScale);
  });
  drawText(
    sheet,
    pad,
    height - 14,
    'POCKETREALM ART PREVIEW - PALETTE LOCKED - NOT HAND-DRAWN',
    opts.textColor,
    1,
  );
  return sheet;
}

export function paletteSwatch(scale = 8, cols = 16): Pixmap {
  const rows = Math.ceil(64 / cols);
  const cell = 10 * scale;
  const sheet = createPixmap(cols * cell, rows * cell);
  for (let i = 0; i < 64; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    fillRect(sheet, x, y, cell, cell, i + 1);
  }
  // thin separators using ink so adjacent dark ramps remain distinguishable
  for (let i = 0; i < 64; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    fillRect(sheet, x, y, cell, 1, 1);
    fillRect(sheet, x, y, 1, cell, 1);
  }
  return sheet;
}
