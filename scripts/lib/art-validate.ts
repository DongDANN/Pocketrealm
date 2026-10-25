/**
 * Palette, canvas, frame and exported-file checks for the Gate 0.5 art set.
 * Pure Node so both the CLI and Vitest can use it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { C, MASTER_PALETTE } from '../../src/art/palette';
import type { Pixmap } from '../../src/art/px';
import { px } from '../../src/art/px';
import { buildWarden } from '../../src/art/companion';
import { FLAME_FRAMES, TORCH } from '../../src/art/tiles';
import { UI_ASSETS } from '../../src/art/ui';
import { composeRoomPreview, rootfallScene } from '../../src/art/scenes/rootfall';
import { AFFIXES } from '../../src/core/delve/data/affixes';
import { ELEMENTS } from '../../src/core/delve/data/elements';
import { STATUSES } from '../../src/core/delve/data/statuses';
import { BOSSES, ELITES, ENEMIES } from '../../src/core/delve/data/enemies';
import { critterRecipe, enemyFrames } from '../../src/art/critters';

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

/**
 * Every bestiary id gets four checked sets. The counts are not decoration: an animation with
 * fewer than these frames snaps, and `distinctFrames` catches a pose table that a painter ignores.
 */
function speciesSpecs(): FrameSpec[] {
  const sets: [set: 'idle' | 'attack' | 'hurt' | 'faint', min: number][] = [
    ['idle', 4],
    ['attack', 5],
    ['hurt', 3],
    ['faint', 3],
  ];
  return [...ENEMIES, ...ELITES, ...BOSSES].flatMap(({ id }) =>
    sets.map(([set, min]) => {
      const frames = enemyFrames(id);
      return {
        key: `enemy.${id}.${set}`,
        frames: frames ? frames[set] : [],
        width: 32,
        height: 32,
        minFrames: min,
        distinctFrames: true,
      };
    }),
  );
}

export function artSpecs(): FrameSpec[] {
  const warden = buildWarden();
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
  return [...base, ...speciesSpecs(), ...ui];
}

/**
 * Recipe-vs-bestiary drift, and the two checks that a generated bestiary actually needs.
 *
 * `SILHOUETTE_FLOOR` is the important one. Two species that share an archetype and a build are the
 * same sprite recoloured, and that is invisible in a contact sheet where every row is a different
 * colour — `emberjaw` and `umbraclaw` measured 0.0% apart before proportions were per-species.
 * Comparing flat shapes catches it. The floor sits just under the current worst pair (20.0%,
 * thorncrown against ashwrought) so a real regression trips it without freezing today's art.
 */
const SILHOUETTE_FLOOR = 0.18;
/** A sprite that fills the canvas is a blob; one that barely fills it is a dot. */
const COVERAGE_MIN = 60;
const COVERAGE_MAX = 700;
/** Near-white is a highlight, not a body colour. Above this the frame is blown out. */
const BRIGHT_CEILING = 0.15;

function silhouetteOf(frame: Pixmap): Uint8Array {
  const mask = new Uint8Array(frame.data.length);
  for (let i = 0; i < frame.data.length; i++) mask[i] = frame.data[i] ? 1 : 0;
  return mask;
}

/** Pixels that differ, over pixels either shape occupies. 0 is identical, 1 is no overlap at all. */
export function silhouetteDistance(a: Uint8Array, b: Uint8Array): number {
  let diff = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] || b[i]) union += 1;
    if (a[i] !== b[i]) diff += 1;
  }
  return union === 0 ? 0 : diff / union;
}

export function speciesIssues(): ArtIssue[] {
  const issues: ArtIssue[] = [];
  const ids = [...ENEMIES, ...ELITES, ...BOSSES];
  for (const enemy of ids) {
    const lord = 'elite' in enemy || 'boss' in enemy;
    if (enemy.id === 'tollbug') continue;
    const recipe = critterRecipe(enemy.id);
    if (!recipe) {
      issues.push({ key: `enemy.${enemy.id}`, message: 'has no sprite recipe' });
      continue;
    }
    if (recipe.lord !== lord) {
      issues.push({
        key: `enemy.${enemy.id}`,
        message: `is ${lord ? 'an elite or boss' : 'an ordinary'} but its recipe says lord=${String(recipe.lord)}`,
      });
    }
  }
  const shapes = new Map<string, Uint8Array>();
  for (const { id } of ids) {
    const frames = enemyFrames(id);
    if (!frames) continue;
    shapes.set(id, silhouetteOf(frames.idle[1] ?? frames.idle[0]!));
    for (const set of ['idle', 'attack', 'hurt', 'faint'] as const) {
      frames[set].forEach((frame, index) => {
        let opaque = 0;
        let bright = 0;
        for (const value of frame.data) {
          if (!value) continue;
          opaque += 1;
          if (value === C.paper0 || value === C.paper1) bright += 1;
        }
        const label = `enemy.${id}.${set} frame ${index + 1}`;
        if (opaque < COVERAGE_MIN || opaque > COVERAGE_MAX) {
          issues.push({
            key: label,
            message: `covers ${opaque} pixels, expected ${COVERAGE_MIN}-${COVERAGE_MAX}`,
          });
        }
        if (opaque > 0 && bright / opaque > BRIGHT_CEILING) {
          issues.push({
            key: label,
            message: `is ${Math.round((bright / opaque) * 100)}% near-white, max ${Math.round(BRIGHT_CEILING * 100)}%`,
          });
        }
      });
    }
  }
  const named = [...shapes.entries()];
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      const [a, shapeA] = named[i]!;
      const [b, shapeB] = named[j]!;
      const distance = silhouetteDistance(shapeA, shapeB);
      if (distance < SILHOUETTE_FLOOR) {
        issues.push({
          key: `enemy.${a}`,
          message: `and ${b} share ${Math.round((1 - distance) * 100)}% of their silhouette`,
        });
      }
    }
  }
  return issues;
}

/**
 * The Delve glyph families, checked against the rule tables that actually use them.
 *
 * The coverage floor is the one that matters: a 16px glyph loses its meaning by going thin long
 * before it goes empty, and an `outline` call that swallows a neighbour is invisible on a contact
 * sheet where every cell is 64px wide. `isolated` counts pixels with no opaque neighbour in a
 * cross — a glyph that is mostly those is a hairline, not a shape. The legacy tab icons are
 * deliberately excluded; they are single-stroke chevrons by design.
 */
const GLYPH_PREFIXES = ['ui.icon.status.', 'ui.icon.affix.', 'ui.icon.element.'];
const GLYPH_FAMILIES: [prefix: string, ids: readonly string[]][] = [
  ['ui.icon.status.', STATUSES.map((status) => status.id)],
  ['ui.icon.affix.', AFFIXES.map((affix) => affix.id)],
  ['ui.icon.element.', Object.keys(ELEMENTS)],
];

export function uiIssues(): ArtIssue[] {
  const issues: ArtIssue[] = [];
  const keys = new Set(UI_ASSETS.map((asset) => asset.key));
  for (const [prefix, ids] of GLYPH_FAMILIES) {
    for (const id of ids) {
      if (!keys.has(`${prefix}${id}`)) {
        issues.push({ key: `${prefix}${id}`, message: 'has no glyph (the rule table lists it)' });
      }
    }
  }
  for (const { key, pix } of UI_ASSETS) {
    if (!GLYPH_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    let opaque = 0;
    let isolated = 0;
    for (let y = 0; y < pix.h; y++) {
      for (let x = 0; x < pix.w; x++) {
        if (!pix.data[y * pix.w + x]) continue;
        opaque += 1;
        const across = px(pix, x - 1, y) || px(pix, x + 1, y);
        const down = px(pix, x, y - 1) || px(pix, x, y + 1);
        if (!across && !down) isolated += 1;
      }
    }
    const share = opaque / (pix.w * pix.h);
    if (share < 0.14 || share > 0.78) {
      issues.push({
        key,
        message: `covers ${Math.round(share * 100)}% of its canvas, expected 14-78%`,
      });
    }
    if (opaque > 0 && isolated / opaque > 0.1) {
      issues.push({
        key,
        message: `has ${Math.round((isolated / opaque) * 100)}% detached pixels, max 10%`,
      });
    }
  }
  return issues;
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
  { file: 'delve-hollow-1.png' },
  { file: 'delve-hollow-2.png' },
  { file: 'delve-hollow-3.png' },
  { file: 'delve-shapes.png' },
  { file: 'delve-glyphs.png' },
];

const hollowSize = (hollow: 1 | 2 | 3) =>
  [...ENEMIES, ...ELITES, ...BOSSES].filter((enemy) => enemy.hollow === hollow).length * 4;

const PREVIEW_GIFS: GifSpec[] = [
  { file: 'anim-warden-idle.gif', frames: 6, width: 192, height: 192 },
  { file: 'anim-warden-attack.gif', frames: 6, width: 192, height: 192 },
  { file: 'anim-tollbug-idle.gif', frames: 4, width: 128, height: 128 },
  { file: 'anim-tollbug-attack.gif', frames: 5, width: 128, height: 128 },
  { file: 'anim-torch.gif', frames: 3, width: 96, height: 112 },
  { file: 'anim-room.gif', frames: 12, width: 640, height: 360 },
  { file: 'anim-hollow-1-idle.gif', frames: hollowSize(1), width: 128, height: 128 },
  { file: 'anim-hollow-2-idle.gif', frames: hollowSize(2), width: 128, height: 128 },
  { file: 'anim-hollow-3-idle.gif', frames: hollowSize(3), width: 128, height: 128 },
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
  return [
    ...artSpecs().flatMap(validateFrames),
    ...speciesIssues(),
    ...uiIssues(),
    ...validateExports(root),
  ];
}
