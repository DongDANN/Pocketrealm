/**
 * The three Hollow battle stages: four parallax layers each, drawn from the Hollow's own palette so a
 * floor reads as a place before it reads as a background.
 *
 * Deliberately not a tile grid. The Delve presents one encounter at a time inside a 320x180 window, so
 * each stage is composed as a flat — a deep band, a row of structures, the ground the actors stand on,
 * and something framing the edges. Parallax is an integer per-layer offset applied by the renderer,
 * never a scaled or blurred CSS transform.
 */
import { C, colorIndex, HOLLOW_PALETTES, type HollowPalette } from '../palette';
import {
  BAYER4,
  blit,
  colors,
  createPixmap,
  fillEllipse,
  fillPolygon,
  fillRect,
  hash2,
  hline,
  line,
  setPx,
  vline,
  type Pixmap,
} from '../px';
import { FLAME_FRAMES, TORCH } from '../tiles';
import { addLight, lightBlob, lightFlare, SCENE_H, SCENE_W, vignette } from './rootfall';

export type HollowId = 1 | 2 | 3;

/** Ordered dither threshold at a pixel, 0..1. Keeps every falloff on the pixel grid, never a blur. */
function bayerAt(x: number, y: number): number {
  return (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
}

/** The row every sprite stands on. Actors are anchored by their feet, not their centre. */
export const GROUND_Y = 134;

export const STAGE_TORCHES = [
  [46, 92],
  [242, 92],
] as const;

interface Treatment {
  /** Deep band above the horizon. */
  deep: number;
  /** The structure tone, and its lit and shadowed edges. */
  stone: number;
  stoneLit: number;
  stoneDark: number;
  /** Unlit ceiling rock — one step off black so the roof reads as stone instead of nothing. */
  rock: number;
  /** The one bright thing in the scene: a crystal seam, a cap's glow, a hanging lamp. */
  glow: number;
  accent: number;
  tint: 'amber' | 'teal' | 'ember';
  /** What drifts, and which way. Dust sinks in Rootfall, embers rise in the Vault, spores wander. */
  motes: 'sink' | 'rise' | 'drift';
  structure: 'cap' | 'pillar' | 'arch';
}

/** The four stone tones, in the order `stoneDark, deep, stone, stoneLit`. */
function stoneRamp(
  palette: HollowPalette,
): Pick<Treatment, 'deep' | 'stone' | 'stoneLit' | 'stoneDark'> {
  return {
    stoneDark: colorIndex(palette.bg[0]),
    deep: colorIndex(palette.bg[1]),
    stone: colorIndex(palette.bg[2]),
    stoneLit: colorIndex(palette.bg[3]),
  };
}

const TREATMENTS: Record<HollowId, Treatment> = {
  1: {
    ...stoneRamp(HOLLOW_PALETTES.hollow1),
    rock: colorIndex('#1d1b2e'),
    glow: colors(HOLLOW_PALETTES.hollow1.accent)[2],
    accent: colors(HOLLOW_PALETTES.hollow1.accent)[0],
    tint: 'amber',
    motes: 'sink',
    structure: 'cap',
  },
  2: {
    ...stoneRamp(HOLLOW_PALETTES.hollow2),
    rock: colorIndex('#27243c'),
    glow: colors(HOLLOW_PALETTES.hollow2.accent)[1],
    accent: colors(HOLLOW_PALETTES.hollow2.accent)[0],
    tint: 'teal',
    motes: 'rise',
    structure: 'pillar',
  },
  3: {
    ...stoneRamp(HOLLOW_PALETTES.hollow3),
    rock: colorIndex('#1d1b2e'),
    glow: colors(HOLLOW_PALETTES.hollow3.accent)[2],
    accent: colors(HOLLOW_PALETTES.hollow3.accent)[1],
    tint: 'ember',
    motes: 'drift',
    structure: 'arch',
  },
};

/**
 * Rootfall: broad caps on stalks thick enough to survive the style lock. The first cut drew the stalk
 * as a single `line`, which left five UFOs on hairlines; a stalk is now three columns wide at the base
 * and tapers to one at the cap, with the lit edge on the side the lantern is on.
 */
function drawCaps(p: Pixmap, t: Treatment): void {
  for (let i = 0; i < 5; i++) {
    const x = 18 + i * 72 + (hash2(i, 1, 41) % 14);
    const capY = GROUND_Y - (54 + (hash2(i, 2, 42) % 26));
    const rx = 15 + (i % 3) * 5;
    const ry = 10 + (i % 2) * 3;
    const lean = (i % 2 ? 3 : -3) + (hash2(i, 3, 43) % 3);
    const rise = Math.max(12, GROUND_Y - capY);
    fillEllipse(p, x + 1, GROUND_Y + 2, rx - 5, 3, C.ink900);
    const underside = capY + Math.round(ry * 0.5);
    // A cap is a dome with its underside cut flat and gills under the rim. The first cut left a whole
    // ellipse in the frame, which read as a green disc on a stick.
    fillEllipse(p, x + lean, capY, rx, ry + 1, t.stoneDark);
    fillEllipse(p, x + lean, capY - 1, rx, ry, t.stone);
    fillRect(p, x + lean - rx - 1, underside, rx * 2 + 3, ry + 4, C.clear);
    hline(p, x + lean - rx + 2, x + lean + rx - 2, underside - 1, t.stoneDark);
    hline(p, x + lean - rx + 4, x + lean + rx - 4, underside - 2, t.stone);
    fillEllipse(
      p,
      x + lean - 2,
      capY - Math.round(ry * 0.5) - 1,
      Math.max(3, rx - 6),
      Math.max(2, ry - 5),
      t.stoneLit,
    );
    // the stalk goes up last, or the flat cut above would shave a gap through the middle of it
    for (let y = GROUND_Y - 1; y > underside; y--) {
      const k = (GROUND_Y - 1 - y) / rise;
      const cx = x + Math.round(lean * k);
      const half = Math.max(1, Math.round(3 - k * 2));
      hline(p, cx - half, cx + half, y, t.stoneDark);
      hline(p, cx - half, cx + half - 1, y, t.stone);
      hline(p, cx - half, cx - half, y, t.stoneLit);
    }
    setPx(p, x + lean - 5, capY - 1, t.glow);
    setPx(p, x + lean + 5, capY - 2, t.glow);
  }
}

/** The Vault: cut pillars with a crystal seam, the only bright surface in the room. */
function drawPillars(p: Pixmap, t: Treatment): void {
  for (let i = 0; i < 4; i++) {
    const x = 26 + i * 84;
    const w = 16 + (i % 2) * 6;
    const broken = i === 1;
    const top = broken ? 92 + (hash2(i, 5, 43) % 8) : 34 + (hash2(i, 5, 43) % 18);
    const mid = x + Math.round(w / 2);
    fillEllipse(p, mid, GROUND_Y + 2, Math.round(w / 2) + 5, 3, C.ink900);
    fillRect(p, x, top, w, GROUND_Y - top, t.stone);
    fillRect(p, x, top, 3, GROUND_Y - top, t.stoneLit);
    fillRect(p, x + w - 3, top, 3, GROUND_Y - top, t.stoneDark);
    if (broken) {
      // a snapped column: the top face is rubble, not a capital, and the seam is gone
      for (let s = 0; s < 5; s++) {
        const bx = x + s * Math.max(1, Math.floor(w / 5));
        const bh = 3 + (hash2(i, s, 45) % 6);
        fillRect(p, bx, top - bh, Math.max(2, Math.floor(w / 5)), bh + 2, t.stone);
        hline(p, bx, bx + Math.max(1, Math.floor(w / 5) - 1), top - bh, t.stoneLit);
      }
    } else {
      fillRect(p, x - 4, top, w + 8, 6, t.stone);
      fillRect(p, x - 4, top, w + 8, 2, t.stoneLit);
      hline(p, x - 4, x + w + 3, top + 6, t.stoneDark);
      for (let s = 0; s < 4; s++) {
        const y = top + 20 + s * 24;
        if (y > GROUND_Y - 12) break;
        line(p, x + 3, y, x + w - 4, y + 3, t.stoneDark);
      }
      // the seam only on half the columns, or the rhythm turns into a wallpaper
      if (i % 2 === 0) {
        fillPolygon(
          p,
          [
            [mid, top + 14],
            [mid + 2, top + 26],
            [mid, top + 42],
            [mid - 2, top + 26],
          ],
          t.glow,
        );
        setPx(p, mid, top + 26, C.paper0);
      }
    }
    fillRect(p, x - 3, GROUND_Y - 7, w + 6, 7, t.stone);
    hline(p, x - 3, x + w + 2, GROUND_Y - 7, t.stoneLit);
  }
}

/**
 * Umbra: masonry hung over nothing. The first cut stroked the arch as a one-pixel curve, which read as
 * a wire hoop; sampling the ring every quarter-degree makes it a solid band of voussoirs instead.
 */
const ARCH_THICKNESS = 10;

function archGeom(i: number): { x: number; span: number; spring: number; rise: number } {
  return {
    x: 40 + i * 108,
    span: 38 + (i % 2) * 10,
    spring: 74 + (hash2(i, 6, 44) % 10),
    rise: 36 + (hash2(i, 7, 46) % 8),
  };
}

/** Lamps hang from the crown of each arch. The renderer lights these, because the mid layer is
 * transparent over the void and `addLight` only lands on stone that is already there. */
export function stageLamps(hollow: HollowId): [number, number][] {
  if (hollow !== 3) return [];
  return [0, 1, 2].map((i) => {
    const { x, spring, rise } = archGeom(i);
    return [x, spring - rise + 15];
  });
}

function drawArches(p: Pixmap, t: Treatment): void {
  for (let i = 0; i < 3; i++) {
    const { x, span, spring, rise } = archGeom(i);
    const thickness = ARCH_THICKNESS;
    for (const side of [-1, 1]) {
      const px = side < 0 ? x - span : x + span - thickness;
      fillRect(p, px, spring, thickness, GROUND_Y - spring, t.stone);
      fillRect(p, side < 0 ? px : px + thickness - 3, spring, 3, GROUND_Y - spring, t.stoneDark);
      fillRect(p, side < 0 ? px + thickness - 3 : px, spring, 3, GROUND_Y - spring, t.stoneLit);
      fillRect(p, px - 3, spring - 6, thickness + 6, 7, t.stone);
      hline(p, px - 3, px + thickness + 2, spring - 6, t.stoneLit);
      hline(p, px - 3, px + thickness + 2, spring + 1, t.stoneDark);
      fillRect(p, px - 2, GROUND_Y - 6, thickness + 4, 6, t.stone);
      hline(p, px - 2, px + thickness + 1, GROUND_Y - 6, t.stoneLit);
      fillEllipse(p, px + Math.round(thickness / 2), GROUND_Y + 2, thickness + 4, 3, C.ink900);
    }
    const at = (a: number, r: number, lift: number): [number, number] => [
      x + Math.round(Math.cos(a) * (span + r)),
      spring - Math.round(Math.sin(a) * (rise + lift)),
    ];
    for (let s = 0; s <= 96; s++) {
      const a = Math.PI * (s / 96);
      const outer = at(a, 3, 4);
      const inner = at(a, -thickness + 3, -3);
      line(p, inner[0], inner[1], outer[0], outer[1], t.stone);
      setPx(p, outer[0], outer[1], t.stoneLit);
      setPx(p, inner[0], inner[1], t.stoneDark);
    }
    // five joints, cut as short ticks at the extrados — a comb of them read as a fan, not a arch
    for (const s of [12, 31, 48, 65, 84]) {
      const a = Math.PI * (s / 96);
      line(
        p,
        at(a, -thickness + 4, -3)[0],
        at(a, -thickness + 4, -3)[1],
        at(a, 2, 4)[0],
        at(a, 2, 4)[1],
        t.stoneDark,
      );
    }
    const crown = spring - rise;
    fillRect(p, x - 3, crown - 2, 7, 8, t.stone);
    hline(p, x - 3, x + 3, crown - 2, t.stoneLit);
    vline(p, x, crown + 6, crown + 10, t.stoneDark);
    fillEllipse(p, x, crown + 13, 4, 3, t.stoneDark);
    hline(p, x - 3, x + 3, crown + 11, t.stone);
    setPx(p, x, crown + 13, t.glow);
    setPx(p, x - 1, crown + 14, t.glow);
    setPx(p, x + 1, crown + 14, t.glow);
  }
}

/**
 * The deep flat: a ceiling of rock with a jagged skirt, a lighter back wall with a rounded crest, and
 * nothing rectangular. The first cut drew the skyline as stacked rectangles, painted the teeth in the
 * same black as the void behind them, and every Hollow read as the same city at three times of day.
 */
function drawFar(hollow: HollowId, t: Treatment): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H, C.ink900);
  fillRect(p, 0, 78, SCENE_W, GROUND_Y - 78, t.deep);
  for (let i = 0; i < 9; i++) {
    const x = i * 38 + (hash2(i, 1, 61) % 12);
    fillEllipse(p, x, 78, 26 + (hash2(i, 2, 62) % 14), 12 + (hash2(i, 3, 63) % 12), t.deep);
  }
  for (let i = 0; i < 16; i++) {
    const x = i * 21 + (hash2(i, 4, 64) % 9);
    const h = 14 + (hash2(i, 5, 65) % 26);
    const w = 7 + (hash2(i, 6, 69) % 6);
    fillPolygon(
      p,
      [
        [x, 0],
        [x + w, 0],
        [x + Math.round(w / 2), h],
      ],
      t.rock,
    );
    hline(p, x, x + w, 0, t.stoneDark);
  }
  if (hollow === 2) {
    for (let i = 0; i < 6; i++) {
      const x = 16 + i * 54;
      const y = 86 + (hash2(i, 6, 66) % 26);
      setPx(p, x, y, t.glow);
      setPx(p, x, y + 1, t.glow);
    }
  }
  if (hollow === 3) {
    for (let i = 0; i < 24; i++) {
      setPx(p, hash2(i, 7, 67) % SCENE_W, hash2(i, 8, 68) % 70, i % 5 === 0 ? t.accent : t.rock);
    }
  }
  return p;
}

function drawMid(t: Treatment): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  if (t.structure === 'cap') drawCaps(p, t);
  else if (t.structure === 'pillar') drawPillars(p, t);
  else drawArches(p, t);
  return p;
}

/**
 * The ground. The first cut put one bright line across a black void and the actors looked like they
 * were standing on a wire; the band below it now carries broken flagstone, a two-tone rubble dither
 * and a falloff to the bottom of the frame.
 */
function drawMain(hollow: HollowId, t: Treatment): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  fillRect(p, 0, GROUND_Y, SCENE_W, SCENE_H - GROUND_Y, t.stone);
  for (let y = GROUND_Y + 1; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      if (hash2(x, y, 1337) % 13 < 2) setPx(p, x, y, t.stoneDark);
    }
  }
  // the lit lip of the floor, broken every few pixels so it is an edge and not a rule line
  for (let x = 0; x < SCENE_W; x += 1 + (hash2(x, 3, 74) % 3)) {
    setPx(p, x, GROUND_Y, t.stoneLit);
    if (hash2(x, 4, 75) % 3) setPx(p, x, GROUND_Y + 1, t.stone);
  }
  // four courses of flagstone, each jointed and bevelled, staggered like real paving
  [4, 12, 21, 31].forEach((dy, ci) => {
    const y = GROUND_Y + dy;
    const step = 22 + ci * 5;
    const offset = hash2(ci, 12, 72) % step;
    for (let x = -offset; x < SCENE_W; x += step) {
      hline(p, x, x + step - 5, y, t.stoneDark);
      hline(p, x, x + step - 5, y + 1, t.stoneLit);
    }
  });
  for (let y = GROUND_Y + 2; y < SCENE_H; y++) {
    const density = ((y - GROUND_Y) / (SCENE_H - GROUND_Y)) * 0.7;
    for (let x = 0; x < SCENE_W; x++) {
      if (bayerAt(x, y) < density) setPx(p, x, y, t.stoneDark);
    }
  }
  if (hollow === 1) {
    // roots crossing the floor: the Warren's own shape language, and nothing straight
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 66;
      const y = GROUND_Y + 8 + (hash2(i, 8, 76) % 6);
      line(p, x, y, x + 9, y + 4, t.stoneLit);
      line(p, x + 9, y + 4, x + 19, y + 2, t.stoneLit);
      line(p, x + 19, y + 2, x + 27, y + 6, t.stoneLit);
      setPx(p, x + 9, y + 5, t.accent);
    }
  } else if (hollow === 2) {
    // embers in the seams, short and low, so the floor glows rather than scratches
    for (let i = 0; i < 8; i++) {
      const x = 14 + i * 40;
      const y = GROUND_Y + 6 + (hash2(i, 9, 77) % 22);
      line(p, x, y, x + 3, y + 2, t.glow);
      setPx(p, x + 5, y + 1, t.accent);
    }
  } else {
    // standing water: a black pool with the far lip catching the lantern
    for (let i = 0; i < 4; i++) {
      const x = 30 + i * 78;
      fillEllipse(p, x, GROUND_Y + 18, 10, 4, C.ink900);
      fillEllipse(p, x, GROUND_Y + 18, 7, 2, t.stoneDark);
      hline(p, x - 8, x + 8, GROUND_Y + 14, t.stoneLit);
    }
  }
  for (const [x, y] of STAGE_TORCHES) blit(p, TORCH, x, y);
  return p;
}

function drawFore(t: Treatment): Pixmap {
  const p = createPixmap(SCENE_W, SCENE_H);
  // Framing edges only, and near-black: they exist to push the actors forward, not to be seen.
  for (let y = 0; y < SCENE_H; y++) {
    const w = 5 + (hash2(1, y, 78) % 4);
    fillRect(p, 0, y, w, 1, C.ink900);
    fillRect(p, SCENE_W - w, y, w, 1, C.ink900);
    setPx(p, w, y, t.stoneDark);
    setPx(p, SCENE_W - w - 1, y, t.stoneDark);
  }
  for (let x = 0; x < SCENE_W; x++) {
    const h = 3 + (hash2(x, 1, 79) % 3);
    fillRect(p, x, 0, 1, h, C.ink900);
    setPx(p, x, h, t.stoneDark);
  }
  // two strands hanging into frame, so the corners are rock and not a painted border
  for (const [x, len] of [
    [58, 26],
    [266, 19],
  ] as const) {
    for (let y = 4; y < 4 + len; y++) {
      setPx(p, x + Math.round(Math.sin(y * 0.4) * 1.5), y, C.ink900);
      setPx(p, x + 1 + Math.round(Math.sin(y * 0.4) * 1.5), y, t.stoneDark);
    }
  }
  return p;
}

export interface HollowStage {
  far: Pixmap;
  mid: Pixmap;
  main: Pixmap;
  fore: Pixmap;
  vignette: Pixmap;
  glow: Pixmap;
  flare: Pixmap;
  torchGlow: Pixmap;
  lamps: readonly [number, number][];
  flames: readonly Pixmap[];
}

const cache = new Map<HollowId, HollowStage>();

export function hollowStage(hollow: HollowId): HollowStage {
  const hit = cache.get(hollow);
  if (hit) return hit;
  const t = TREATMENTS[hollow];
  const stage: HollowStage = {
    far: drawFar(hollow, t),
    mid: drawMid(t),
    main: drawMain(hollow, t),
    fore: drawFore(t),
    vignette: vignette(),
    glow: lightBlob(12, t.tint),
    flare: lightFlare(5),
    torchGlow: lightBlob(8, t.tint),
    lamps: stageLamps(hollow),
    flames: FLAME_FRAMES,
  };
  cache.set(hollow, stage);
  return stage;
}

/** Integer particle positions, deterministic per frame so a replay looks the same twice. */
export function motes(hollow: HollowId, frame: number): [number, number, number][] {
  const t = TREATMENTS[hollow];
  const out: [number, number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const base = hash2(i, 3, 911) % SCENE_W;
    const x =
      t.motes === 'drift'
        ? base + Math.round(Math.sin((frame + i * 2) / 4) * 4)
        : base + (frame % 3 === 0 ? 1 : 0);
    const travel = ((frame + i * 3) % 18) * 7;
    const y =
      t.motes === 'rise'
        ? SCENE_H - 6 - travel
        : t.motes === 'sink'
          ? 12 + travel
          : 40 + ((frame * 2 + i * 11) % 96);
    if (x < 5 || x >= SCENE_W - 5 || y < 8 || y >= SCENE_H - 2) continue;
    out.push([x, y, i % 3 === 0 ? t.glow : t.stone]);
  }
  return out;
}

export interface StageActors {
  companion?: Pixmap;
  enemy?: Pixmap;
  companionX?: number;
  enemyX?: number;
}

/**
 * One composed frame of the stage. `look` is -1..1 and moves each layer by a different integer, which
 * is the whole parallax trick; `flicker` is the lantern's own 0/1/2 wobble so the light never sits
 * perfectly still.
 */
export function composeStage(
  hollow: HollowId,
  frame: number,
  look = 0,
  actors: StageActors = {},
  flicker = 0,
): Pixmap {
  const stage = hollowStage(hollow);
  const camera = Math.max(-1, Math.min(1, look));
  const farX = Math.round(camera * -4);
  const midX = Math.round(camera * -3);
  const mainX = Math.round(camera * -1);
  const foreX = Math.round(camera * -6);
  const out = createPixmap(SCENE_W, SCENE_H, C.ink900);
  blit(out, stage.far, farX, 0);
  blit(out, stage.mid, midX, 0);
  blit(out, stage.main, mainX, 0);
  // Light goes down before the actors. Lit afterwards it washes the sprites and the silhouettes,
  // which is the one thing the whole style lock exists to protect.
  const companionX = (actors.companionX ?? 96) + mainX;
  for (const [x, y] of STAGE_TORCHES) {
    addLight(out, stage.torchGlow, x + 8 + mainX, y + 6 + (flicker === 1 ? 1 : 0));
    addLight(out, stage.flare, x + 8 + mainX, y + 5);
  }
  for (const [x, y] of stage.lamps) {
    addLight(out, stage.torchGlow, x + mainX, y + 2 + (flicker === 2 ? 1 : 0));
    addLight(out, stage.flare, x + mainX, y);
  }
  // The lantern belongs to the companion. An empty stage with a floating ball of light was the single
  // worst defect in the first review of these stages.
  if (actors.companion) addLight(out, stage.glow, companionX + 24 + flicker, GROUND_Y - 22);
  const enemyX = (actors.enemyX ?? 208) + mainX;
  if (actors.enemy) blit(out, actors.enemy, enemyX, GROUND_Y - actors.enemy.h);
  if (actors.companion) blit(out, actors.companion, companionX, GROUND_Y - actors.companion.h);
  for (const [x, y, color] of motes(hollow, frame)) setPx(out, x, y, color);
  for (let i = 0; i < STAGE_TORCHES.length; i++) {
    const [x, y] = STAGE_TORCHES[i]!;
    blit(out, stage.flames[(frame + i * 2) % stage.flames.length]!, x + mainX, y - 5);
  }
  blit(out, stage.fore, foreX, 0);
  blit(out, stage.vignette, 0, 0);
  return out;
}
