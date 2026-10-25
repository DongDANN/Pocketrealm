import { SPECIES, type Species, type SpeciesPart } from '../core/companion';
import { C } from './palette';
import { createPixmap, fillEllipse, fillPolygon, fillRect, hline, setPx, type Pixmap } from './px';

/**
 * Companion sprites drawn from the core species recipe. Core owns the shape (part boxes and roles);
 * this file owns colour, so a species reads the same on every screen and a level change never
 * touches the ledger.
 */

export const STAGE_PX = 32;

export type Role = 'body' | 'shade' | 'light' | 'accent' | 'eye';

export interface SpeciesPalette {
  body: number;
  shade: number;
  light: number;
  accent: number;
  eye: number;
  /** Rim used once the companion has evolved past its first stage. */
  rim: number;
}

const PALETTES: Record<string, SpeciesPalette> = {
  mossling: {
    body: C.moss3,
    shade: C.moss5,
    light: C.moss1,
    accent: C.amber2,
    eye: C.ink500,
    rim: C.gold1,
  },
  tollbug: {
    body: C.teal3,
    shade: C.teal4,
    light: C.teal1,
    accent: C.cyan3,
    eye: C.ink500,
    rim: C.gold1,
  },
  emberling: {
    body: C.ember2,
    shade: C.ember4,
    light: C.ember1,
    accent: C.amber2,
    eye: C.ink500,
    rim: C.gold1,
  },
};

/** Species added to core later still draw, in the mossling ramp, rather than throwing at render. */
const FALLBACK: SpeciesPalette = PALETTES.mossling!;

export function speciesPalette(key: string): SpeciesPalette {
  return PALETTES[key] ?? FALLBACK;
}

export function speciesKeys(): string[] {
  return SPECIES.map((species) => species.key);
}

function centre(part: SpeciesPart) {
  return {
    cx: Math.floor(part.x + part.w / 2),
    cy: Math.floor(part.y + part.h / 2),
    rx: Math.max(1, Math.floor(part.w / 2)),
    ry: Math.max(1, Math.floor(part.h / 2)),
  };
}

function drawPart(target: Pixmap, part: SpeciesPart, color: number): void {
  const { cx, cy, rx, ry } = centre(part);
  switch (part.shape) {
    case 'round':
      fillEllipse(target, cx, cy, rx, ry, color);
      break;
    case 'oval':
      fillEllipse(target, cx, cy, rx, Math.max(1, Math.round(ry / 2)), color);
      break;
    case 'blob':
      fillEllipse(target, cx, cy, rx, ry, color);
      fillRect(target, part.x + 1, cy, part.w - 2, Math.max(1, ry - 1), color);
      break;
    case 'drop':
      fillPolygon(
        target,
        [
          [cx, part.y],
          [part.x + part.w - 1, part.y + part.h - 1],
          [part.x, part.y + part.h - 1],
        ],
        color,
      );
      break;
  }
}

/** The top of the silhouette, so evolution marks land on the head instead of floating. */
function crownCenter(target: Pixmap): number {
  for (let y = 0; y < STAGE_PX; y++) {
    let left = -1;
    let right = -1;
    for (let x = 0; x < STAGE_PX; x++) {
      if (target.data[y * STAGE_PX + x] === 0) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left >= 0) return Math.floor((left + right) / 2);
  }
  return STAGE_PX / 2;
}

/**
 * Stage 1 is the bare recipe. Each later stage adds one thing: a gold rim, sparks above the head,
 * then a lit crown. The body geometry never changes, so a levelled companion is still recognisable.
 */
export function speciesSprite(species: Species, stage = 1): Pixmap {
  const target = createPixmap(STAGE_PX, STAGE_PX);
  const palette = speciesPalette(species.key);
  for (const part of species.build) drawPart(target, part, palette[part.role]);

  if (stage >= 2) rimAndCrown(target, palette.rim, stage);
  return target;
}

/**
 * Two-frame idle: the whole sprite settles by one art pixel. A still portrait reads as dead next to
 * the room's torches; this is the smallest motion that makes the companion look alive.
 */
export function speciesIdleFrames(species: Species, stage = 1): Pixmap[] {
  const rest = speciesSprite(species, stage);
  const dip = createPixmap(STAGE_PX, STAGE_PX);
  for (let y = 1; y < STAGE_PX; y++) {
    dip.data.set(rest.data.subarray((y - 1) * STAGE_PX, y * STAGE_PX), y * STAGE_PX);
  }
  return [rest, dip];
}

function rimAndCrown(target: Pixmap, rim: number, stage: number): void {
  const boxed: Pixmap = {
    w: STAGE_PX,
    h: STAGE_PX,
    data: Uint8Array.from(target.data),
  };
  for (let y = 0; y < STAGE_PX; y++) {
    for (let x = 0; x < STAGE_PX; x++) {
      if (target.data[y * STAGE_PX + x] !== 0) continue;
      if (touchingInk(boxed, x, y)) setPx(target, x, y, rim);
    }
  }
  const crown = crownCenter(boxed);
  if (stage >= 3) {
    setPx(target, crown - 3, 2, C.amber0);
    setPx(target, crown + 3, 2, C.amber0);
  }
  if (stage >= 4) hline(target, crown - 2, crown + 2, 1, C.gold0);
}

function touchingInk(target: Pixmap, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= STAGE_PX || ny >= STAGE_PX) continue;
    if (target.data[ny * STAGE_PX + nx] !== 0) return true;
  }
  return false;
}
