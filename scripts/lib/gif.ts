/**
 * Animated GIF output for the art review sheets. Palette-indexed frames are handed
 * to gifenc unchanged, so previews use the exact same pixels and master palette as
 * the runtime sprites.
 */
import { writeFileSync } from 'node:fs';
import * as gifenc from 'gifenc';
import { MASTER_PALETTE } from '../../src/art/palette';
import type { Pixmap } from '../../src/art/px';

type EncoderFactory = typeof gifenc.GIFEncoder;

/**
 * gifenc ships an ESM build whose default export is the encoder function and a CJS
 * build whose default is the module object. Node's ESM loader picks CJS, Vite picks
 * ESM, so resolve the factory from either shape.
 */
function encoderFactory(): EncoderFactory {
  const ns = gifenc as unknown as {
    GIFEncoder?: EncoderFactory;
    default?: EncoderFactory | { GIFEncoder?: EncoderFactory };
  };
  if (typeof ns.GIFEncoder === 'function') return ns.GIFEncoder;
  if (typeof ns.default === 'function') return ns.default;
  if (ns.default && typeof ns.default.GIFEncoder === 'function') return ns.default.GIFEncoder;
  throw new Error('gifenc GIFEncoder is unavailable');
}

const GIFEncoder = encoderFactory();

const PALETTE = MASTER_PALETTE.map((hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]);

export function encodeGif(frames: readonly Pixmap[], delayMs: number): Uint8Array {
  if (frames.length === 0) throw new Error('Animated GIF needs at least one frame');
  const width = frames[0]!.w;
  const height = frames[0]!.h;
  for (const frame of frames) {
    if (frame.w !== width || frame.h !== height) {
      throw new Error('Animated GIF frames must share the same dimensions');
    }
  }
  const gif = GIFEncoder();
  frames.forEach((frame, i) => {
    gif.writeFrame(frame.data, width, height, {
      palette: i === 0 ? PALETTE : undefined,
      delay: delayMs,
      repeat: 0,
      transparent: true,
      transparentIndex: 0,
      dispose: 2,
    });
  });
  gif.finish();
  return gif.bytes();
}

export function saveGif(path: string, frames: readonly Pixmap[], delayMs: number): void {
  writeFileSync(path, encodeGif(frames, delayMs));
}
