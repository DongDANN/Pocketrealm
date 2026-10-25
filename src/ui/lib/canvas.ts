import { colorHex } from '../../art/palette';
import type { Pixmap } from '../../art/px';

export function deviceScale(): number {
  if (typeof window === 'undefined') return 1;
  const ratio = window.devicePixelRatio || 1;
  return ratio < 1 ? 1 : ratio;
}

/**
 * Art pixels must occupy a whole number of *device* pixels, which fractional DPR screens
 * (1.25, 1.5) make impossible at an integer CSS size. Return the backing-store size and the
 * CSS size that together keep every art pixel an identical integer block.
 */
export function pixelGrid(artPixels: number, scale: number, dpr = deviceScale()) {
  const css = artPixels * cssPerArtPixel(scale, dpr);
  return { backing: Math.round(css * dpr), css };
}

/** CSS pixels one art pixel occupies, so layout gaps can match the pixel grid exactly. */
export function cssPerArtPixel(scale: number, dpr = deviceScale()): number {
  return Math.max(1, Math.floor(Math.max(1, scale) * dpr)) / dpr;
}

/** Convert a palette-indexed pixmap to RGBA pixels without scaling. */
export function pixmapToImageData(pixmap: Pixmap): ImageData {
  const image = new ImageData(pixmap.w, pixmap.h);
  for (let i = 0; i < pixmap.data.length; i++) {
    const index = pixmap.data[i] ?? 0;
    if (index === 0) continue;
    const hex = colorHex(index);
    image.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    image.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    image.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    image.data[i * 4 + 3] = 255;
  }
  return image;
}

/** Render a palette-indexed pixmap into an offscreen canvas at 1x. */
export function pixmapToCanvas(pixmap: Pixmap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixmap.w;
  canvas.height = pixmap.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  ctx.putImageData(pixmapToImageData(pixmap), 0, 0);
  return canvas;
}
