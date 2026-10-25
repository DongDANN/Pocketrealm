/**
 * Rootfall Warren tiles and decor. 16x16 tiles, 4-bit wall adjacency intended for the
 * autotiler (floor/edge/wall-face/wall-top documented in docs/ART_NOTES.md).
 */
import { C } from './palette';
import {
  createPixmap,
  fillEllipse,
  fillPolygon,
  fillRect,
  hline,
  line,
  setPx,
  speckle,
  vline,
  type Pixmap,
} from './px';
import { hash2 } from './px';

export const TILE = 16;

function floorTile(variant: number): Pixmap {
  // Gaps are the darkest thing in the room and the stone faces sit three steps above them:
  // at one step the joints vanished at 1x and the floor turned into one flat field.
  const p = createPixmap(16, 16, C.ink900);
  const stones: [number, number, number, number][] =
    variant % 2 === 0
      ? [
          [0, 0, 10, 7],
          [11, 0, 5, 7],
          [0, 8, 5, 8],
          [6, 8, 10, 8],
        ]
      : [
          [0, 0, 6, 8],
          [7, 0, 9, 6],
          [0, 9, 9, 7],
          [10, 7, 6, 9],
        ];
  for (const [x, y, w, h] of stones) {
    fillRect(p, x + 1, y + 1, w - 1, h - 1, C.ink600);
    hline(p, x + 1, x + w - 2, y + 1, C.ink500);
    vline(p, x + 1, y + 2, y + h - 2, C.ink500);
    hline(p, x + 1, x + w - 1, y + h - 1, C.ink700);
    vline(p, x + w - 1, y + 1, y + h - 2, C.ink700);
  }
  // one glint per tile, and only on half of them, so the floor has a few quiet lights
  if (variant % 2 === 1) setPx(p, 2 + (variant % 3), 3, C.ink400);
  // moss in a joint, rare enough that it reads as a spot rather than a sprinkle
  if (hash2(variant, 23, 117 + variant) % 100 < 10) {
    const mx = 1 + (hash2(variant + 4, 20, 118 + variant) % 13);
    const my = 1 + (hash2(21, variant + 3, 119 + variant) % 13);
    fillRect(p, mx, my, 2, 1, C.moss5);
    setPx(p, mx, my + 1, C.moss5);
  }
  if (variant === 2) {
    line(p, 3, 2, 6, 6, C.ink800);
    line(p, 6, 6, 5, 10, C.ink800);
  }
  if (variant === 3) {
    line(p, 12, 12, 14, 14, C.ink800);
  }
  return p;
}

function wallFace(variant: number): Pixmap {
  const p = createPixmap(16, 16, C.ink600);
  // brick courses with a running bond that shifts per variant
  for (let row = 0; row < 3; row++) {
    const y = row * 6;
    hline(p, 0, 15, y, C.ink500);
    hline(p, 0, 15, y + 5, C.ink700);
    const offset = (row % 2 === 0 ? 0 : 5) + variant * 3;
    for (let x = offset; x < 20; x += 10) {
      if (x >= 0 && x <= 15) vline(p, x, y + 1, y + 4, C.ink700);
      if (x + 1 >= 0 && x + 1 <= 15) vline(p, x + 1, y + 1, y + 4, C.ink600);
    }
    for (let i = 0; i < 3; i++) {
      const x = hash2(i, row + variant * 7, 301) % 16;
      setPx(p, x, y + 1 + (hash2(row, i, 302) % 4), C.ink500);
    }
  }
  if (variant === 1) {
    // chipped corner
    setPx(p, 12, 3, C.ink700);
    setPx(p, 13, 3, C.ink700);
    setPx(p, 12, 4, C.ink500);
  }
  if (variant === 2) {
    // moss creeping down a joint
    vline(p, 9, 7, 11, C.moss5);
    setPx(p, 10, 10, C.moss4);
  }
  // damp streaks, barely there
  speckle(p, 0, 0, 16, 16, C.ink500, 0.02, 303 + variant);
  return p;
}

// Moss lives in short runs on the lip plus a few hangs. A full-width green row made the
// ceiling edge read as a fringe and repeated identically across all 20 tiles.
const MOSS_RUNS: readonly [number, number][][] = [
  [
    [1, 4],
    [9, 3],
  ],
  [
    [0, 3],
    [6, 5],
    [13, 2],
  ],
  [
    [3, 5],
    [11, 4],
  ],
];

const DRAPES: readonly [number, number][][] = [
  [
    [4, 4],
    [12, 2],
  ],
  [
    [2, 3],
    [8, 5],
    [14, 3],
  ],
  [
    [6, 6],
    [10, 2],
  ],
];

// The lip keeps exactly one lit row, notched per variant, and one dark joint below it.
// Two unbroken bright rows stacked the ceiling into a stripe that ran the whole 320px.
const LIP_NOTCHES: readonly [number, number][][] = [
  [
    [3, 2],
    [11, 3],
  ],
  [
    [0, 2],
    [7, 2],
    [14, 2],
  ],
  [
    [5, 3],
    [12, 2],
  ],
];

function wallTop(variant: number): Pixmap {
  const p = createPixmap(16, 16, C.ink600);
  fillRect(p, 0, 2, 16, 12, C.ink600);
  // stone lip, lit from the torches below
  hline(p, 0, 15, 2, C.ink500);
  for (const [x, len] of LIP_NOTCHES[variant]!) hline(p, x, x + len - 1, 2, C.ink600);
  hline(p, 0, 15, 5, C.ink700);
  for (let i = 0; i < 4; i++) {
    const x = hash2(i, 3, 402 + variant) % 16;
    setPx(p, x, 6 + (hash2(i, 4, 403 + variant) % 8), C.ink500);
  }
  speckle(p, 0, 7, 16, 9, C.ink500, 0.018, 404 + variant);
  for (const [x, len] of MOSS_RUNS[variant]!) {
    hline(p, x, x + len - 1, 1, C.moss5);
    setPx(p, x + 1, 0, C.moss4);
  }
  for (const [x, len] of DRAPES[variant]!) {
    vline(p, x, 2, 1 + len, C.moss5);
    setPx(p, x + 1, 1 + len, C.moss5);
    setPx(p, x, 2 + len, C.moss4);
  }
  return p;
}

function wallEdge(): Pixmap {
  const p = createPixmap(16, 16, C.ink600);
  fillRect(p, 0, 2, 16, 4, C.ink500);
  fillRect(p, 0, 6, 16, 1, C.ink700);
  fillRect(p, 0, 7, 16, 9, C.ink600);
  hline(p, 0, 15, 8, C.ink500);
  for (let i = 0; i < 2; i++) setPx(p, i * 6 + 2, 3, C.ink500);
  speckle(p, 0, 8, 16, 8, C.ink500, 0.02, 501);
  return p;
}

function torch(): Pixmap {
  const p = createPixmap(16, 24);
  // iron wall plate: the sconce must read as mounted, not a floating stick
  fillRect(p, 4, 4, 9, 8, C.ink500);
  hline(p, 4, 12, 4, C.ink400);
  vline(p, 4, 5, 10, C.ink400);
  setPx(p, 5, 5, C.steel2);
  setPx(p, 11, 5, C.steel2);
  setPx(p, 5, 10, C.ink600);
  setPx(p, 11, 10, C.ink600);
  // bracket arm from the plate, then a solid two-pixel stem lit on one side
  hline(p, 4, 10, 10, C.steel2);
  hline(p, 4, 10, 11, C.ink600);
  vline(p, 7, 12, 19, C.ink400);
  vline(p, 8, 12, 19, C.steel2);
  fillRect(p, 5, 19, 5, 2, C.ink500);
  setPx(p, 6, 20, C.steel2);
  setPx(p, 8, 16, C.steel1);
  // bowl
  fillPolygon(
    p,
    [
      [3, 7],
      [13, 7],
      [11, 11],
      [5, 11],
    ],
    C.ink400,
  );
  hline(p, 3, 13, 7, C.steel2);
  hline(p, 4, 12, 8, C.amber5);
  setPx(p, 5, 9, C.amber4);
  setPx(p, 10, 9, C.amber4);
  // drip shelf under the bowl
  fillRect(p, 4, 12, 9, 2, C.ink500);
  hline(p, 5, 11, 12, C.ink400);
  setPx(p, 5, 13, C.steel2);
  setPx(p, 10, 13, C.steel2);
  // ember bed
  setPx(p, 7, 8, C.amber3);
  setPx(p, 8, 8, C.amber2);
  setPx(p, 9, 8, C.ember2);
  return p;
}

function flameFrame(frame: number): Pixmap {
  const p = createPixmap(16, 16);
  const sway = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  // outer flame
  fillPolygon(
    p,
    [
      [8 + sway, 1],
      [11 + sway, 5],
      [12, 9],
      [10, 12],
      [8, 13],
      [6, 11],
      [5, 8],
      [6 + sway, 4],
    ],
    C.ember2,
  );
  fillPolygon(
    p,
    [
      [8 + sway, 3],
      [10 + sway, 6],
      [11, 9],
      [9, 12],
      [7, 11],
      [6, 8],
      [7 + sway, 5],
    ],
    C.amber3,
  );
  fillPolygon(
    p,
    [
      [8, 5],
      [9 + sway, 8],
      [9, 11],
      [7, 11],
      [7, 8],
    ],
    C.amber1,
  );
  setPx(p, 8, 8, C.amber0);
  setPx(p, 8, 9, C.paper0);
  setPx(p, 8, 10, C.amber0);
  // sparks
  if (frame === 1) {
    setPx(p, 12, 3, C.amber1);
    setPx(p, 4, 5, C.amber3);
  } else if (frame === 2) {
    setPx(p, 5, 3, C.amber1);
    setPx(p, 11, 6, C.amber3);
  }
  return p;
}

function fern(width: number, height: number, seed: number): Pixmap {
  const p = createPixmap(width, height);
  const stems = Math.max(2, Math.floor(width / 9));
  for (let s = 0; s < stems; s++) {
    const baseX = 3 + Math.floor((s * (width - 6)) / Math.max(1, stems - 1));
    const lean = (s % 2 === 0 ? -1 : 1) * (1 + (seed % 2));
    const topY = 1 + (hash2(s, seed, 601) % 3);
    const midX = baseX + lean * Math.floor(width / 5);
    line(p, baseX, height - 1, midX, topY + 2, C.moss5);
    line(p, midX, topY + 2, midX + lean, topY, C.moss4);
    const steps = Math.floor((height - topY) / 3);
    for (let i = 1; i <= steps; i++) {
      const t = i / (steps + 1);
      const x = Math.round(baseX + (midX - baseX) * t);
      const y = Math.round(height - 1 + (topY + 2 - (height - 1)) * t);
      const reach = Math.max(1, Math.round((1 - t) * 3));
      line(p, x, y, x - reach - 1, y - 1, C.moss4);
      line(p, x, y, x + reach + 1, y - 1, C.moss4);
      if (i % 3 === 0) setPx(p, x - reach - 1, y - 1, C.moss3);
      if (i % 4 === 0) setPx(p, x + reach + 1, y - 1, C.teal4);
    }
  }
  return p;
}

function puddle(): Pixmap {
  const p = createPixmap(24, 9);
  // Damp stone, not a cyan ellipse: dark rim, dithered pool floor, broken amber torch streak.
  fillEllipse(p, 12, 4, 11, 3, C.ink600);
  for (let y = -2; y <= 2; y++) {
    for (let x = -9; x <= 9; x++) {
      if ((x * x) / 81 + (y * y) / 4 > 1) continue;
      if (hash2(x + 40, y + 12, 7) % 100 < 42) setPx(p, 12 + x, 4 + y, C.teal4);
    }
  }
  hline(p, 8, 15, 3, C.teal3);
  setPx(p, 11, 2, C.amber2);
  setPx(p, 12, 3, C.amber3);
  setPx(p, 11, 4, C.amber4);
  setPx(p, 12, 5, C.amber3);
  setPx(p, 11, 6, C.amber5);
  setPx(p, 5, 5, C.ink400);
  setPx(p, 19, 5, C.ink400);
  return p;
}

function mushroom(): Pixmap {
  const p = createPixmap(12, 12);
  vline(p, 6, 6, 10, C.paper4);
  vline(p, 7, 6, 10, C.paper5);
  fillEllipse(p, 6, 5, 5, 3, C.teal3);
  hline(p, 2, 10, 5, C.teal3);
  setPx(p, 3, 4, C.teal2);
  setPx(p, 8, 3, C.teal2);
  setPx(p, 5, 2, C.cyan1);
  setPx(p, 7, 4, C.cyan2);
  hline(p, 3, 9, 7, C.moss5);
  setPx(p, 4, 6, C.moss4);
  return p;
}

export const FLOOR_TILES = [0, 1, 2, 3].map(floorTile);
export const WALL_FACES = [0, 1, 2].map(wallFace);
export const WALL_FACE = WALL_FACES[0]!;
export const WALL_TOPS = [0, 1, 2].map(wallTop);
export const WALL_TOP = WALL_TOPS[0]!;
export const WALL_EDGE = wallEdge();
export const TORCH = torch();
export const FLAME_FRAMES = [0, 1, 2].map(flameFrame);
export const FERN_SMALL = fern(28, 20, 1);
export const FERN_LARGE = fern(40, 30, 2);
export const PUDDLE = puddle();
export const MUSHROOM = mushroom();

export interface TileDef {
  key: string;
  tile: Pixmap;
}

export const TILE_DEFS: readonly TileDef[] = [
  ...FLOOR_TILES.map((tile, i) => ({ key: `tile.rootfall.floor${i}`, tile })),
  { key: 'tile.rootfall.wall.face', tile: WALL_FACE },
  ...WALL_TOPS.map((tile, i) => ({ key: `tile.rootfall.wall.top${i}`, tile })),
  { key: 'tile.rootfall.wall.edge', tile: WALL_EDGE },
  { key: 'tile.rootfall.torch', tile: TORCH },
  { key: 'decor.rootfall.fern.small', tile: FERN_SMALL },
  { key: 'decor.rootfall.fern.large', tile: FERN_LARGE },
  { key: 'decor.rootfall.puddle', tile: PUDDLE },
  { key: 'decor.rootfall.mushroom', tile: MUSHROOM },
];
