/**
 * Palette, canvas, frame and exported-file checks for the Gate 0.5 art set.
 * Pure Node so both the CLI and Vitest can use it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MASTER_PALETTE } from '../../src/art/palette';
import type { Pixmap } from '../../src/art/px';
import { buildWarden } from '../../src/art/companion';
import { buildTollbug } from '../../src/art/enemies';
import { FLAME_FRAMES, TORCH } from '../../src/art/tiles';
import { UI_ASSETS } from '../../src/art/ui';
import { composeRoomPreview, rootfallScene } from '../../src/art/scenes/rootfall';

export interface FrameSpec {
  key: string;
  frames: readonly Pixmap[];
  width: number;
  height: number;
  minFrames: number;
  distinctFrames: boolean;
}

export interface ArtIssue {
  key: string;
  message: string;
}

const MAX_INDEX = MASTER_PALETTE.length - 1;

function uiSize(key: string): [number, number] {
  if (key.startsWith('ui.button.')) return [24, 16];
  if (key === 'ui.icon.backspace') return [10, 8];
  if (key.startsWith('ui.icon.')) return [16, 16];
  return [24, 24];
}

export function artSpecs(): FrameSpec[] {
  const warden = buildWarden();
  const bug = buildTollbug();
  const scene = rootfallScene();
  const base: FrameSpec[] = [
    {
      key: 'companion.warden.idle',
      frames: warden.idle,
      width: 48,
      height: 48,
      minFrames: 6,
      distinctFrames: true,
    },
    {
      key: 'companion.warden.attack',
      frames: warden.attack,
      width: 48,
      height: 48,
      minFrames: 6,
      distinctFrames: true,
    },
    {
      key: 'companion.warden.portrait',
      frames: [warden.portrait],
      width: 64,
      height: 64,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'enemy.tollbug.idle',
      frames: bug.idle,
      width: 32,
      height: 32,
      minFrames: 4,
      distinctFrames: true,
    },
    {
      key: 'enemy.tollbug.attack',
      frames: bug.attack,
      width: 32,
      height: 32,
      minFrames: 5,
      distinctFrames: true,
    },
    {
      key: 'tile.torch',
      frames: [TORCH],
      width: 16,
      height: 24,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'tile.flame',
      frames: FLAME_FRAMES,
      width: 16,
      height: 16,
      minFrames: 3,
      distinctFrames: true,
    },
    {
      key: 'scene.rootfall.far',
      frames: [scene.far],
      width: 320,
      height: 180,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'scene.rootfall.main',
      frames: [scene.main],
      width: 320,
      height: 180,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'scene.rootfall.fore',
      frames: [scene.fore],
      width: 320,
      height: 180,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'scene.rootfall.vignette',
      frames: [scene.vignette],
      width: 320,
      height: 180,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'effect.lanternGlow',
      frames: [scene.lanternGlow],
      width: 23,
      height: 23,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'effect.torchGlow',
      frames: [scene.torchGlow],
      width: 19,
      height: 19,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'effect.flare',
      frames: [scene.flare],
      width: 11,
      height: 11,
      minFrames: 1,
      distinctFrames: false,
    },
    {
      key: 'scene.rootfall.composite',
      frames: [composeRoomPreview(2)],
      width: 320,
      height: 180,
      minFrames: 1,
      distinctFrames: false,
    },
  ];
  const ui = UI_ASSETS.map(({ key, pix }): FrameSpec => {
    const [width, height] = uiSize(key);
    return { key, frames: [pix], width, height, minFrames: 1, distinctFrames: false };
  });
  return [...base, ...ui];
}

export function validateFrames(spec: FrameSpec): ArtIssue[] {
  const issues: ArtIssue[] = [];
  if (spec.frames.length < spec.minFrames) {
    issues.push({
      key: spec.key,
      message: `has ${spec.frames.length} frames, needs at least ${spec.minFrames}`,
    });
  }
  for (const [index, frame] of spec.frames.entries()) {
    const label = `${spec.key} frame ${index + 1}`;
    if (frame.w !== spec.width || frame.h !== spec.height) {
      issues.push({
        key: label,
        message: `is ${frame.w}x${frame.h}, expected ${spec.width}x${spec.height}`,
      });
    }
    if (frame.data.length !== frame.w * frame.h) {
      issues.push({
        key: label,
        message: `has ${frame.data.length} pixels for a ${frame.w}x${frame.h} canvas`,
      });
    }
    const badIndex = frame.data.find((value) => value > MAX_INDEX);
    if (badIndex !== undefined) {
      issues.push({ key: label, message: `uses palette index ${badIndex}, max ${MAX_INDEX}` });
    }
    if (!frame.data.some((value) => value !== 0)) {
      issues.push({ key: label, message: 'is fully transparent' });
    }
  }
  if (spec.distinctFrames && spec.frames.length > 1) {
    const seen = new Map<string, number>();
    for (const [index, frame] of spec.frames.entries()) {
      const hash = Buffer.from(frame.data).toString('base64');
      const first = seen.get(hash);
      if (first !== undefined) {
        issues.push({
          key: spec.key,
          message: `frames ${first + 1} and ${index + 1} are identical`,
        });
      } else {
        seen.set(hash, index);
      }
    }
  }
  return issues;
}

interface PngSpec {
  file: string;
  width?: number;
  height?: number;
}

interface GifSpec {
  file: string;
  frames: number;
  width: number;
  height: number;
}

const PREVIEW_PNGS: PngSpec[] = [
  { file: 'palette.png' },
  { file: 'font.png' },
  { file: 'companion-contact.png' },
  { file: 'enemy-contact.png' },
  { file: 'ui-kit.png' },
  { file: 'room-contact.png' },
  { file: 'silhouettes.png' },
  { file: 'room-1x.png', width: 320, height: 180 },
];

const PREVIEW_GIFS: GifSpec[] = [
  { file: 'anim-warden-idle.gif', frames: 6, width: 192, height: 192 },
  { file: 'anim-warden-attack.gif', frames: 6, width: 192, height: 192 },
  { file: 'anim-tollbug-idle.gif', frames: 4, width: 128, height: 128 },
  { file: 'anim-tollbug-attack.gif', frames: 5, width: 128, height: 128 },
  { file: 'anim-torch.gif', frames: 3, width: 96, height: 112 },
  { file: 'anim-room.gif', frames: 12, width: 640, height: 360 },
];

const UI_PNGS: PngSpec[] = UI_ASSETS.map(({ key, pix }) => ({
  file: `${key.replaceAll('.', '-')}.png`,
  width: pix.w,
  height: pix.h,
}));

function pngHeader(bytes: Buffer): { width: number; height: number } | null {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function validatePng(path: string, spec: PngSpec): ArtIssue[] {
  const key = `export ${spec.file}`;
  if (!existsSync(path)) return [{ key, message: 'is missing (run npm run art:sheets)' }];
  const bytes = readFileSync(path);
  const header = pngHeader(bytes);
  if (!header) return [{ key, message: 'is not a valid PNG' }];
  const issues: ArtIssue[] = [];
  if (spec.width !== undefined && header.width !== spec.width) {
    issues.push({ key, message: `is ${header.width}px wide, expected ${spec.width}` });
  }
  if (spec.height !== undefined && header.height !== spec.height) {
    issues.push({ key, message: `is ${header.height}px high, expected ${spec.height}` });
  }
  return issues;
}

function validateGif(path: string, spec: GifSpec): ArtIssue[] {
  const key = `export ${spec.file}`;
  if (!existsSync(path)) return [{ key, message: 'is missing (run npm run art:sheets)' }];
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 6).toString('ascii') !== 'GIF89a') {
    return [{ key, message: 'is not a GIF89a file' }];
  }
  const issues: ArtIssue[] = [];
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (width !== spec.width)
    issues.push({ key, message: `is ${width}px wide, expected ${spec.width}` });
  if (height !== spec.height) {
    issues.push({ key, message: `is ${height}px high, expected ${spec.height}` });
  }
  let controls = 0;
  let cursor = 0;
  const marker = Buffer.from([0x21, 0xf9, 0x04]);
  while ((cursor = bytes.indexOf(marker, cursor)) !== -1) {
    controls += 1;
    cursor += marker.length;
  }
  if (controls !== spec.frames) {
    issues.push({ key, message: `has ${controls} frame blocks, expected ${spec.frames}` });
  }
  if (bytes.at(-1) !== 0x3b) issues.push({ key, message: 'does not end with a GIF trailer' });
  return issues;
}

export function previewCounts(): { pngs: number; gifs: number } {
  return { pngs: PREVIEW_PNGS.length, gifs: PREVIEW_GIFS.length };
}

export function uiAssetCount(): number {
  return UI_PNGS.length;
}

export function validateExports(root = process.cwd()): ArtIssue[] {
  const previewDir = join(root, 'docs', 'art-preview');
  const uiDir = join(root, 'public', 'ui');
  return [
    ...PREVIEW_PNGS.flatMap((spec) => validatePng(join(previewDir, spec.file), spec)),
    ...PREVIEW_GIFS.flatMap((spec) => validateGif(join(previewDir, spec.file), spec)),
    ...UI_PNGS.flatMap((spec) => validatePng(join(uiDir, spec.file), spec)),
  ];
}

export function validateArt(root = process.cwd()): ArtIssue[] {
  return [...artSpecs().flatMap(validateFrames), ...validateExports(root)];
}
