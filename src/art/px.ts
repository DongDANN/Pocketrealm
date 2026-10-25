/**
 * Code-first pixel drawing toolkit. Pure data, no DOM, usable from Node scripts.
 * All coordinates are integers. Sprite indices refer to the master palette; 0 is clear.
 */
import { colorIndex } from './palette';

export interface Pixmap {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

export function createPixmap(w: number, h: number, fill = 0): Pixmap {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) {
    throw new Error(`Invalid pixmap size ${w}x${h}`);
  }
  const data = new Uint8Array(w * h);
  if (fill) data.fill(fill);
  return { w, h, data };
}

export function clonePixmap(src: Pixmap): Pixmap {
  return { w: src.w, h: src.h, data: new Uint8Array(src.data) };
}

export function px(src: Pixmap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= src.w || y >= src.h) return 0;
  return src.data[y * src.w + x] ?? 0;
}

export function setPx(src: Pixmap, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= src.w || y >= src.h) return;
  if (!Number.isInteger(color) || color < 0 || color > 255) throw new Error(`Bad color ${color}`);
  src.data[y * src.w + x] = color;
}

export function fill(src: Pixmap, color: number): void {
  src.data.fill(color);
}

export function fillRect(
  src: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(src.w, x + w);
  const y1 = Math.min(src.h, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) src.data[yy * src.w + xx] = color;
  }
}

export function strokeRect(
  src: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  hline(src, x, x + w - 1, y, color);
  hline(src, x, x + w - 1, y + h - 1, color);
  vline(src, x, y, y + h - 1, color);
  vline(src, x + w - 1, y, y + h - 1, color);
}

export function hline(src: Pixmap, x0: number, x1: number, y: number, color: number): void {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  for (let x = a; x <= b; x++) setPx(src, x, y, color);
}

export function vline(src: Pixmap, x: number, y0: number, y1: number, color: number): void {
  const a = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  for (let y = a; y <= b; y++) setPx(src, x, y, color);
}

/** Bresenham line. */
export function line(
  src: Pixmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const ex = Math.round(x1);
  const ey = Math.round(y1);
  const dx = Math.abs(ex - x);
  const dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1;
  const sy = y < ey ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    setPx(src, x, y, color);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Filled midpoint ellipse. */
export function fillEllipse(
  src: Pixmap,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
): void {
  if (rx <= 0 || ry <= 0) return;
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry);
    if (t < 0) continue;
    const span = Math.floor(rx * Math.sqrt(t) + 0.35);
    hline(src, cx - span, cx + span, cy + y, color);
  }
}

export function ellipse(
  src: Pixmap,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
): void {
  let x = 0;
  let y = ry;
  let d1 = ry * ry - rx * rx * ry + 0.25 * rx * rx;
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;
  while (dx < dy) {
    setPx(src, cx + x, cy + y, color);
    setPx(src, cx - x, cy + y, color);
    setPx(src, cx + x, cy - y, color);
    setPx(src, cx - x, cy - y, color);
    if (d1 < 0) {
      x++;
      dx += 2 * ry * ry;
      d1 += dx + ry * ry;
    } else {
      x++;
      y--;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d1 += dx - dy + ry * ry;
    }
  }
  let d2 = ry * ry * (x + 0.5) * (x + 0.5) + rx * rx * (y - 1) * (y - 1) - rx * rx * ry * ry;
  while (y >= 0) {
    setPx(src, cx + x, cy + y, color);
    setPx(src, cx - x, cy + y, color);
    setPx(src, cx + x, cy - y, color);
    setPx(src, cx - x, cy - y, color);
    if (d2 > 0) {
      y--;
      dy -= 2 * rx * rx;
      d2 += rx * rx - dy;
    } else {
      y--;
      x++;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d2 += dx - dy + rx * rx;
    }
  }
}

/** Scanline polygon fill; points are integer vertices. */
export function fillPolygon(src: Pixmap, points: readonly [number, number][], color: number): void {
  if (points.length < 3) return;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(Math.round(a[0] + t * (b[0] - a[0])));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      hline(src, xs[i]!, xs[i + 1]! - 1, y, color);
    }
  }
}

export interface BlitOptions {
  mirrorX?: boolean;
  flipY?: boolean;
  /** Only draw non-transparent source pixels (default true). */
  skipClear?: boolean;
}

export function blit(
  dest: Pixmap,
  src: Pixmap,
  dx: number,
  dy: number,
  opts: BlitOptions = {},
): void {
  const skipClear = opts.skipClear ?? true;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const sx = opts.mirrorX ? src.w - 1 - x : x;
      const sy = opts.flipY ? src.h - 1 - y : y;
      const c = src.data[sy * src.w + sx] ?? 0;
      if (c === 0 && skipClear) continue;
      setPx(dest, dx + x, dy + y, c);
    }
  }
}

export function mirrorX(src: Pixmap): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < Math.floor(src.w / 2); x++) {
      const a = y * src.w + x;
      const b = y * src.w + (src.w - 1 - x);
      const tmp = src.data[a]!;
      src.data[a] = src.data[b]!;
      src.data[b] = tmp;
    }
  }
}

/** Adds a 1px outline around opaque pixels, on transparent pixels only. */
export function outline(src: Pixmap, color: number): void {
  const copy = clonePixmap(src);
  for (let y = 0; y < copy.h; y++) {
    for (let x = 0; x < copy.w; x++) {
      if (px(copy, x, y) !== 0) continue;
      if (
        px(copy, x - 1, y) !== 0 ||
        px(copy, x + 1, y) !== 0 ||
        px(copy, x, y - 1) !== 0 ||
        px(copy, x, y + 1) !== 0
      ) {
        setPx(src, x, y, color);
      }
    }
  }
}

/**
 * Selective outline: dark tinted shadow on lower-right edges, rim light on upper-left edges.
 */
export function selout(src: Pixmap, shadow: number, rim: number): void {
  const copy = clonePixmap(src);
  for (let y = 0; y < copy.h; y++) {
    for (let x = 0; x < copy.w; x++) {
      if (px(copy, x, y) !== 0) continue;
      const lightHit = px(copy, x + 1, y + 1) !== 0; // light comes from top-left => edge below-right is lit
      const darkHit = px(copy, x - 1, y) !== 0 || px(copy, x, y - 1) !== 0;
      if (lightHit) setPx(src, x, y, rim);
      else if (darkHit) setPx(src, x, y, shadow);
      else if (
        px(copy, x + 1, y) !== 0 ||
        px(copy, x, y + 1) !== 0 ||
        px(copy, x - 1, y) !== 0 ||
        px(copy, x, y - 1) !== 0
      ) {
        setPx(src, x, y, shadow);
      }
    }
  }
}

const BAYER2 = [0, 2, 3, 1];
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function ditherRect(
  src: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  a: number,
  b: number,
  pattern: 2 | 4 = 4,
  threshold = 0.5,
): void {
  const matrix = pattern === 2 ? BAYER2 : BAYER4;
  const size = pattern;
  const denom = size * size;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const m = matrix[(yy % size) * size + (xx % size)]!;
      const on = (m + 0.5) / denom < threshold;
      setPx(src, x + xx, y + yy, on ? a : b);
    }
  }
}

export function ditherCircle(
  src: Pixmap,
  cx: number,
  cy: number,
  r: number,
  color: number,
  pattern: 2 | 4 = 4,
  density = 0.5,
): void {
  const matrix = pattern === 2 ? BAYER2 : BAYER4;
  const size = pattern;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const m = matrix[((y + r) % size) * size + ((x + r) % size)]!;
      if ((m + 0.5) / (size * size) < density) setPx(src, cx + x, cy + y, color);
    }
  }
}

/**
 * Auto-lighting from a height map: 0 = deepest, max = highest.
 * Light from top-left; shadows drift toward violet through the supplied ramp.
 */
export function autoLight(
  src: Pixmap,
  height: Uint8Array,
  ramp: readonly number[],
  opts: { rim?: number; ao?: number; bias?: number } = {},
): void {
  if (height.length !== src.data.length) throw new Error('Height map must match pixmap');
  const levels = ramp.length;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      if (src.data[i] === 0) continue;
      const h = height[i]! / 255;
      const hUpLeft = x > 0 && y > 0 ? height[i - src.w - 1]! / 255 : h;
      const directional = Math.max(0, h - hUpLeft) * 0.9;
      const t = h * 0.9 + directional + (opts.bias ?? 0);
      let level = Math.min(levels - 1, Math.max(0, Math.round(t * (levels - 1))));
      const topEdge = y > 0 && src.data[i - src.w] === 0;
      if (topEdge) level = Math.min(levels - 1, level + 1);
      src.data[i] = ramp[level]!;
    }
  }
  if (opts.ao) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x;
        if (src.data[i] === 0) continue;
        const below = y + 1 < src.h ? src.data[i + src.w] : 0;
        const right = x + 1 < src.w ? src.data[i + 1] : 0;
        if (below === 0 || right === 0) {
          if ((x + y) % 3 === 0) src.data[i] = opts.ao;
        }
      }
    }
  }
  if (opts.rim) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x;
        if (src.data[i] === 0) continue;
        const above = y > 0 ? src.data[i - src.w] : 0;
        if (above === 0 && (x + y) % 2 === 0) src.data[i] = opts.rim;
      }
    }
  }
}

/** A simple deterministic value-noise helper for textures. */
export function hash2(x: number, y: number, seed = 0x9e3779b9): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function speckle(
  src: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  density: number,
  seed = 1,
): void {
  const cutoff = Math.floor(density * 0xffffffff);
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (hash2(xx, yy, seed) < cutoff) setPx(src, xx, yy, color);
    }
  }
}

export function shadeRow(
  src: Pixmap,
  x0: number,
  x1: number,
  y: number,
  ramp: readonly number[],
  t: number,
): void {
  const idx = Math.min(ramp.length - 1, Math.max(0, Math.round(t * (ramp.length - 1))));
  hline(src, x0, x1, y, ramp[idx]!);
}

/**
 * Drops a share of the opaque pixels by hash. A death animation needs to thin out, not fade to
 * grey, and this keeps the palette-locked silhouette until the last pixels go.
 */
export function dissolve(src: Pixmap, amount: number, seed = 29): void {
  if (amount <= 0) return;
  const cutoff = Math.min(99, Math.round(amount * 100));
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = y * src.w + x;
      if (src.data[i] === 0) continue;
      if (hash2(x, y, seed) % 100 < cutoff) src.data[i] = 0;
    }
  }
}

/** Palette indices for a named hex list (convenience for art code). */
export function colors(hexes: readonly string[]): number[] {
  return hexes.map(colorIndex);
}
