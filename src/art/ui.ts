/**
 * Pocketrealm UI kit seed: 9-slice panels and keys, guardian portraits, and 16px icons.
 * Exported as PNGs by scripts/gen-ui-assets.ts and used through CSS border-image.
 */
import { C, ELEMENT_RAMPS } from './palette';
import {
  colors,
  createPixmap,
  fillEllipse,
  fillPolygon,
  fillRect,
  hline,
  line,
  outline,
  setPx,
  strokeRect,
  vline,
  type Pixmap,
} from './px';

/**
 * Paper grain is a pair of two-pixel diagonal fibres, placed symmetrically. Random
 * single-pixel noise read as confetti and L-shaped blotches read as stains.
 */
function grain(target: Pixmap, spots: readonly [number, number][], color: number): void {
  for (const [x, y] of spots) {
    setPx(target, x, y, color);
    setPx(target, x + 1, y + 1, color);
  }
}

function corners(target: Pixmap, color: number, size = 1): void {
  const w = target.w;
  const h = target.h;
  for (let i = 0; i < size; i++) {
    setPx(target, i, i, 0);
    setPx(target, w - 1 - i, i, 0);
    setPx(target, i, h - 1 - i, 0);
    setPx(target, w - 1 - i, h - 1 - i, 0);
  }
  setPx(target, size, 0, color);
  setPx(target, 0, size, color);
  setPx(target, w - 1 - size, 0, color);
  setPx(target, w - 1, size, color);
  setPx(target, size, h - 1, color);
  setPx(target, 0, h - 1 - size, color);
  setPx(target, w - 1 - size, h - 1, color);
  setPx(target, w - 1, h - 1 - size, color);
}

export function ledgerPanel(): Pixmap {
  const p = createPixmap(24, 24, C.paper1);
  grain(
    p,
    [
      [9, 13],
      [14, 10],
    ],
    C.paper2,
  );
  // dark edge with lit top-left
  for (let x = 0; x < 24; x++) {
    setPx(p, x, 0, C.ink500);
    setPx(p, x, 23, C.ink600);
  }
  for (let y = 0; y < 24; y++) {
    setPx(p, 0, y, C.ink500);
    setPx(p, 23, y, C.ink600);
  }
  hline(p, 1, 22, 1, C.paper0);
  vline(p, 1, 1, 22, C.paper0);
  hline(p, 1, 22, 22, C.paper4);
  vline(p, 22, 1, 22, C.paper4);
  // inner rule
  hline(p, 3, 20, 3, C.paper3);
  vline(p, 3, 3, 20, C.paper3);
  // corner brackets + studs
  for (const [cx, cy, dx, dy] of [
    [3, 3, 1, 1],
    [20, 3, -1, 1],
    [3, 20, 1, -1],
    [20, 20, -1, -1],
  ] as const) {
    hline(p, cx, cx + dx * 4, cy, C.ink500);
    vline(p, cx, cy, cy + dy * 4, C.ink500);
    fillRect(p, cx - 1, cy - 1, 3, 3, C.paper4);
    setPx(p, cx, cy, C.amber4);
    setPx(p, cx, cy - 1, C.amber2);
  }
  return p;
}

export function delvePanel(): Pixmap {
  const p = createPixmap(24, 24, C.ink600);
  // A quarter-density ordered dither turned the whole plate into a checkerboard that fought
  // the digits on top of it. This is ore dust in the iron, not a screen.
  dither(p, 1, 1, 22, 22, C.ink500, C.ink600, 0.1);
  for (let x = 0; x < 24; x++) {
    setPx(p, x, 0, C.ink900);
    setPx(p, x, 23, C.ink900);
  }
  for (let y = 0; y < 24; y++) {
    setPx(p, 0, y, C.ink900);
    setPx(p, 23, y, C.ink900);
  }
  hline(p, 1, 22, 1, C.steel2);
  vline(p, 1, 1, 22, C.steel2);
  hline(p, 1, 22, 2, C.ink400);
  vline(p, 2, 1, 22, C.ink400);
  hline(p, 1, 22, 22, C.ink800);
  vline(p, 22, 1, 22, C.ink800);
  // corner crystals
  for (const [cx, cy] of [
    [3, 3],
    [20, 3],
    [3, 20],
    [20, 20],
  ] as const) {
    setPx(p, cx, cy - 1, C.cyan2);
    setPx(p, cx - 1, cy, C.cyan3);
    setPx(p, cx, cy, C.cyan1);
    setPx(p, cx + 1, cy, C.cyan3);
    setPx(p, cx, cy + 1, C.ink400);
  }
  return p;
}

function buttonBase(fill: number, top: number, bottom: number, edge: number): Pixmap {
  const p = createPixmap(24, 16, fill);
  for (let x = 0; x < 24; x++) {
    setPx(p, x, 0, edge);
    setPx(p, x, 15, edge);
  }
  for (let y = 0; y < 16; y++) {
    setPx(p, 0, y, edge);
    setPx(p, 23, y, edge);
  }
  hline(p, 1, 22, 1, top);
  vline(p, 1, 1, 14, top);
  hline(p, 1, 22, 14, bottom);
  vline(p, 22, 1, 14, bottom);
  corners(p, edge, 1);
  return p;
}

export const BUTTON_NORMAL = buttonBase(C.amber2, C.amber0, C.amber5, C.ink900);
export const BUTTON_HOVER = buttonBase(C.amber3, C.amber1, C.amber5, C.ink900);
export const BUTTON_PRESSED = buttonBase(C.amber4, C.amber5, C.amber2, C.ink900);
export const BUTTON_DISABLED = buttonBase(C.steel2, C.steel1, C.steel2, C.ink500);

function keyBase(fill: number, top: number, bottom: number): Pixmap {
  const p = createPixmap(24, 24, fill);
  // grain kept to the corners so it never muddies the digit
  grain(
    p,
    [
      [5, 17],
      [17, 5],
    ],
    C.paper3,
  );
  for (let x = 0; x < 24; x++) {
    setPx(p, x, 0, C.ink500);
    setPx(p, x, 23, C.ink600);
  }
  for (let y = 0; y < 24; y++) {
    setPx(p, 0, y, C.ink500);
    setPx(p, 23, y, C.ink600);
  }
  hline(p, 1, 22, 1, top);
  vline(p, 1, 1, 22, top);
  hline(p, 1, 22, 22, bottom);
  vline(p, 22, 1, 22, bottom);
  corners(p, C.ink600, 2);
  setPx(p, 2, 0, C.ink500);
  setPx(p, 0, 2, C.ink500);
  return p;
}

export const KEY_NORMAL = keyBase(C.paper2, C.paper0, C.paper4);
export const KEY_PRESSED = keyBase(C.paper3, C.paper4, C.paper1);

export function dither(
  target: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  a: number,
  b: number,
  density: number,
): void {
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if ((xx + yy * 3) % 4 === 0 && (xx * 7 + yy * 13) % 10 < density * 10)
        setPx(target, x + xx, y + yy, a);
      else setPx(target, x + xx, y + yy, b);
    }
  }
}

export type GuardianState = 'calm' | 'alert' | 'strain' | 'over';

export function guardian(state: GuardianState): Pixmap {
  const p = createPixmap(24, 24);
  // stone ring
  fillEllipse(p, 12, 12, 10, 10, C.ink600);
  fillEllipse(p, 12, 12, 9, 9, C.ink400);
  fillEllipse(p, 12, 11, 8, 8, C.ink500);
  // The ring is dark stone on a dark panel, so it needs its own lit upper-left arc or the
  // whole guardian dissolves into the background.
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    const x = Math.round(12 + Math.cos(ang) * 9.5);
    const y = Math.round(12 + Math.sin(ang) * 9.5);
    if (x < 0 || y < 0 || x > 23 || y > 23) continue;
    if (!p.data[y * 24 + x]) continue;
    const lit = ang > Math.PI * 0.8 && ang < Math.PI * 1.75;
    setPx(p, x, y, lit ? C.steel2 : C.ink800);
  }
  // moss face
  const face = state === 'over' ? C.steel1 : state === 'strain' ? C.ember1 : C.moss2;
  const shadow = state === 'over' ? C.steel2 : state === 'strain' ? C.ember3 : C.moss4;
  fillEllipse(p, 12, 12, 7, 7, shadow);
  fillEllipse(p, 12, 11, 6, 6, face);
  // leaf tuft
  setPx(p, 15, 4, C.moss3);
  setPx(p, 16, 3, C.teal2);
  setPx(p, 16, 4, C.moss2);
  setPx(p, 14, 4, C.moss4);
  // eyes
  const eye = state === 'calm' ? C.ink700 : state === 'over' ? C.ink900 : C.amber3;
  if (state === 'over') {
    hline(p, 8, 10, 11, C.ink900);
    hline(p, 14, 16, 11, C.ink900);
  } else {
    setPx(p, 9, 10, eye);
    setPx(p, 10, 10, eye);
    setPx(p, 15, 10, eye);
    setPx(p, 16, 10, eye);
    if (state !== 'calm') {
      setPx(p, 8, 9, C.ink600);
      setPx(p, 9, 9, C.ink600);
      setPx(p, 15, 9, C.ink600);
      setPx(p, 16, 9, C.ink600);
    }
  }
  // mouth
  if (state === 'calm') {
    setPx(p, 11, 15, C.ink600);
    setPx(p, 12, 16, C.ink600);
    setPx(p, 13, 15, C.ink600);
  } else if (state === 'alert') {
    // an open mouth, not a flat line: calm and alert have to differ by mass at 1x
    hline(p, 11, 13, 15, C.ink600);
    setPx(p, 11, 16, C.ink600);
    setPx(p, 13, 16, C.ink600);
    hline(p, 12, 12, 17, C.ink600);
  } else if (state === 'strain') {
    setPx(p, 10, 16, C.ink600);
    setPx(p, 11, 17, C.ink600);
    setPx(p, 12, 16, C.ink600);
    setPx(p, 13, 17, C.ink600);
    setPx(p, 14, 16, C.ink600);
  } else {
    hline(p, 10, 14, 15, C.ink700);
    setPx(p, 11, 14, C.paper3);
    setPx(p, 13, 14, C.paper3);
  }
  // cheek highlights
  setPx(p, 7, 13, state === 'strain' ? C.amber2 : C.moss1);
  setPx(p, 17, 13, state === 'strain' ? C.amber2 : C.moss1);
  // ring highlights
  setPx(p, 6, 5, C.steel2);
  setPx(p, 7, 4, C.steel1);
  setPx(p, 17, 17, C.ink600);
  if (state === 'strain') {
    line(p, 18, 7, 20, 10, C.ink600);
  }
  return p;
}

export function iconCoin(): Pixmap {
  const p = createPixmap(16, 16);
  fillEllipse(p, 8, 8, 6, 6, C.gold2);
  fillEllipse(p, 8, 8, 5, 5, C.gold1);
  fillEllipse(p, 8, 7, 4, 4, C.amber2);
  hline(p, 5, 10, 6, C.gold0);
  setPx(p, 5, 6, C.paper0);
  setPx(p, 6, 7, C.amber1);
  setPx(p, 9, 10, C.amber4);
  setPx(p, 10, 11, C.gold2);
  return p;
}

export function iconSpark(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [8, 1],
      [10, 6],
      [15, 8],
      [10, 10],
      [8, 15],
      [6, 10],
      [1, 8],
      [6, 6],
    ],
    C.cyan3,
  );
  fillPolygon(
    p,
    [
      [8, 3],
      [9, 7],
      [13, 8],
      [9, 9],
      [8, 13],
      [7, 9],
      [3, 8],
      [7, 7],
    ],
    C.cyan1,
  );
  fillRect(p, 7, 7, 2, 2, C.cyan0);
  setPx(p, 8, 4, C.cyan0);
  return p;
}

export function iconOil(): Pixmap {
  const p = createPixmap(16, 16);
  // droplet
  fillPolygon(
    p,
    [
      [8, 1],
      [12, 7],
      [11, 12],
      [8, 14],
      [5, 12],
      [4, 7],
    ],
    C.amber4,
  );
  fillPolygon(
    p,
    [
      [8, 3],
      [10, 8],
      [10, 11],
      [8, 12],
      [6, 11],
      [6, 8],
    ],
    C.amber2,
  );
  setPx(p, 7, 6, C.amber0);
  setPx(p, 7, 7, C.amber1);
  setPx(p, 6, 9, C.amber1);
  setPx(p, 11, 8, C.amber5);
  return p;
}

export function iconPlus(): Pixmap {
  const p = createPixmap(16, 16);
  fillRect(p, 7, 3, 2, 10, C.paper0);
  fillRect(p, 3, 7, 10, 2, C.paper0);
  setPx(p, 8, 12, C.paper3);
  setPx(p, 12, 8, C.paper3);
  setPx(p, 7, 2, C.paper3);
  setPx(p, 2, 7, C.paper3);
  return p;
}

export function iconCheck(): Pixmap {
  const p = createPixmap(16, 16);
  line(p, 3, 8, 6, 12, C.moss1);
  line(p, 6, 12, 13, 3, C.moss1);
  line(p, 2, 8, 5, 13, C.moss3);
  line(p, 5, 13, 13, 4, C.moss3);
  setPx(p, 12, 3, C.moss0);
  return p;
}

export function iconClock(): Pixmap {
  const p = createPixmap(16, 16);
  fillEllipse(p, 8, 8, 6, 6, C.steel2);
  fillEllipse(p, 8, 8, 5, 5, C.ink500);
  vline(p, 8, 5, 8, C.paper2);
  line(p, 8, 8, 11, 9, C.paper2);
  setPx(p, 8, 8, C.amber2);
  return p;
}

/** The Envelopes tab: a glass jar with the coin line low in it. */
export function iconJars(): Pixmap {
  const p = createPixmap(16, 16);
  fillRect(p, 5, 1, 6, 2, C.steel1);
  fillRect(p, 6, 3, 4, 1, C.steel2);
  strokeRect(p, 3, 4, 10, 11, C.steel1);
  fillRect(p, 4, 5, 8, 9, C.ink500);
  fillRect(p, 4, 10, 8, 4, C.amber3);
  hline(p, 4, 11, 10, C.amber1);
  hline(p, 4, 11, 12, C.amber1);
  vline(p, 5, 6, 8, C.paper3);
  return p;
}

export function iconWarn(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [8, 1],
      [15, 14],
      [1, 14],
    ],
    C.amber3,
  );
  fillPolygon(
    p,
    [
      [8, 4],
      [13, 13],
      [3, 13],
    ],
    C.amber2,
  );
  fillRect(p, 7, 6, 2, 5, C.ink700);
  setPx(p, 8, 12, C.ink700);
  return p;
}

export function iconGear(): Pixmap {
  const p = createPixmap(16, 16);
  fillRect(p, 6, 2, 4, 12, C.steel1);
  fillRect(p, 2, 6, 12, 4, C.steel1);
  fillRect(p, 4, 4, 8, 8, C.steel2);
  fillEllipse(p, 8, 8, 3, 3, C.steel1);
  fillEllipse(p, 8, 8, 2, 2, C.ink600);
  setPx(p, 8, 7, C.steel0);
  setPx(p, 6, 3, C.steel0);
  return p;
}

export function iconMusic(): Pixmap {
  const p = createPixmap(16, 16);
  vline(p, 6, 3, 11, C.paper1);
  vline(p, 12, 2, 9, C.paper1);
  hline(p, 6, 12, 3, C.paper1);
  fillEllipse(p, 4, 12, 2, 1, C.paper1);
  fillEllipse(p, 10, 10, 2, 1, C.paper1);
  setPx(p, 7, 3, C.paper0);
  return p;
}

export function iconArrow(): Pixmap {
  const p = createPixmap(16, 16);
  line(p, 2, 8, 13, 8, C.paper2);
  line(p, 9, 4, 13, 8, C.paper2);
  line(p, 9, 12, 13, 8, C.paper2);
  setPx(p, 13, 8, C.amber2);
  return p;
}

/**
 * Keycap glyph drawn on the bitmap face's own 8-row metric with 1px strokes, so it sits at the
 * same optical size and weight as the digits it shares a pad with.
 */
export function iconBackspace(): Pixmap {
  const p = createPixmap(10, 8);
  line(p, 4, 0, 9, 0, C.ink900);
  line(p, 9, 0, 9, 7, C.ink900);
  line(p, 9, 7, 4, 7, C.ink900);
  line(p, 4, 7, 0, 4, C.ink900);
  line(p, 0, 4, 4, 0, C.ink900);
  // deletion mark
  line(p, 5, 2, 8, 5, C.ink900);
  line(p, 8, 2, 5, 5, C.ink900);
  // one step of top light so it does not read as a flat wire
  line(p, 5, 1, 8, 1, C.ink600);
  return p;
}

/**
 * Focus ring: a dark outer stroke for parchment and a bright inner stroke for steel, so one
 * 1px-wide asset stays visible wherever a control sits.
 */
export function focusRing(): Pixmap {
  const p = createPixmap(24, 24);
  for (let x = 0; x < 24; x++) {
    setPx(p, x, 0, C.ink900);
    setPx(p, x, 23, C.ink900);
    setPx(p, x, 1, C.amber0);
    setPx(p, x, 22, C.amber0);
  }
  for (let y = 0; y < 24; y++) {
    setPx(p, 0, y, C.ink900);
    setPx(p, 23, y, C.ink900);
    setPx(p, 1, y, C.amber0);
    setPx(p, 22, y, C.amber0);
  }
  corners(p, C.amber0, 1);
  return p;
}

/**
 * Delve glyph set: seven statuses, eight affixes, four elements. The three families are deliberately
 * different shapes — statuses are organic, affixes are hard-edged badges, elements are cut gems —
 * because at 16px on a phone a colour difference alone does not read across a whole list.
 */

/** Style lock: no hairlines. Every run gets a second pixel beside it. */
function stroke(p: Pixmap, x0: number, y0: number, x1: number, y1: number, color: number): void {
  line(p, x0, y0, x1, y1, color);
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) line(p, x0, y0 + 1, x1, y1 + 1, color);
  else line(p, x0 + 1, y0, x1 + 1, y1, color);
}

/** A 2px band, punched out instead of traced so it never lands on a single-pixel circle. */
function band(p: Pixmap, cx: number, cy: number, radius: number, color: number): void {
  fillEllipse(p, cx, cy, radius, radius, color);
  fillEllipse(p, cx, cy, radius - 2, radius - 2, C.clear);
}

export function iconBurn(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [8, 2],
      [11, 6],
      [12, 9],
      [10, 13],
      [6, 13],
      [4, 9],
      [5, 6],
    ],
    C.ember2,
  );
  fillPolygon(
    p,
    [
      [8, 5],
      [10, 9],
      [9, 12],
      [7, 12],
      [6, 9],
    ],
    C.ember1,
  );
  fillRect(p, 7, 9, 2, 3, C.amber0);
  outline(p, C.ink800);
  return p;
}

export function iconPoison(): Pixmap {
  const p = createPixmap(16, 16);
  // Each bubble carries its own dark rim. A single outline around the union welded them into one
  // green blob at 1x.
  fillEllipse(p, 5, 5, 4, 4, C.moss5);
  fillEllipse(p, 5, 5, 3, 3, C.moss3);
  fillEllipse(p, 11, 11, 4, 4, C.moss5);
  fillEllipse(p, 11, 11, 3, 3, C.moss3);
  fillEllipse(p, 12, 4, 2, 2, C.moss5);
  fillEllipse(p, 12, 4, 1, 1, C.moss3);
  setPx(p, 4, 3, C.moss0);
  setPx(p, 10, 9, C.moss0);
  return p;
}

export function iconChill(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [4, 5],
      [12, 5],
      [11, 8],
      [8, 14],
      [5, 8],
    ],
    C.frost3,
  );
  fillPolygon(
    p,
    [
      [6, 6],
      [10, 6],
      [9, 8],
      [8, 12],
      [7, 8],
    ],
    C.frost1,
  );
  // The ledge the icicle hangs from, so it is not just an upward-pointing triangle like the Gale gem.
  fillRect(p, 2, 2, 12, 3, C.frost4);
  fillRect(p, 3, 3, 10, 1, C.frost2);
  setPx(p, 4, 3, C.frost0);
  setPx(p, 5, 3, C.frost0);
  outline(p, C.ink800);
  return p;
}

/**
 * A bolt, not a burst of rays: eight 2px rays still read as one smudge at 16px, and stun has to be
 * recognisable in a combat row where six other glyphs compete for the same few pixels.
 */
export function iconStun(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [9, 1],
      [4, 9],
      [7, 9],
      [6, 15],
      [12, 7],
      [9, 7],
    ],
    C.amber2,
  );
  fillPolygon(
    p,
    [
      [9, 4],
      [6, 9],
      [8, 9],
      [8, 4],
    ],
    C.amber0,
  );
  outline(p, C.ink800);
  return p;
}

export function iconMark(): Pixmap {
  const p = createPixmap(16, 16);
  band(p, 8, 8, 7, C.rose2);
  fillEllipse(p, 8, 8, 2, 2, C.rose0);
  setPx(p, 4, 4, C.rose0);
  return p;
}

export function iconShield(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [3, 3],
      [13, 3],
      [13, 8],
      [8, 14],
      [3, 8],
    ],
    C.steel2,
  );
  fillPolygon(
    p,
    [
      [5, 5],
      [11, 5],
      [11, 8],
      [8, 12],
      [5, 8],
    ],
    C.steel1,
  );
  stroke(p, 8, 4, 8, 12, C.cyan1);
  setPx(p, 6, 6, C.steel0);
  setPx(p, 7, 5, C.steel0);
  outline(p, C.ink800);
  return p;
}

export function iconRegen(): Pixmap {
  const p = createPixmap(16, 16);
  fillEllipse(p, 8, 8, 6, 6, C.moss5);
  fillEllipse(p, 8, 8, 5, 5, C.moss4);
  stroke(p, 8, 3, 8, 12, C.moss0);
  stroke(p, 3, 8, 12, 8, C.moss0);
  setPx(p, 6, 5, C.moss1);
  return p;
}

export function iconArmored(): Pixmap {
  const p = createPixmap(16, 16);
  fillRect(p, 2, 4, 12, 9, C.steel2);
  fillRect(p, 3, 5, 10, 7, C.steel1);
  for (const x of [5, 8, 11]) stroke(p, x, 5, x, 11, C.steel2);
  hline(p, 3, 12, 3, C.steel0);
  setPx(p, 4, 7, C.steel0);
  setPx(p, 4, 8, C.steel0);
  outline(p, C.ink800);
  return p;
}

export function iconSwift(): Pixmap {
  const p = createPixmap(16, 16);
  stroke(p, 7, 2, 12, 8, C.cyan1);
  stroke(p, 12, 8, 7, 14, C.cyan1);
  stroke(p, 1, 5, 4, 5, C.cyan3);
  stroke(p, 1, 10, 4, 10, C.cyan3);
  setPx(p, 11, 8, C.cyan0);
  return p;
}

export function iconVampiric(): Pixmap {
  const p = createPixmap(16, 16);
  fillRect(p, 3, 3, 10, 3, C.rose4);
  fillRect(p, 4, 4, 8, 2, C.rose3);
  fillPolygon(
    p,
    [
      [5, 6],
      [7, 6],
      [6, 11],
    ],
    C.paper0,
  );
  fillPolygon(
    p,
    [
      [9, 6],
      [11, 6],
      [10, 11],
    ],
    C.paper0,
  );
  fillPolygon(
    p,
    [
      [8, 11],
      [9, 13],
      [8, 15],
      [7, 13],
    ],
    C.rose1,
  );
  setPx(p, 4, 3, C.rose0);
  setPx(p, 5, 3, C.rose0);
  return p;
}

export function iconSplitting(): Pixmap {
  const p = createPixmap(16, 16);
  fillEllipse(p, 5, 5, 4, 4, C.violet5);
  fillEllipse(p, 5, 5, 3, 3, C.violet3);
  fillEllipse(p, 11, 11, 4, 4, C.violet5);
  fillEllipse(p, 11, 11, 3, 3, C.violet3);
  setPx(p, 4, 3, C.violet1);
  setPx(p, 10, 9, C.violet1);
  return p;
}

export function iconEnraged(): Pixmap {
  const p = createPixmap(16, 16);
  fillPolygon(
    p,
    [
      [2, 2],
      [6, 4],
      [4, 9],
      [1, 7],
    ],
    C.ember2,
  );
  fillPolygon(
    p,
    [
      [14, 2],
      [10, 4],
      [12, 9],
      [15, 7],
    ],
    C.ember2,
  );
  fillEllipse(p, 8, 10, 5, 4, C.ember3);
  fillEllipse(p, 8, 10, 4, 3, C.ember2);
  stroke(p, 5, 9, 7, 10, C.amber0);
  stroke(p, 11, 9, 9, 10, C.amber0);
  outline(p, C.ink800);
  return p;
}

export function iconThorned(): Pixmap {
  const p = createPixmap(16, 16);
  stroke(p, 8, 1, 8, 15, C.moss4);
  fillPolygon(
    p,
    [
      [8, 4],
      [3, 6],
      [8, 8],
    ],
    C.moss2,
  );
  fillPolygon(
    p,
    [
      [8, 9],
      [13, 11],
      [8, 13],
    ],
    C.moss2,
  );
  setPx(p, 4, 6, C.moss0);
  setPx(p, 12, 11, C.moss0);
  outline(p, C.ink800);
  return p;
}

export function iconWarded(): Pixmap {
  const p = createPixmap(16, 16);
  band(p, 8, 8, 6, C.teal2);
  stroke(p, 8, 4, 8, 12, C.teal1);
  stroke(p, 8, 6, 11, 9, C.teal1);
  stroke(p, 8, 6, 5, 9, C.teal1);
  stroke(p, 5, 11, 11, 11, C.teal1);
  setPx(p, 8, 8, C.amber0);
  return p;
}

export function iconFrenzied(): Pixmap {
  const p = createPixmap(16, 16);
  stroke(p, 3, 13, 12, 4, C.steel1);
  stroke(p, 13, 13, 4, 4, C.steel1);
  stroke(p, 2, 14, 5, 11, C.amber3);
  stroke(p, 14, 14, 11, 11, C.amber3);
  setPx(p, 8, 8, C.paper0);
  setPx(p, 7, 7, C.paper1);
  outline(p, C.ink800);
  return p;
}

/** The four elements as four different cuts, tinted from `ELEMENT_RAMPS` so the gem never drifts. */
function gem(
  cut: 'diamond' | 'hex' | 'wedge' | 'seal',
  element: keyof typeof ELEMENT_RAMPS,
): Pixmap {
  const [hi, mid, dark, edge] = colors(ELEMENT_RAMPS[element]);
  const p = createPixmap(16, 16);
  const shapes = {
    diamond: [
      [8, 1],
      [14, 8],
      [8, 15],
      [2, 8],
    ],
    hex: [
      [5, 2],
      [11, 2],
      [14, 8],
      [11, 14],
      [5, 14],
      [2, 8],
    ],
    wedge: [
      [8, 2],
      [14, 13],
      [2, 13],
    ],
    seal: [
      [4, 2],
      [12, 2],
      [14, 4],
      [14, 12],
      [12, 14],
      [4, 14],
      [2, 12],
      [2, 4],
    ],
  } as const;
  fillPolygon(
    p,
    shapes[cut].map(([x, y]) => [x, y] as [number, number]),
    dark,
  );
  fillPolygon(
    p,
    shapes[cut]
      .map(([x, y]) => [8 + Math.round((x - 8) * 0.72), 8 + Math.round((y - 8) * 0.72)])
      .map(([x, y]) => [x, y] as [number, number]),
    mid,
  );
  const facet = {
    diamond: () => stroke(p, 8, 3, 8, 13, hi),
    hex: () => stroke(p, 4, 8, 12, 8, hi),
    wedge: () => stroke(p, 8, 4, 8, 12, hi),
    seal: () => stroke(p, 5, 5, 11, 11, hi),
  }[cut];
  facet();
  outline(p, edge);
  return p;
}

export const STATUS_ICONS = {
  burn: iconBurn,
  poison: iconPoison,
  chill: iconChill,
  stun: iconStun,
  mark: iconMark,
  shield: iconShield,
  regen: iconRegen,
} as const;

export const AFFIX_ICONS = {
  armored: iconArmored,
  swift: iconSwift,
  vampiric: iconVampiric,
  splitting: iconSplitting,
  enraged: iconEnraged,
  thorned: iconThorned,
  warded: iconWarded,
  frenzied: iconFrenzied,
} as const;

export const ELEMENT_ICONS = {
  ember: () => gem('diamond', 'ember'),
  frost: () => gem('hex', 'frost'),
  gale: () => gem('wedge', 'gale'),
  umbra: () => gem('seal', 'umbra'),
} as const;

export interface UiAsset {
  key: string;
  pix: Pixmap;
}
export const UI_ASSETS: readonly UiAsset[] = [
  { key: 'ui.panel.ledger', pix: ledgerPanel() },
  { key: 'ui.panel.delve', pix: delvePanel() },
  { key: 'ui.button.normal', pix: BUTTON_NORMAL },
  { key: 'ui.button.hover', pix: BUTTON_HOVER },
  { key: 'ui.button.pressed', pix: BUTTON_PRESSED },
  { key: 'ui.button.disabled', pix: BUTTON_DISABLED },
  { key: 'ui.key.normal', pix: KEY_NORMAL },
  { key: 'ui.key.pressed', pix: KEY_PRESSED },
  { key: 'ui.focus.ring', pix: focusRing() },
  { key: 'ui.guardian.calm', pix: guardian('calm') },
  { key: 'ui.guardian.alert', pix: guardian('alert') },
  { key: 'ui.guardian.strain', pix: guardian('strain') },
  { key: 'ui.guardian.over', pix: guardian('over') },
  { key: 'ui.icon.coin', pix: iconCoin() },
  { key: 'ui.icon.spark', pix: iconSpark() },
  { key: 'ui.icon.oil', pix: iconOil() },
  { key: 'ui.icon.plus', pix: iconPlus() },
  { key: 'ui.icon.check', pix: iconCheck() },
  { key: 'ui.icon.clock', pix: iconClock() },
  { key: 'ui.icon.jars', pix: iconJars() },
  { key: 'ui.icon.warn', pix: iconWarn() },
  { key: 'ui.icon.gear', pix: iconGear() },
  { key: 'ui.icon.music', pix: iconMusic() },
  { key: 'ui.icon.arrow', pix: iconArrow() },
  { key: 'ui.icon.backspace', pix: iconBackspace() },
  ...Object.entries(STATUS_ICONS).map(([id, draw]) => ({
    key: `ui.icon.status.${id}`,
    pix: draw(),
  })),
  ...Object.entries(AFFIX_ICONS).map(([id, draw]) => ({
    key: `ui.icon.affix.${id}`,
    pix: draw(),
  })),
  ...Object.entries(ELEMENT_ICONS).map(([id, draw]) => ({
    key: `ui.icon.element.${id}`,
    pix: draw(),
  })),
];
