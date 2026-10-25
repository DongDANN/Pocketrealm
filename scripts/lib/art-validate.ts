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
import { composeRoomPreview, rootfallScene, SCENE_H, SCENE_W } from '../../src/art/scenes/rootfall';
import {
  composeRealm,
  groundAt,
  periodForHour,
  plotBox,
  REALM_BUILDINGS,
  type RealmPeriod,
} from '../../src/art/scenes/realm';
import {
  ascend,
  coverage,
  impact,
  puff,
  shockwave,
  slash,
  type Effect,
} from '../../src/art/effects';
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
  { file: 'delve-stages.png' },
  { file: 'realm-diorama.png' },
  { file: 'delve-effects.png' },
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
  { file: 'anim-realm.gif', frames: 12, width: 640, height: 360 },
  { file: 'anim-effect-slash.gif', frames: 4, width: 128, height: 128 },
  { file: 'anim-effect-impact.gif', frames: 5, width: 128, height: 128 },
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

const REALM_LEVELS: [string, Record<string, number>][] = [
  ['bare', {}],
  ['part', { treasury: 1, library: 1, smithy: 1 }],
  ['built', { treasury: 2, library: 2, smithy: 2, observatory: 2, workshop: 2 }],
];

const PERIOD_HOURS: [number, RealmPeriod][] = [
  [0, 'night'],
  [4, 'night'],
  [5, 'dawn'],
  [7, 'dawn'],
  [8, 'day'],
  [16, 'day'],
  [17, 'dusk'],
  [20, 'dusk'],
  [21, 'night'],
  [23, 'night'],
];

/** The five effects the battle scene can play, each with the shortest useful reel. */
function effectEntries(): { spec: FrameSpec; effect: Effect }[] {
  const made: [string, Effect, number][] = [
    ['effect.slash', slash(C.frost1), 4],
    ['effect.impact', impact(C.amber2), 5],
    ['effect.shockwave', shockwave(C.rose2), 4],
    ['effect.ascend', ascend(C.moss2), 5],
    ['effect.puff', puff(C.ink500), 4],
  ];
  return made.map(([key, effect, minFrames]) => ({
    effect,
    spec: { key, frames: effect.frames, width: 32, height: 32, minFrames, distinctFrames: true },
  }));
}

/**
 * The Realm diorama and the effect strips. What is checked here is what a screenshot cannot tell
 * apart from a bug: that the same inputs give the same pixels, that the island surface is a single
 * continuous curve the actors can be stood on, and that an effect thins out instead of ending solid.
 */
export function sceneIssues(): ArtIssue[] {
  const issues: ArtIssue[] = [];
  const warden = buildWarden().idle[0]!;

  for (const period of ['dawn', 'day', 'dusk', 'night'] as RealmPeriod[]) {
    for (const [label, levels] of REALM_LEVELS) {
      for (const frame of [0, 2, 5, 8]) {
        const key = `realm.${period}.${label}.f${frame}`;
        const actors = { companion: warden, companionX: 152 };
        const once = composeRealm(frame, 0, period, levels, actors);
        const twice = composeRealm(frame, 0, period, levels, actors);
        if (Buffer.compare(Buffer.from(once.data), Buffer.from(twice.data)) !== 0) {
          issues.push({
            key,
            message: 'is not deterministic: the same inputs drew different pixels',
          });
        }
        if (once.w !== SCENE_W || once.h !== SCENE_H) {
          issues.push({ key, message: `is ${once.w}x${once.h}, expected ${SCENE_W}x${SCENE_H}` });
        }
        const bad = once.data.find((value) => value > MAX_INDEX);
        if (bad !== undefined) issues.push({ key, message: `uses palette index ${bad}` });
        if (once.data.some((value) => value === 0)) {
          issues.push({ key, message: 'leaves a hole through to the page behind it' });
        }
      }
    }
  }

  for (const [hour, want] of PERIOD_HOURS) {
    const got = periodForHour(hour);
    if (got !== want)
      issues.push({ key: `realm.hour${hour}`, message: `maps to ${got}, expected ${want}` });
  }

  for (const depth of [-6, 0, 9]) {
    for (let x = 0; x < SCENE_W; x++) {
      const y = groundAt(x, depth);
      if (y < 0 || y >= SCENE_H) {
        issues.push({
          key: `realm.ground.x${x}.${depth}`,
          message: `returns row ${y}, off the canvas`,
        });
      }
    }
  }
  for (let d = 1; d <= 140; d++) {
    if (groundAt(160 - d, 0) !== groundAt(160 + d, 0)) {
      issues.push({
        key: `realm.ground.symmetric`,
        message: `row ${160 - d} and ${160 + d} disagree at depth 0`,
      });
      break;
    }
  }
  if (!(groundAt(160, -4) < groundAt(160, 6))) {
    issues.push({ key: 'realm.ground.depth', message: 'depth does not move down the band' });
  }

  const boxes = REALM_BUILDINGS.map((id) => ({ id, box: plotBox(id) }));
  for (const { id, box } of boxes) {
    if (box.x < 0 || box.y < 0 || box.x + box.w > SCENE_W || box.y + box.h > SCENE_H) {
      issues.push({ key: `realm.plot.${id}`, message: 'has a tap box that leaves the canvas' });
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!.box;
      const b = boxes[j]!.box;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        issues.push({
          key: `realm.plot.${boxes[i]!.id}`,
          message: `tap box overlaps ${boxes[j]!.id}, so one tap could hit two buildings`,
        });
      }
    }
  }

  for (const { spec, effect } of effectEntries()) {
    issues.push(...validateFrames(spec));
    const peak = Math.max(...effect.frames.map((_, i) => coverage(effect, i)));
    const last = coverage(effect, effect.frames.length - 1);
    if (last >= peak) {
      issues.push({
        key: spec.key,
        message: 'ends as solid as its busiest frame, so it pops instead of fading',
      });
    }
  }
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
    ...sceneIssues(),
    ...validateExports(root),
  ];
}
