/**
 * The Realm: a floating island that grows as the budgeting habits grow.
 *
 * This is the payoff view. Every building on it is unlocked by something the player actually did in
 * the ledger, so the scene has to show two distinct states honestly — a plot with a lantern on it is
 * not a building, and pretending otherwise would be the dead-button equivalent in art form.
 *
 * Same rules as the battle stages: 320x180, master palette only, integer parallax, and no layer is
 * drawn with a gradient. Day and night are four hand-picked tone tables rather than a colour
 * interpolation, because an interpolation across 64 colours is how you get confetti.
 */
import { C } from '../palette';
import {
  BAYER4,
  blit,
  createPixmap,
  dissolve,
  fillEllipse,
  fillPolygon,
  fillRect,
  hash2,
  hline,
  line,
  px,
  setPx,
  vline,
  type Pixmap,
} from '../px';
import { addLight, lightBlob, SCENE_H, SCENE_W, vignette } from './rootfall';

export type RealmPeriod = 'dawn' | 'day' | 'dusk' | 'night';

/** Local clock hour to one of four skies. Midnight to five is still night; nobody needs 24 skies. */
export function periodForHour(hour: number): RealmPeriod {
  if (hour < 5 || hour >= 21) return 'night';
  if (hour < 8) return 'dawn';
  if (hour < 17) return 'day';
  return 'dusk';
}

export const REALM_BUILDINGS = [
  'treasury',
  'library',
  'smithy',
  'observatory',
  'workshop',
] as const;
export type RealmBuilding = (typeof REALM_BUILDINGS)[number];

/**
 * Every colour the scene may use, chosen per period. A painter reaches for `C.*` directly only when
 * the thing it paints is that colour at every hour of the day — gold in a coin slot, amber in a fire.
 */
interface Tones {
  /** Four bands, each one step of the same ramp from the next, so a dithered seam is a fade. */
  top: number;
  mid: number;
  horizon: number;
  glow: number;
  /** Below the island: the void it floats in, and the mist bands that prove the void is deep. */
  deep: number;
  abyss: number;
  mist: number;
  orb: number;
  cloud: number;
  cloudLit: number;
  rock: number;
  rockLit: number;
  rockDark: number;
  soil: number;
  /** The underside crescent of the island, one step darker than the dirt on top of it. */
  rim: number;
  grass: number;
  grassLit: number;
  grassDark: number;
  wall: number;
  wallLit: number;
  wallDark: number;
  roof: number;
  roofLit: number;
  roofDark: number;
  /** `glass` is a window with nobody home; `glassLit` is one with somebody in there. */
  glass: number;
  glassLit: number;
  metal: number;
  stars: boolean;
  birds: boolean;
}

const TONES: Record<RealmPeriod, Tones> = {
  dawn: {
    top: C.frost5,
    mid: C.frost4,
    horizon: C.frost2,
    glow: C.rose2,
    deep: C.rose4,
    abyss: C.ink900,
    mist: C.rose3,
    orb: C.amber1,
    cloud: C.rose3,
    cloudLit: C.rose1,
    rock: C.ink600,
    rockLit: C.ink400,
    rockDark: C.ink800,
    soil: C.amber5,
    rim: C.ember4,
    grass: C.moss4,
    grassLit: C.moss3,
    grassDark: C.moss5,
    wall: C.ink400,
    wallLit: C.ink300,
    wallDark: C.ink600,
    roof: C.rose4,
    roofLit: C.rose2,
    roofDark: C.ink700,
    glass: C.ink700,
    glassLit: C.amber2,
    metal: C.steel2,
    stars: false,
    birds: true,
  },
  day: {
    top: C.frost5,
    mid: C.cyan5,
    horizon: C.cyan3,
    glow: C.cyan1,
    deep: C.cyan5,
    abyss: C.ink900,
    mist: C.cyan4,
    orb: C.paper0,
    cloud: C.paper2,
    cloudLit: C.paper0,
    rock: C.ink500,
    rockLit: C.ink300,
    rockDark: C.ink700,
    soil: C.amber5,
    rim: C.ember4,
    grass: C.moss3,
    grassLit: C.moss2,
    grassDark: C.moss5,
    wall: C.steel2,
    wallLit: C.steel1,
    wallDark: C.ink400,
    roof: C.rose3,
    roofLit: C.rose1,
    roofDark: C.rose4,
    glass: C.cyan5,
    glassLit: C.amber2,
    metal: C.steel1,
    stars: false,
    birds: true,
  },
  dusk: {
    top: C.violet5,
    mid: C.violet4,
    horizon: C.rose3,
    glow: C.amber4,
    deep: C.ember4,
    abyss: C.ink900,
    mist: C.ember3,
    orb: C.amber1,
    cloud: C.rose3,
    cloudLit: C.amber1,
    rock: C.ink600,
    rockLit: C.rose4,
    rockDark: C.ink800,
    soil: C.amber5,
    rim: C.ink700,
    grass: C.moss5,
    grassLit: C.moss4,
    grassDark: C.ink800,
    wall: C.ink500,
    wallLit: C.ink300,
    wallDark: C.ink700,
    roof: C.ember3,
    roofLit: C.rose2,
    roofDark: C.ink800,
    glass: C.ink800,
    glassLit: C.amber1,
    metal: C.steel2,
    stars: false,
    birds: false,
  },
  night: {
    top: C.ink900,
    mid: C.ink800,
    horizon: C.ink700,
    glow: C.ink600,
    deep: C.ink700,
    abyss: C.ink900,
    mist: C.ink500,
    orb: C.frost1,
    cloud: C.ink600,
    cloudLit: C.ink500,
    rock: C.ink700,
    rockLit: C.ink500,
    rockDark: C.ink900,
    soil: C.ink600,
    rim: C.ink800,
    grass: C.ink600,
    grassLit: C.ink500,
    grassDark: C.ink800,
    wall: C.ink600,
    wallLit: C.ink400,
    wallDark: C.ink800,
    roof: C.ink700,
    roofLit: C.ink500,
    roofDark: C.ink900,
    glass: C.ink900,
    glassLit: C.amber1,
    metal: C.ink400,
    stars: true,
    birds: false,
  },
};

/** Ordered dither threshold at a pixel, 0..1. Keeps every falloff on the pixel grid, never a blur. */
function bayerAt(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

/** The grass surface, as an ellipse, so a building can be stood on it rather than guessed at. */
const SURFACE = { cx: 160, cy: 104, rx: 141, ry: 16 };

/** The turf band at a column: `top` is the back rim the sky ends at, `bottom` the front lip. */
function turfBand(x: number): { top: number; bottom: number } {
  const t = (x - SURFACE.cx) / SURFACE.rx;
  const e = Math.abs(t) >= 1 ? 0 : SURFACE.ry * Math.sqrt(1 - t * t);
  return { top: Math.round(SURFACE.cy - e), bottom: Math.round(SURFACE.cy + e) };
}

/**
 * Where a thing of the given depth stands. `depth` is rows toward the viewer from the middle of the
 * band, clamped inside it, so nothing can be placed on the front lip or floating over the back rim.
 */
export function groundAt(x: number, depth = 0): number {
  const { top, bottom } = turfBand(x);
  const mid = (top + bottom) >> 1;
  return Math.max(top + 2, Math.min(bottom - 1, mid + depth));
}

/** Where each plot sits. The order is the order the milestones arrive in. */
const PLOT_X: Record<RealmBuilding, number> = {
  treasury: 26,
  library: 74,
  smithy: 126,
  observatory: 202,
  workshop: 246,
};

/** Half-widths, so a plot's baseline is taken at its centre rather than at its left edge. */
const PLOT_W: Record<RealmBuilding, number> = {
  treasury: 30,
  library: 24,
  smithy: 30,
  observatory: 26,
  workshop: 30,
};

/** A shallow scatter of depths, so the five buildings are not lined up like chess pieces. */
const PLOT_DEPTH: Record<RealmBuilding, number> = {
  treasury: 2,
  library: -2,
  smithy: 1,
  observatory: -1,
  workshop: 3,
};

const PLOTS: Record<RealmBuilding, { x: number; y: number }> = Object.fromEntries(
  REALM_BUILDINGS.map((id) => [
    id,
    { x: PLOT_X[id], y: groundAt(PLOT_X[id] + (PLOT_W[id] >> 1), PLOT_DEPTH[id]) },
  ]),
) as Record<RealmBuilding, { x: number; y: number }>;

/** A four-colour wall block: lit on the top-left, dark on the bottom-right, so boxes have corners. */
function panel(p: Pixmap, x: number, y: number, w: number, h: number, t: Tones): void {
  fillRect(p, x, y, w, h, t.wall);
  hline(p, x, x + w - 1, y, t.wallLit);
  vline(p, x, y, y + h - 1, t.wallLit);
  hline(p, x, x + w - 1, y + h - 1, t.wallDark);
  vline(p, x + w - 1, y, y + h - 1, t.wallDark);
}

/** A window is a recess, not a sticker: dark frame, flat pane, one lit pixel at the sill. */
function windowAt(p: Pixmap, x: number, y: number, w: number, h: number, glass: number): void {
  fillRect(p, x - 1, y - 1, w + 2, h + 2, C.ink900);
  fillRect(p, x, y, w, h, glass);
  hline(p, x, x + w - 1, y, C.ink800);
}

/** A pitched roof over a `w` wide wall whose eaves line is at `y`. */
function gable(p: Pixmap, x: number, y: number, w: number, rise: number, t: Tones): void {
  fillPolygon(
    p,
    [
      [x - 2, y],
      [x + w + 1, y],
      [x + (w >> 1), y - rise],
    ],
    t.roof,
  );
  // the lit slope catches the sky; the dark one is the side away from it
  for (let i = 0; i < rise; i++) {
    const half = Math.round(((w + 3) / 2) * (1 - i / rise));
    hline(p, x + (w >> 1) - half, x + (w >> 1) - half + 1, y - i, t.roofLit);
  }
  hline(p, x - 2, x + w + 1, y, t.roofDark);
}

function groundShadow(p: Pixmap, x: number, y: number, w: number, t: Tones): void {
  fillEllipse(p, x + (w >> 1), y + 1, (w >> 1) + 3, 3, t.grassDark);
}

/**
 * A four-row blend across a band boundary. Anything wider, and two tones this far apart on the
 * palette stop reading as a falloff and start reading as static.
 */
function seam(p: Pixmap, y0: number, upper: number, lower: number): void {
  const rows: [number, number, number][] = [
    [y0 - 2, lower, 0.12],
    [y0 - 1, lower, 0.31],
    [y0, upper, 0.31],
    [y0 + 1, upper, 0.12],
  ];
  for (const [y, color, amount] of rows) {
    if (y < 0 || y >= SCENE_H) continue;
    for (let x = 0; x < SCENE_W; x++) if (bayerAt(x, y) < amount) setPx(p, x, y, color);
  }
}

function drawSky(period: RealmPeriod): Pixmap {
  const t = TONES[period];
  const p = createPixmap(SCENE_W, SCENE_H, t.top);
  const HORIZON = 96;
  for (let y = 0; y < HORIZON; y++) {
    hline(p, 0, SCENE_W - 1, y, y < 38 ? t.top : y < 60 ? t.mid : y < 80 ? t.horizon : t.glow);
  }
  for (let y = HORIZON; y < SCENE_H; y++) hline(p, 0, SCENE_W - 1, y, y < 146 ? t.deep : t.abyss);
  seam(p, 38, t.top, t.mid);
  seam(p, 60, t.mid, t.horizon);
  seam(p, 80, t.horizon, t.glow);
  seam(p, HORIZON, t.glow, t.deep);
  seam(p, 146, t.deep, t.abyss);
  if (t.stars) {
    for (let i = 0; i < 54; i++) {
      const x = hash2(i, 2, 31) % SCENE_W;
      const y = hash2(i, 3, 32) % 86;
      setPx(p, x, y, i % 9 === 0 ? C.paper2 : C.frost1);
      if (i % 17 === 0) setPx(p, x + 1, y, C.frost2);
    }
  }
  // the orb: a disc with one bite taken out of it, which is cheaper than a moon phase and reads as one
  const orbX = period === 'dawn' ? 58 : period === 'dusk' ? 258 : 160;
  const orbY = period === 'dawn' ? 54 : period === 'dusk' ? 62 : period === 'night' ? 28 : 24;
  fillEllipse(p, orbX, orbY, 9, 9, t.orb);
  if (period === 'night') fillEllipse(p, orbX + 4, orbY - 3, 8, 8, t.mid);
  if (period !== 'night') {
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      setPx(p, orbX + Math.round(Math.cos(a) * 13), orbY + Math.round(Math.sin(a) * 13), t.orb);
    }
  }
  // clouds: a flat body with a lit top edge. Above the horizon line or nowhere.
  for (let i = 0; i < 5; i++) {
    const w = 22 + (hash2(i, 4, 33) % 18);
    const cx = 24 + i * 64 + (hash2(i, 5, 34) % 22);
    const cy = 20 + (hash2(i, 6, 35) % 30);
    fillEllipse(p, cx, cy, w >> 1, 4, t.cloud);
    fillEllipse(p, cx - 3, cy - 2, (w >> 1) - 5, 3, t.cloudLit);
    hline(p, cx - (w >> 1) + 3, cx + (w >> 1) - 3, cy + 4, t.cloud);
  }
  // mist in the void: unbroken runs with gaps, which is what makes the island look suspended
  for (let i = 0; i < 4; i++) {
    const y = 110 + i * 18;
    let x = -(hash2(i, 30, 55) % 26);
    while (x < SCENE_W) {
      const len = 10 + (hash2(x, y, 56 + i) % 26);
      hline(p, x, x + len, y, i % 2 ? t.mist : t.deep);
      x += len + 8 + (hash2(x, y, 57 + i) % 24);
    }
  }
  return p;
}

/** The island: a grassed top, a body that tapers to a point, and roots hanging off the underside. */
function drawIsland(period: RealmPeriod): Pixmap {
  const t = TONES[period];
  const p = createPixmap(SCENE_W, SCENE_H);
  const top = SURFACE.cy;
  fillPolygon(
    p,
    [
      [22, top],
      [298, top],
      [240, 140],
      [178, 170],
      [120, 146],
    ],
    t.rock,
  );
  // the lit and shadowed faces of the same rock, or it reads as a flat wedge
  fillPolygon(
    p,
    [
      [22, top],
      [120, 146],
      [92, 126],
    ],
    t.rockDark,
  );
  fillPolygon(
    p,
    [
      [298, top],
      [240, 140],
      [266, 120],
    ],
    t.rockDark,
  );
  fillPolygon(
    p,
    [
      [178, 170],
      [240, 140],
      [212, 134],
    ],
    t.rockLit,
  );
  // strata: the banding a quarry would show, and the thing that makes the wedge read as stone
  for (let b = 0; b < 3; b++) {
    const y = top + 14 + b * 13;
    const x0 = 44 + b * 16;
    const x1 = 276 - b * 20;
    for (let x = x0; x < x1; x++) {
      if (hash2(x, y, 71 + b) % 100 < 58) setPx(p, x, y, b === 1 ? t.rockDark : t.rockLit);
    }
  }
  for (let i = 0; i < 30; i++) {
    const x = 40 + (hash2(i, 7, 36) % 230);
    const y = top + 8 + (hash2(i, 8, 37) % 42);
    if (hash2(i, 9, 38) % 2) line(p, x, y, x + 4, y + 7, t.rockDark);
    else line(p, x, y, x + 3, y + 5, t.rockLit);
  }
  for (let i = 0; i < 7; i++) {
    const x = 48 + i * 38;
    const len = 12 + (hash2(i, 10, 39) % 22);
    let rx = x;
    for (let y = top + 30; y < top + 30 + len; y++) {
      rx += hash2(x, y, 40) % 3 === 0 ? 1 : 0;
      setPx(p, rx, y, t.rockDark);
      setPx(p, rx + 1, y, t.rock);
    }
  }
  // soil first, then the turf over it, so the front lip of the island is a thin soil crescent
  fillEllipse(p, SURFACE.cx, SURFACE.cy + 3, SURFACE.rx, SURFACE.ry, t.soil);
  fillEllipse(p, SURFACE.cx, SURFACE.cy, SURFACE.rx, SURFACE.ry, t.grass);
  for (let x = 22; x < 299; x++) {
    const { top: back, bottom: front } = turfBand(x);
    for (let d = 0; d < 3; d++)
      if (px(p, x, back + d) === t.grass) setPx(p, x, back + d, t.grassLit);
    if (px(p, x, front) === t.grass) setPx(p, x, front, t.grassDark);
    if (px(p, x, front + 2) === t.soil) setPx(p, x, front + 2, t.rim);
    if (px(p, x, front + 3) === t.soil) setPx(p, x, front + 3, t.rockDark);
    // turf texture across the whole band, or the front half reads as a bucket of green
    for (let y = back + 3; y < front; y++) {
      if (px(p, x, y) !== t.grass) continue;
      const h = hash2(x, y, 45) % 100;
      if (h < 14) setPx(p, x, y, t.grassLit);
      else if (h > 92) setPx(p, x, y, t.grassDark);
    }
    if (x % 3 === 0) {
      const h = 1 + (hash2(x, 1, 41) % 3);
      for (let y = 0; y < h; y++) setPx(p, x, back - 1 - y, y === h - 1 ? t.grassLit : t.grass);
    }
  }
  // the track between the plots, worn across the front of the turf
  for (let x = 30; x < 282; x++) {
    const { top: back, bottom: front } = turfBand(x);
    const y = back + Math.round((front - back) * 0.72);
    if (hash2(x, y, 46) % 100 < 60) setPx(p, x, y, t.soil);
    else if (hash2(x, y, 47) % 100 < 16) setPx(p, x, y, t.rockDark);
  }
  // flowers and stones below the track, where they cannot be mistaken for a building's roofline
  for (let i = 0; i < 16; i++) {
    const x = 30 + (hash2(i, 21, 48) % 250);
    const { top: back, bottom: front } = turfBand(x);
    const y = back + Math.round((front - back) * (0.78 + (hash2(i, 22, 49) % 12) / 60));
    if (y >= front) continue;
    const flower = hash2(i, 23, 50) % 3;
    setPx(p, x, y, flower === 0 ? C.moss0 : flower === 1 ? C.gold2 : C.rose2);
    setPx(p, x, y + 1, t.grassDark);
  }
  for (let i = 0; i < 6; i++) {
    const x = 34 + (hash2(i, 24, 51) % 244);
    const { top: back, bottom: front } = turfBand(x);
    const y = back + Math.round((front - back) * (0.8 + (hash2(i, 25, 52) % 10) / 50));
    if (y >= front) continue;
    fillEllipse(p, x, y, 2, 1, t.rockDark);
    setPx(p, x - 1, y, t.rockLit);
  }
  return p;
}

/** A plot with nothing built on it: a cleared pad and a lantern. Honest, not a hole. */
function drawPlot(p: Pixmap, x: number, y: number, t: Tones, lit: boolean): void {
  groundShadow(p, x, y, 18, t);
  for (let i = 0; i < 5; i++) hline(p, x - 1 + i, x + 17 - i, y - 1, t.rockDark);
  vline(p, x + 8, y - 19, y - 2, t.wallDark);
  vline(p, x + 9, y - 19, y - 2, t.wall);
  strokeLantern(p, x + 5, y - 26, t);
  if (lit) {
    setPx(p, x + 8, y - 23, C.amber1);
    setPx(p, x + 9, y - 23, C.amber1);
    setPx(p, x + 8, y - 22, C.amber2);
    setPx(p, x + 9, y - 22, C.amber3);
  }
  // a stake and a board: this plot is claimed, it is simply not built yet
  vline(p, x + 16, y - 9, y - 1, t.soil);
  fillRect(p, x + 13, y - 12, 7, 4, t.metal);
  setPx(p, x + 15, y - 11, t.wallDark);
  setPx(p, x + 17, y - 10, t.wallDark);
}

function strokeLantern(p: Pixmap, x: number, y: number, t: Tones): void {
  hline(p, x, x + 5, y, t.metal);
  hline(p, x, x + 5, y + 7, t.metal);
  vline(p, x, y, y + 7, t.metal);
  vline(p, x + 5, y, y + 7, t.metal);
}

function drawTreasury(
  p: Pixmap,
  x: number,
  y: number,
  t: Tones,
  level: number,
  glass: number,
): void {
  groundShadow(p, x, y, 30, t);
  panel(p, x, y - 22, 30, 22, t);
  hline(p, x - 2, x + 31, y - 1, t.wallDark);
  hline(p, x - 2, x + 31, y - 2, t.metal);
  for (let i = 0; i < 3; i++) hline(p, x + 3, x + 26, y - 18 + i * 5, t.wallDark);
  gable(p, x, y - 22, 30, 9, t);
  // the coin slot, with a coin halfway into it
  hline(p, x + 11, x + 18, y - 13, C.ink900);
  hline(p, x + 11, x + 18, y - 12, t.wallDark);
  setPx(p, x + 14, y - 15, C.gold0);
  setPx(p, x + 15, y - 15, C.gold1);
  setPx(p, x + 14, y - 14, C.gold1);
  setPx(p, x + 15, y - 14, C.gold2);
  panel(p, x + 11, y - 9, 8, 7, t);
  vline(p, x + 15, y - 8, y - 3, t.wallDark);
  setPx(p, x + 17, y - 6, C.gold0);
  windowAt(p, x + 4, y - 10, 3, 4, glass);
  windowAt(p, x + 23, y - 10, 3, 4, glass);
  if (level > 1) {
    panel(p, x + 8, y - 34, 14, 8, t);
    hline(p, x + 6, x + 24, y - 34, t.roofDark);
    setPx(p, x + 14, y - 31, C.gold0);
    setPx(p, x + 15, y - 30, C.gold1);
    setPx(p, x + 14, y - 30, C.gold2);
  }
}

function drawLibrary(
  p: Pixmap,
  x: number,
  y: number,
  t: Tones,
  level: number,
  glass: number,
): void {
  groundShadow(p, x, y, 24, t);
  panel(p, x, y - 38, 24, 38, t);
  for (let i = 0; i < 5; i++) hline(p, x + 3, x + 20, y - 33 + i * 6, t.wallDark);
  windowAt(p, x + 7, y - 30, 10, 11, glass);
  hline(p, x + 7, x + 16, y - 25, t.metal);
  vline(p, x + 12, y - 30, y - 20, t.metal);
  gable(p, x, y - 38, 24, 11, t);
  panel(p, x + 9, y - 9, 7, 8, t);
  setPx(p, x + 14, y - 6, C.gold2);
  if (level > 1) {
    panel(p, x + 5, y - 50, 14, 11, t);
    gable(p, x + 5, y - 50, 14, 6, t);
    windowAt(p, x + 9, y - 47, 6, 5, glass);
  }
}

function drawSmithy(p: Pixmap, x: number, y: number, t: Tones, hot: boolean, glass: number): void {
  groundShadow(p, x, y, 30, t);
  panel(p, x, y - 18, 30, 18, t);
  gable(p, x, y - 18, 30, 8, t);
  // the forge mouth is the only warm thing here
  fillRect(p, x + 4, y - 13, 11, 11, C.ink900);
  hline(p, x + 4, x + 14, y - 13, t.wallDark);
  const fire = hot ? C.amber1 : C.ember2;
  hline(p, x + 5, x + 13, y - 5, fire);
  hline(p, x + 6, x + 12, y - 6, hot ? C.amber0 : C.ember1);
  setPx(p, x + 9, y - 7, C.paper0);
  const cx = x + 21;
  vline(p, cx, y - 32, y - 14, t.wallDark);
  vline(p, cx + 4, y - 32, y - 14, t.wallDark);
  hline(p, cx, cx + 4, y - 32, t.metal);
  hline(p, cx, cx + 4, y - 18, t.metal);
  for (let i = 0; i < 4; i++) setPx(p, cx + 1 + (i % 3), y - 30 + i * 4, C.ember3);
  // an anvil outside, because a smithy without an anvil is a shed
  fillPolygon(
    p,
    [
      [x + 18, y - 1],
      [x + 26, y - 1],
      [x + 25, y - 5],
      [x + 19, y - 5],
    ],
    t.metal,
  );
  hline(p, x + 18, x + 26, y - 5, C.steel0);
  windowAt(p, x + 25, y - 12, 3, 5, glass);
}

function drawObservatory(
  p: Pixmap,
  x: number,
  y: number,
  t: Tones,
  level: number,
  glass: number,
): void {
  groundShadow(p, x, y, 26, t);
  panel(p, x + 1, y - 24, 24, 24, t);
  for (let i = 0; i < 3; i++) hline(p, x + 3, x + 22, y - 19 + i * 6, t.wallDark);
  // the dome is a half ellipse, flat where it meets the wall, and a different colour family from it
  for (let dx = -12; dx <= 12; dx++) {
    const h = Math.round(Math.sqrt(Math.max(0, 144 - dx * dx)) * (11 / 12));
    for (let dy = 0; dy < h; dy++) setPx(p, x + 13 + dx, y - 24 - dy, dx > 4 ? t.roofDark : t.roof);
    setPx(p, x + 13 + dx, y - 24 - h, t.roofLit);
  }
  hline(p, x + 1, x + 25, y - 24, t.wallDark);
  // the slit, open
  for (let dy = 0; dy < 10; dy++) {
    setPx(p, x + 12, y - 25 - dy, C.ink900);
    setPx(p, x + 13, y - 25 - dy, C.ink900);
    setPx(p, x + 14, y - 25 - dy, C.ink900);
  }
  // the telescope, pointing at whatever is up there tonight
  line(p, x + 12, y - 22, x + 22, y - 32, t.wallLit);
  line(p, x + 12, y - 21, x + 22, y - 31, t.wallDark);
  setPx(p, x + 22, y - 32, C.frost0);
  windowAt(p, x + 8, y - 14, 10, 8, glass);
  if (level > 1) {
    vline(p, x + 24, y - 42, y - 26, t.metal);
    setPx(p, x + 24, y - 43, C.rose1);
    setPx(p, x + 25, y - 42, C.rose2);
  }
}

function drawWorkshop(
  p: Pixmap,
  x: number,
  y: number,
  t: Tones,
  level: number,
  glass: number,
): void {
  groundShadow(p, x, y, 30, t);
  // a lean-to: one tall side, one short side, and a roof that runs between them
  panel(p, x, y - 20, 30, 20, t);
  fillPolygon(
    p,
    [
      [x - 3, y - 20],
      [x + 33, y - 11],
      [x + 33, y - 15],
      [x - 3, y - 25],
    ],
    t.roof,
  );
  for (let i = 0; i < 4; i++)
    line(p, x + 1 + i * 8, y - 24 - i, x + 6 + i * 8, y - 16 - i, t.roofLit);
  hline(p, x - 3, x + 33, y - 11, t.roofDark);
  // the bench, with the materials that go on it
  hline(p, x + 3, x + 17, y - 8, t.soil);
  hline(p, x + 3, x + 17, y - 7, t.roofDark);
  vline(p, x + 4, y - 7, y - 1, t.soil);
  vline(p, x + 16, y - 7, y - 1, t.soil);
  setPx(p, x + 6, y - 9, t.metal);
  setPx(p, x + 9, y - 9, C.frost1);
  setPx(p, x + 12, y - 9, C.rose2);
  windowAt(p, x + 21, y - 10, 6, 6, glass);
  if (level > 1) {
    panel(p, x + 22, y - 28, 8, 8, t);
    hline(p, x + 22, x + 29, y - 28, t.roofLit);
    setPx(p, x + 25, y - 25, C.gold1);
  }
}

/**
 * `level` is the building's own; `pulse` is the two-bit animation state (forge breathing, lantern
 * flicker) so a painter only takes the arguments that can actually change its pixels.
 */
type Painter = (
  p: Pixmap,
  x: number,
  y: number,
  t: Tones,
  level: number,
  pulse: number,
  glass: number,
) => void;

/**
 * Each building is made of a different material, so the five roofs never read as one shape repeated
 * five times. The library and the observatory keep the period's own roof colour; the rest are steel,
 * soot and thatch, all of which the tone table already knows how to darken at night.
 */
function roofing(id: RealmBuilding, t: Tones): Tones {
  if (id === 'treasury') return { ...t, roof: t.metal, roofLit: C.steel0, roofDark: t.wallDark };
  if (id === 'smithy') return { ...t, roof: t.rockDark, roofLit: t.rock, roofDark: C.ink900 };
  if (id === 'workshop') return { ...t, roof: t.soil, roofLit: t.rim, roofDark: t.rockDark };
  return t;
}

const PAINTERS: Record<RealmBuilding, Painter> = {
  treasury: (p, x, y, t, level, _pulse, glass) => drawTreasury(p, x, y, t, level, glass),
  library: (p, x, y, t, level, _pulse, glass) => drawLibrary(p, x, y, t, level, glass),
  smithy: (p, x, y, t, _level, pulse, glass) => drawSmithy(p, x, y, t, (pulse & 1) === 1, glass),
  observatory: (p, x, y, t, level, _pulse, glass) => drawObservatory(p, x, y, t, level, glass),
  workshop: (p, x, y, t, level, _pulse, glass) => drawWorkshop(p, x, y, t, level, glass),
};

/**
 * The animated states the built layer can be in. The forge breathes on a 6-frame cycle and the plot
 * lanterns on an 8-frame one; the layer only ever needs four combinations, which keeps the cache
 * small enough to hold on a phone.
 */
function pulseOf(frame: number): number {
  return (frame % 6 < 3 ? 1 : 0) | (frame % 8 < 4 ? 2 : 0);
}

/** Smoke over the smithy, birds at morning, fireflies at night — the things that prove it is alive. */
function ambient(
  period: RealmPeriod,
  frame: number,
  levels: Record<string, number>,
): [number, number, number][] {
  const t = TONES[period];
  const out: [number, number, number][] = [];
  if ((levels.smithy ?? 0) > 0) {
    const base = PLOTS.smithy;
    for (let i = 0; i < 6; i++) {
      const age = (frame + i * 4) % 24;
      const x = base.x + 23 + Math.round(Math.sin((age + i * 3) * 0.35) * 3);
      const y = base.y - 34 - age;
      if (y < 8) continue;
      out.push([x, y, age < 8 ? C.ink500 : t.rockDark]);
    }
  }
  if (t.birds) {
    for (let i = 0; i < 3; i++) {
      const x = ((frame + i * 51) % (SCENE_W + 60)) - 30;
      const y = 30 + i * 11 + Math.round(Math.sin((frame + i * 11) / 8) * 2);
      const wing = frame % 12 < 6 ? -1 : 0;
      out.push([x, y + wing, t.rockDark], [x + 2, y, t.rockDark], [x + 4, y + wing, t.rockDark]);
    }
  }
  if (period === 'night' || period === 'dusk') {
    for (let i = 0; i < 7; i++) {
      if ((frame + i * 4) % 9 >= 4) continue;
      const x = 30 + (hash2(i, 11, 42) % 250) + Math.round(Math.sin((frame + i * 5) / 6) * 4);
      const y =
        groundAt(x, -8) - (hash2(i, 12, 43) % 16) + Math.round(Math.cos((frame + i * 3) / 5) * 3);
      out.push([x, y, i % 3 === 0 ? C.moss0 : C.amber1]);
    }
  }
  return out;
}

/** Nearer debris, dark enough to read as a silhouette so the parallax has something to prove with. */
function drawFore(period: RealmPeriod): Pixmap {
  const t = TONES[period];
  const p = createPixmap(SCENE_W, SCENE_H);
  const chunks: [number, number, number][] = [
    [16, 152, 22],
    [292, 142, 18],
    [152, 172, 14],
  ];
  for (const [x, y, w] of chunks) {
    fillPolygon(
      p,
      [
        [x - (w >> 1), y],
        [x + (w >> 1), y],
        [x + (w >> 2), y + (w >> 1)],
        [x - (w >> 2), y + (w >> 1) - 3],
      ],
      t.rockDark,
    );
    hline(p, x - (w >> 1), x + (w >> 1), y, t.grassDark);
    for (let i = 0; i <= w; i += 2)
      setPx(p, x - (w >> 1) + i, y - 1 - (i % 4 === 0 ? 1 : 0), t.grassDark);
  }
  return p;
}

export interface RealmLayers {
  sky: Pixmap;
  island: Pixmap;
  builds: Pixmap;
  fore: Pixmap;
  vignette: Pixmap;
  glow: Pixmap;
  /** The tight halo around a lantern or a forge, which is a fraction of the companion's own. */
  lamp: Pixmap;
}

const stillCache = new Map<string, Pixmap>();
const buildCache = new Map<string, Pixmap>();

function cached(map: Map<string, Pixmap>, cap: number, key: string, make: () => Pixmap): Pixmap {
  const hit = map.get(key);
  if (hit) return hit;
  const made = make();
  if (map.size > cap) map.clear();
  map.set(key, made);
  return made;
}

/**
 * Lit windows, as offsets from the plot anchor, matching the `windowAt` calls inside each painter.
 * A halo goes where there is actually a flame; one floating over blank wall is how you get five
 * buildings that all appear to be on fire.
 */
const WINDOWS: Record<RealmBuilding, { dx: number; dy: number; level2?: boolean }[]> = {
  treasury: [
    { dx: 5, dy: -8 },
    { dx: 24, dy: -8 },
  ],
  library: [
    { dx: 12, dy: -25 },
    { dx: 12, dy: -44, level2: true },
  ],
  smithy: [{ dx: 26, dy: -10 }],
  observatory: [{ dx: 13, dy: -10 }],
  workshop: [{ dx: 24, dy: -7 }],
};

/** Where a light lives: on an unbuilt plot, in the forge, or in a lit window after sundown. */
function isDark(period: RealmPeriod): boolean {
  return period === 'dusk' || period === 'night';
}

/** Plot lanterns are lit after sundown, and flicker on the 8-frame half of the pulse. */
function lanternOn(period: RealmPeriod, pulse: number): boolean {
  return isDark(period) && (pulse & 2) === 2;
}

function lightAnchors(
  period: RealmPeriod,
  levels: Record<string, number>,
  pulse: number,
): [number, number][] {
  const out: [number, number][] = [];
  const dark = isDark(period);
  for (const id of REALM_BUILDINGS) {
    const { x, y } = PLOTS[id];
    const level = Math.max(0, Math.min(2, levels[id] ?? 0));
    if (level <= 0) {
      if (lanternOn(period, pulse)) out.push([x + 9, y - 22]);
      continue;
    }
    if (id === 'smithy') out.push([x + 9, y - 6]);
    if (dark) {
      for (const w of WINDOWS[id]) {
        if (!w.level2 || level > 1) out.push([x + w.dx, y + w.dy]);
      }
    }
  }
  return out;
}

export function realmLayers(
  period: RealmPeriod,
  levels: Record<string, number>,
  frame: number,
): RealmLayers {
  const plotKey = REALM_BUILDINGS.map(
    (id) => `${id}${Math.max(0, Math.min(2, levels[id] ?? 0))}`,
  ).join('');
  const pulse = pulseOf(frame);
  const builds = cached(buildCache, 20, `${period}|${plotKey}|${pulse}`, () => {
    const p = createPixmap(SCENE_W, SCENE_H);
    const t = TONES[period];
    const lit = isDark(period);
    for (const id of REALM_BUILDINGS) {
      const { x, y } = PLOTS[id];
      const level = Math.max(0, Math.min(2, levels[id] ?? 0));
      if (level <= 0) drawPlot(p, x, y, t, lanternOn(period, pulse));
      else PAINTERS[id](p, x, y, roofing(id, t), level, pulse, lit ? t.glassLit : t.glass);
    }
    return p;
  });
  return {
    sky: cached(stillCache, 24, `sky${period}`, () => drawSky(period)),
    island: cached(stillCache, 24, `island${period}`, () => drawIsland(period)),
    builds,
    fore: cached(stillCache, 24, `fore${period}`, () => drawFore(period)),
    vignette: cached(stillCache, 24, 'vignette', () => vignette()),
    lamp: cached(stillCache, 24, 'lamp', () => lightBlob(6, 'amber')),
    glow: cached(stillCache, 24, `glow${period}`, () =>
      lightBlob(
        period === 'night' || period === 'dusk' ? 15 : 11,
        period === 'dawn' ? 'ember' : 'amber',
      ),
    ),
  };
}

export interface RealmActors {
  companion?: Pixmap;
  companionX?: number;
}

/**
 * One composed frame. `look` is -1..1; the sky barely moves, the island a little, and the foreground
 * debris most, which is the entire depth cue the scene has.
 */
export function composeRealm(
  frame: number,
  look = 0,
  period: RealmPeriod = 'day',
  levels: Record<string, number> = {},
  actors: RealmActors = {},
): Pixmap {
  const layers = realmLayers(period, levels, frame);
  const t = TONES[period];
  const camera = Math.max(-1, Math.min(1, look));
  const skyX = Math.round(camera * -2);
  const islandX = Math.round(camera * -4);
  const foreX = Math.round(camera * -9);
  const out = createPixmap(SCENE_W, SCENE_H, t.top);
  blit(out, layers.sky, skyX, 0);
  // The light belongs to the companion and the ground it stands on. Added to the sky it reads as a
  // square of dither noise against the horizon, which is exactly what it is.
  const ground = createPixmap(SCENE_W, SCENE_H);
  blit(ground, layers.island, 0, 0);
  blit(ground, layers.builds, 0, 0);
  const companionX = actors.companionX ?? 152;
  const companionY = actors.companion ? groundAt(companionX + 24, 9) - actors.companion.h : 0;
  if (actors.companion) {
    addLight(ground, layers.glow, companionX + 24 + (frame % 7 === 3 ? 1 : 0), companionY + 32);
  }
  blit(out, ground, islandX, 0);
  // Small halos go on the composed frame instead: a lantern lights the air around it, and the air
  // at that height is sky. The blob skips transparent pixels, so over the turf it still reads.
  for (const [lx, ly] of lightAnchors(period, levels, pulseOf(frame))) {
    addLight(out, layers.lamp, lx + islandX, ly);
  }
  if (actors.companion) blit(out, actors.companion, companionX + islandX, companionY);
  for (const [x, y, color] of ambient(period, frame, levels)) setPx(out, x + islandX, y, color);
  blit(out, layers.fore, foreX, 0);
  blit(out, layers.vignette, 0, 0);
  return out;
}

/** Where a building's plot sits, so the screen can point at it from the list. */
export function plotOf(id: RealmBuilding): { x: number; y: number } {
  return PLOTS[id];
}

/**
 * The art-pixel box a plot occupies, tall enough to cover the roof and the level-2 storey. This is
 * what the screen puts a tap target on, so the diorama is a control and not only a picture.
 */
export function plotBox(id: RealmBuilding): { x: number; y: number; w: number; h: number } {
  const { x, y } = PLOTS[id];
  return { x: x - 3, y: y - 58, w: PLOT_W[id] + 6, h: 59 };
}

/** A plot that has just unlocked gets a few frames of sparkle; this is the sprite it uses. */
export function sparkle(frame: number): Pixmap {
  const p = createPixmap(16, 16);
  const r = 2 + (frame % 5);
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    for (let d = 1; d <= r; d++) {
      setPx(p, 8 + Math.round(Math.cos(a) * d), 8 + Math.round(Math.sin(a) * d), C.gold0);
    }
  }
  setPx(p, 8, 8, C.paper0);
  dissolve(p, (frame % 5) / 9);
  return p;
}
