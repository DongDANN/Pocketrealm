/**
 * Rootfall Warren scene: far cavern, tiled mid-room, foreground ferns, dithered lighting.
 * All layers are original, palette-only pixmaps. Camera offsets are integer pixels.
 */
import { C, MASTER_PALETTE } from '../palette';
import {
  blit,
  createPixmap,
  fillEllipse,
  fillPolygon,
  fillRect,
  hline,
  line,
  setPx,
  vline,
  type Pixmap,
} from '../px';
import { hash2 } from '../px';
import {
  FERN_LARGE,
  FERN_SMALL,
  FLAME_FRAMES,
  FLOOR_TILES,
  MUSHROOM,
  PUDDLE,
  TORCH,
  WALL_EDGE,
  WALL_FACES,
  WALL_TOPS,
} from '../tiles';
import { buildTollbug } from '../enemies';
import { buildWarden } from '../companion';

export const SCENE_W = 320;
export const SCENE_H = 180;
export const ROOM_LOOP_FRAMES = 12;

// Ordered 4x4 Bayer matrix keeps shadows and light as readable dither steps instead
// of per-pixel static noise.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

function bayer(x: number, y: number): number {
  return (BAYER4[y & 3]![x & 3]! + 0.5) / 16;
}

function drawFar(): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H, C.ink800);
  // ordered depth gradient, kept deliberately calm
  for (let y = 0; y < SCENE_H; y++) {
    const density = Math.max(0, (y / SCENE_H) * 0.34 - 0.06);
    for (let x = 0; x < SCENE_W; x++) {
      if (bayer(x, y) < density) setPx(p, x, y, C.ink700);
    }
  }
  // distant cave mouth glow
  for (let y = 40; y < 140; y++) {
    for (let x = 100; x < 220; x++) {
      const dx = (x - 160) / 62;
      const dy = (y - 94) / 48;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      if (bayer(x, y) < (1 - d) * 0.12) setPx(p, x, y, C.teal4);
      if (d < 0.55 && bayer(x + 2, y + 1) < (1 - d) * 0.16) setPx(p, x, y, C.moss5);
    }
  }
  // giant roots descending from the ceiling
  const roots: [number, number][][] = [
    [
      [8, 0],
      [18, 24],
      [10, 46],
      [22, 70],
      [16, 92],
    ],
    [
      [300, 0],
      [292, 30],
      [304, 58],
      [288, 88],
      [296, 110],
    ],
    [
      [156, 0],
      [150, 16],
      [160, 32],
      [152, 48],
    ],
  ];
  // giant roots descending from the ceiling. Held two steps above the cave black: at
  // ink700 they were the brightest thing in the frame and read as a fringe.
  for (const path of roots) {
    for (let i = 0; i + 1 < path.length; i++) {
      const [x0, y0] = path[i]!;
      const [x1, y1] = path[i + 1]!;
      line(p, x0, y0, x1, y1, C.ink600);
      line(p, x0 + 1, y0, x1 + 1, y1, C.ink600);
      line(p, x0 + 2, y0 + 1, x1 + 2, y1, C.ink500);
    }
  }
  // distant pillars: darker than the mid wall so they recede, with one lit edge to keep their form
  for (const px0 of [42, 256]) {
    fillRect(p, px0, 34, 12, 62, C.ink600);
    fillRect(p, px0 + 2, 38, 3, 54, C.ink500);
    fillRect(p, px0 - 3, 30, 18, 5, C.ink600);
    fillRect(p, px0 - 2, 94, 16, 4, C.ink600);
    hline(p, px0, px0 + 11, 34, C.ink700);
    vline(p, px0, 34, 94, C.ink700);
    for (let y = 46; y < 90; y += 9) hline(p, px0 + 1, px0 + 11, y, C.ink500);
  }
  // distant stalactites
  for (let i = 0; i < 16; i++) {
    const x = hash2(i, 5, 704) % SCENE_W;
    const len = 4 + (hash2(i, 6, 705) % 14);
    fillPolygon(
      p,
      [
        [x, 0],
        [x + 3, 0],
        [x + 1, len],
      ],
      C.ink600,
    );
  }
  // faint teal crystals
  for (const [cx, cy] of [
    [64, 120],
    [280, 132],
    [238, 114],
  ] as const) {
    fillPolygon(
      p,
      [
        [cx, cy - 8],
        [cx + 2, cy],
        [cx, cy + 5],
        [cx - 2, cy],
      ],
      C.teal4,
    );
    setPx(p, cx, cy - 2, C.teal3);
  }
  return p;
}

function carveArch(p: Pixmap, x0: number, y0: number, w: number, h: number): void {
  const cx = x0 + Math.floor(w / 2);
  const archH = Math.floor(w * 0.65);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (y < y0 + archH) {
        const dx = (x - cx) / (w / 2);
        const dy = (y - (y0 + archH)) / archH;
        if (dx * dx + dy * dy <= 1) setPx(p, x, y, 0);
      } else {
        setPx(p, x, y, 0);
      }
    }
  }
}

function insideArch(x: number, y: number, x0: number, y0: number, w: number, h: number): boolean {
  if (y < y0 || y >= y0 + h) return false;
  if (y >= y0 + Math.floor(w * 0.65)) return true;
  const cx = x0 + Math.floor(w / 2);
  const archH = Math.floor(w * 0.65);
  const dx = (x - cx) / (w / 2);
  const dy = (y - (y0 + archH)) / archH;
  return dx * dx + dy * dy <= 1;
}

function drawArchDepth(
  p: Pixmap,
  x0: number,
  y0: number,
  w: number,
  h: number,
  seed: number,
): void {
  const cx = x0 + Math.floor(w / 2);
  // A pale grotto glow replaces the flat black hole; ordered dither keeps it graphic.
  // The Bayer phase shifts per arch, otherwise the two openings stamp the same speckle and
  // the wall reads as a mirrored pair.
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (!insideArch(x, y, x0, y0, w, h)) continue;
      const vertical = (y - y0) / h;
      const lateral = 1 - Math.abs(x - cx) / (w * 0.55);
      const glow = Math.max(0, vertical * 1.15 - 0.15) * Math.max(0, lateral);
      setPx(p, x, y, C.ink700);
      if (bayer(x + seed, y + seed) < glow * 0.42) setPx(p, x, y, C.cyan5);
      if (bayer(x + seed + 2, y + seed * 2 + 1) < glow * 0.18) setPx(p, x, y, C.teal4);
      if (bayer(x + seed * 3 + 1, y + seed + 3) < glow * 0.06) setPx(p, x, y, C.teal3);
    }
  }
  // distant hanging roots silhouetted against the glow
  const roots: [number, number][][] =
    seed === 0
      ? [
          [
            [cx - 9, y0 + 2],
            [cx - 7, y0 + 14],
            [cx - 10, y0 + 24],
          ],
          [
            [cx + 8, y0 + 4],
            [cx + 6, y0 + 16],
            [cx + 9, y0 + 27],
          ],
        ]
      : [
          [
            [cx - 6, y0 + 2],
            [cx - 8, y0 + 17],
            [cx - 5, y0 + 30],
          ],
          [
            [cx + 10, y0 + 6],
            [cx + 11, y0 + 13],
          ],
        ];
  for (const path of roots) {
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, ay] = path[i]!;
      const [bx, by] = path[i + 1]!;
      line(p, ax, ay, bx, by, C.ink800);
    }
  }
  // fireflies, placed differently in each opening
  setPx(p, cx - 3 + seed, y0 + 33, C.cyan3);
  setPx(p, cx + 5 - seed, y0 + 37 - (seed % 3), C.teal2);
}

function drawWindowFrame(p: Pixmap, x0: number, y0: number, w: number, h: number): void {
  const cx = x0 + Math.floor(w / 2);
  const archH = Math.floor(w * 0.65);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = (x - cx) / (w / 2);
      const dy = y < y0 + archH ? (y - (y0 + archH)) / archH : 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const inside = y < y0 + archH ? dist <= 1 : true;
      if (!inside) continue;
      if (dist > 0.9 || (y >= y0 + archH && (x <= x0 + 1 || x >= x0 + w - 2))) {
        setPx(p, x, y, dist > 0.96 ? C.ink400 : C.steel2);
      }
    }
  }
  hline(p, x0 + 3, x0 + w - 4, y0 + h - 1, C.ink500);
  // key stone
  fillRect(p, cx - 2, y0 - 2, 5, 4, C.ink400);
  hline(p, cx - 2, cx + 2, y0 - 2, C.steel2);
  setPx(p, cx, y0, C.moss4);
}

function drawVine(p: Pixmap, x: number, y: number, len: number, sway: number, seed: number): void {
  // Held to the darkest moss with one lighter leaf: brighter greens made the wall
  // squiggle instead of hanging.
  for (let i = 0; i < len; i++) {
    const dx = Math.round(Math.sin((i + seed) * 0.22) * sway);
    setPx(p, x + dx, y + i, C.moss5);
    if (i % 3 === 0) {
      setPx(p, x + dx + (i % 6 === 0 ? 1 : -1), y + i, C.moss5);
      setPx(p, x + dx + (i % 6 === 0 ? 2 : -2), y + i + 1, C.moss5);
    }
    if (i % 7 === 3) setPx(p, x + dx + 2, y + i, C.moss4);
  }
}

function drawBanner(p: Pixmap, x: number, y: number): void {
  // iron rod
  fillRect(p, x - 2, y, 22, 2, C.ink400);
  hline(p, x - 1, x + 19, y, C.steel2);
  setPx(p, x - 2, y - 1, C.steel1);
  setPx(p, x + 19, y - 1, C.steel1);
  // teal cloth with a gold border
  fillRect(p, x + 2, y + 3, 14, 24, C.ink500);
  fillRect(p, x + 3, y + 3, 12, 23, C.teal3);
  fillRect(p, x + 4, y + 4, 10, 21, C.teal4);
  vline(p, x + 4, y + 4, y + 24, C.gold2);
  vline(p, x + 13, y + 4, y + 24, C.gold2);
  hline(p, x + 4, x + 13, y + 4, C.gold1);
  // folded highlights and shadow
  vline(p, x + 6, y + 5, y + 23, C.teal2);
  vline(p, x + 11, y + 5, y + 22, C.teal3);
  setPx(p, x + 9, y + 8, C.teal2);
  setPx(p, x + 8, y + 18, C.ink500);
  // lantern emblem
  hline(p, x + 8, x + 10, y + 9, C.gold1);
  fillRect(p, x + 7, y + 10, 5, 6, C.gold2);
  fillRect(p, x + 8, y + 11, 3, 4, C.amber2);
  setPx(p, x + 9, y + 12, C.amber0);
  setPx(p, x + 9, y + 16, C.gold1);
  hline(p, x + 7, x + 11, y + 17, C.gold1);
  // swallow-tail fringe
  for (let i = 0; i < 5; i++) {
    const fx = x + 4 + i * 2;
    fillPolygon(
      p,
      [
        [fx, y + 26],
        [fx + 2, y + 26],
        [fx + 1, y + 29],
      ],
      i % 2 === 0 ? C.teal3 : C.teal4,
    );
  }
  // wear
  setPx(p, x + 5, y + 13, C.ink500);
  setPx(p, x + 12, y + 20, C.ink500);
}

function drawMain(): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  // wall top trim, three variants so the moss runs do not stamp repeat
  for (let x = 0; x < SCENE_W; x += 16) {
    blit(p, WALL_TOPS[hash2(x / 16, 1, 830) % WALL_TOPS.length]!, x, 8);
  }
  // wall face, three variants break up the repeating mortar grid
  for (let y = 24; y < 80; y += 16) {
    for (let x = 0; x < SCENE_W; x += 16) {
      const variant = hash2(x / 16, y / 16, 820) % WALL_FACES.length;
      blit(p, WALL_FACES[variant]!, x, y);
    }
  }
  // wall base edge
  for (let x = 0; x < SCENE_W; x += 16) {
    blit(p, WALL_EDGE, x, 80);
  }
  // windows
  carveArch(p, 24, 26, 44, 48);
  carveArch(p, 252, 26, 44, 48);
  drawArchDepth(p, 24, 26, 44, 48, 0);
  drawArchDepth(p, 252, 26, 44, 48, 5);
  drawWindowFrame(p, 24, 26, 44, 48);
  drawWindowFrame(p, 252, 26, 44, 48);
  // torches
  for (const tx of [88, 216]) {
    blit(p, TORCH, tx, 38);
    fillRect(p, tx + 2, 34, 12, 4, C.ink400);
    hline(p, tx + 2, tx + 13, 34, C.steel1);
  }
  // banner between torches
  drawBanner(p, 148, 30);
  // hanging vines
  drawVine(p, 78, 24, 30, 2, 1);
  drawVine(p, 198, 24, 38, 2, 3);
  drawVine(p, 138, 24, 20, 1, 5);
  drawVine(p, 308, 8, 58, 2, 7);
  // stone cracks
  line(p, 112, 48, 118, 56, C.ink600);
  line(p, 118, 56, 116, 64, C.ink600);
  line(p, 190, 64, 198, 70, C.ink600);
  // moss clusters around the arch bases, sized per cluster so the openings do not match
  for (const [mx, my, mw, mh] of [
    [28, 68, 5, 2],
    [64, 70, 4, 2],
    [256, 70, 5, 2],
    [291, 67, 3, 2],
    [94, 78, 4, 1],
  ] as const) {
    fillEllipse(p, mx, my, mw, mh, C.moss5);
    fillEllipse(p, mx + 2, my - 1, mw - 2, 1, C.moss4);
    if (mw >= 5) setPx(p, mx + 4, my - 2, C.moss3);
    if (mw >= 4) setPx(p, mx - 4, my, C.moss4);
  }
  // floor
  for (let y = 96; y < SCENE_H; y += 16) {
    for (let x = 0; x < SCENE_W; x += 16) {
      const v = hash2(x / 16, y / 16, 801) % 4;
      blit(p, FLOOR_TILES[v]!, x, y);
    }
  }
  // ambient occlusion at the wall base, as an ordered dither. The mortar is now ink900, so
  // the shadow darkens the stone faces instead of filling in the joints.
  for (let y = 96; y < 106; y++) {
    const density = ((106 - y) / 10) * 0.42;
    for (let x = 0; x < SCENE_W; x++) {
      if (bayer(x, y) < density) setPx(p, x, y, C.ink900);
    }
  }
  // roots creeping across the floor
  line(p, 0, 124, 14, 128, C.moss5);
  line(p, 14, 128, 22, 126, C.moss4);
  line(p, 300, 112, 288, 118, C.moss5);
  line(p, 288, 118, 282, 114, C.moss4);
  line(p, 60, 168, 78, 164, C.moss5);
  line(p, 78, 164, 90, 167, C.moss4);
  // floor detail
  blit(p, PUDDLE, 66, 146);
  blit(p, PUDDLE, 232, 120);
  blit(p, MUSHROOM, 32, 100);
  blit(p, MUSHROOM, 288, 136);
  blit(p, MUSHROOM, 128, 168);
  // pebbles, few and stone-toned: green specks on open floor read as dirt on the lens
  for (let i = 0; i < 6; i++) {
    const x = 6 + (hash2(i, 9, 803) % 308);
    const y = 100 + (hash2(i, 10, 804) % 78);
    setPx(p, x, y, hash2(i, 12, 806) % 3 === 0 ? C.ink400 : C.ink500);
  }
  return p;
}

function drawFore(): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  blit(p, FERN_LARGE, 0, 146);
  blit(p, FERN_SMALL, 26, 160);
  blit(p, FERN_LARGE, 276, 148, { mirrorX: true });
  blit(p, FERN_SMALL, 254, 158, { mirrorX: true });
  // overhanging foreground vines
  drawVine(p, 5, 0, 38, 2, 9);
  drawVine(p, 309, 0, 28, 1, 11);
  // scattered foreground grass
  for (let i = 0; i < 9; i++) {
    const x = 4 + i * 3;
    line(p, x, 179, x + 1, 172 - (i % 3), C.moss5);
    setPx(p, x + 1, 171 - (i % 3), C.moss4);
  }
  return p;
}

export function vignette(): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const nx = Math.abs(x - SCENE_W / 2) / (SCENE_W / 2);
      const ny = Math.abs(y - SCENE_H / 2) / (SCENE_H / 2);
      const d = Math.pow(Math.max(nx, ny), 3.2) * 0.32;
      if (bayer(x, y) < d) setPx(p, x, y, C.ink900);
    }
  }
  return p;
}

/**
 * Tight dithered light halo used additively by the renderer. No blur, no gradients.
 * The palette is deliberately warm parchment rather than saturated ember: on the ink
 * stone, cream light separates from the floor while orange reads as confetti.
 */
export function lightBlob(radius: number, tint: 'amber' | 'teal' | 'ember' = 'amber'): Pixmap {
  const size = radius * 2 + 1;
  const p = createPixmap(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - radius) / radius;
      const dy = (y - radius) / radius;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const density = Math.min(1, Math.pow(1 - d, 0.8) * 1.05);
      if (bayer(x, y) >= density) continue;
      const inner = d < 0.3;
      const mid = d < 0.62;
      const c =
        tint === 'amber'
          ? inner
            ? C.paper0
            : mid
              ? C.paper2
              : C.paper5
          : tint === 'teal'
            ? inner
              ? C.cyan2
              : mid
                ? C.teal3
                : C.teal4
            : inner
              ? C.amber0
              : mid
                ? C.amber4
                : C.amber5;
      setPx(p, x, y, c);
    }
  }
  return p;
}

/** Tiny bright core for a flame. Kept small so it reads as a source, not a field of sparks. */
export function lightFlare(radius = 6): Pixmap {
  const size = radius * 2 + 1;
  const p = createPixmap(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - radius) / radius;
      const dy = (y - radius) / radius;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      if (bayer(x, y) >= Math.pow(1 - d, 1.2) * 0.9) continue;
      setPx(p, x, y, d < 0.3 ? C.amber0 : d < 0.62 ? C.amber1 : C.amber2);
    }
  }
  return p;
}

export interface RootfallScene {
  far: Pixmap;
  main: Pixmap;
  fore: Pixmap;
  vignette: Pixmap;
  lanternGlow: Pixmap;
  flare: Pixmap;
  torchGlow: Pixmap;
  warden: ReturnType<typeof buildWarden>;
  tollbug: ReturnType<typeof buildTollbug>;
  flames: readonly Pixmap[];
}

let cached: RootfallScene | undefined;

export function rootfallScene(): RootfallScene {
  if (cached) return cached;
  cached = {
    far: drawFar(),
    main: drawMain(),
    fore: drawFore(),
    vignette: vignette(),
    lanternGlow: lightBlob(11, 'amber'),
    flare: lightFlare(5),
    torchGlow: lightBlob(9, 'ember'),
    warden: buildWarden(),
    tollbug: buildTollbug(),
    flames: FLAME_FRAMES,
  };
  return cached;
}

export const TORCH_POSITIONS = [
  [88, 38],
  [216, 38],
] as const;

/**
 * Motes drift inside the two torch columns only, where the light makes them plausible.
 * Scattered across the open floor they read as floating debris.
 */
function drawDust(out: Pixmap, frame: number): void {
  for (let i = 0; i < 6; i++) {
    const column = i % 2 === 0 ? 96 : 224;
    const x = column - 3 + (hash2(i, 3, 911) % 7);
    const rise = ((frame + i * 2) % 12) * 6;
    const y = 124 - rise - (hash2(i, 4, 912) % 10);
    if (y < 50) continue;
    setPx(out, x, y, i % 3 === 0 ? C.amber4 : C.amber5);
  }
}

/** Compose a representative scene frame for contact sheets and animated previews. */
export function composeRoomPreview(frame = 2, look = 0): Pixmap {
  const scene = rootfallScene();
  const camera = Math.max(-1, Math.min(1, look));
  const farX = Math.round(camera * -3);
  const mainX = Math.round(camera * -2);
  const foreX = Math.round(camera * -5);
  const out = createPixmap(SCENE_W, SCENE_H, C.ink900);
  blit(out, scene.far, farX, 0);
  blit(out, scene.main, mainX, 0);
  // Light sits behind actors, so sprites and their silhouettes stay readable.
  addLight(out, scene.lanternGlow, 152 + mainX, 138);
  addLight(out, scene.torchGlow, 96 + mainX, 45);
  addLight(out, scene.torchGlow, 224 + mainX, 45);
  addLight(out, scene.flare, 150 + mainX, 126);
  addLight(out, scene.flare, 96 + mainX, 44);
  addLight(out, scene.flare, 224 + mainX, 44);
  drawDust(out, frame);
  blit(out, scene.warden.idle[frame % scene.warden.idle.length]!, 116 + mainX, 108);
  blit(out, scene.tollbug.idle[frame % scene.tollbug.idle.length]!, 224 + mainX, 126);
  // flames sit above the bowl, centred on the sconce
  for (let i = 0; i < TORCH_POSITIONS.length; i++) {
    const [x, y] = TORCH_POSITIONS[i]!;
    blit(out, scene.flames[(frame + i) % scene.flames.length]!, x + mainX, y - 5);
  }
  blit(out, scene.fore, foreX, 0);
  blit(out, scene.vignette, 0, 0);
  return out;
}

function addLight(base: Pixmap, glow: Pixmap, cx: number, cy: number): void {
  const ox = cx - Math.floor(glow.w / 2);
  const oy = cy - Math.floor(glow.h / 2);
  for (let y = 0; y < glow.h; y++) {
    for (let x = 0; x < glow.w; x++) {
      const g = glow.data[y * glow.w + x]!;
      if (!g) continue;
      const tx = ox + x;
      const ty = oy + y;
      if (tx < 0 || ty < 0 || tx >= base.w || ty >= base.h) continue;
      const b = base.data[ty * base.w + tx]!;
      if (!b) continue;
      base.data[ty * base.w + tx] = blendLight(b, g, LIGHT_STRENGTH.get(g) ?? 0.6);
    }
  }
}

/**
 * Blend stone toward the glow's own palette colour, then snap back to the palette.
 * The per-pixel dither mask already shapes the falloff; this keeps the lit pixels warm
 * cream instead of saturated orange, which survived the palette snap as confetti.
 */
const LIGHT_STRENGTH = new Map<number, number>([
  [C.paper0, 0.9],
  [C.paper2, 0.8],
  [C.paper5, 0.65],
  [C.amber0, 0.9],
  [C.amber4, 0.72],
  [C.amber5, 0.65],
  [C.cyan2, 0.85],
  [C.teal3, 0.75],
  [C.teal4, 0.6],
]);

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const paletteRgb = MASTER_PALETTE.map((hex, i) => (i === 0 ? null : rgb(hex)));
const blendCache = new Map<number, number>();

function blendLight(baseIndex: number, glowIndex: number, k: number): number {
  const step = Math.round(k * 20);
  const key = (baseIndex * 64 + glowIndex) * 21 + step;
  const hit = blendCache.get(key);
  if (hit !== undefined) return hit;
  const b = paletteRgb[baseIndex]!;
  const g = paletteRgb[glowIndex]!;
  const kk = step / 20;
  const target = [
    b[0] * (1 - kk) + g[0] * kk,
    b[1] * (1 - kk) + g[1] * kk,
    b[2] * (1 - kk) + g[2] * kk,
  ] as const;
  let best = baseIndex;
  let bestD = Infinity;
  for (let idx = 1; idx < paletteRgb.length; idx++) {
    const c = paletteRgb[idx]!;
    const d =
      (c[0] - target[0]) ** 2 * 0.35 +
      (c[1] - target[1]) ** 2 * 0.45 +
      (c[2] - target[2]) ** 2 * 0.2;
    if (d < bestD) {
      bestD = d;
      best = idx;
    }
  }
  blendCache.set(key, best);
  return best;
}
