/**
 * The Delve bestiary, drawn from recipes instead of hand-placed pixels.
 *
 * The Tollbug (`src/art/enemies.ts`) is authored frame by frame because it is the one enemy every
 * player meets first. Fifteen more families would have been three thousand lines of coordinates
 * that no one could keep consistent, so this file owns six silhouettes — the shapes the Hollows
 * actually contain — and each species is a recipe: a stance, a value ramp, a bulk and one mark
 * that makes it legible (a coin seal, a thorn crown, a lamp in its chest).
 *
 * Three rules keep a generated family from looking generated:
 *  1. Nothing is one pixel wide. Limbs are drawn by `limb()`, which is always two pixels thick.
 *  2. Every frame gets one ink outline around the merged silhouette and a rim light on its
 *     upper-left edge, so a violet or ink-bodied creature still reads on a dark cave floor.
 *  3. A mark is anchored to the pixels that are already there (`topAt`), never to an offset that
 *     assumes where the body happens to end.
 *
 * Elites and bosses differ structurally — a spine crest, a second wing pair, pauldrons — because
 * scaling the same shape is how you get three identical purple bats across three difficulties.
 */

import { BOSSES, ELITES, ENEMIES } from '../core/delve/data/enemies';
import { C } from './palette';
import {
  createPixmap,
  dissolve,
  fillEllipse,
  fillPolygon,
  fillRect,
  hash2,
  hline,
  line,
  outline,
  setPx,
  type Pixmap,
} from './px';
import { buildTollbug, type EnemyFrames } from './enemies';

const INK = C.ink900;

export type Archetype = 'crawler' | 'blob' | 'rootfist' | 'floater' | 'beast' | 'husk';

export type Mark = 'none' | 'coin' | 'thorn' | 'lamp' | 'crack' | 'crown' | 'veil' | 'jaw';

export interface CritterPalette {
  /** Mid value of the body. */
  body: number;
  shade: number;
  light: number;
  /** Hard edges: claws, teeth, ribs. */
  edge: number;
  /** Where the creature carries its own light. */
  glow: number;
  eye: number;
}

export interface CritterRecipe {
  id: string;
  archetype: Archetype;
  palette: CritterPalette;
  /** 0.8 is a thin thing, 1.2 fills the frame. */
  bulk: number;
  /** Leg pairs for walkers, wing pairs for floaters, tendrils for the rest. */
  limbs: number;
  /**
   * Which build of the archetype this species is. Two species that share an archetype and a
   * shape are the same sprite in a different colour, and the validator says so: `emberjaw` and
   * `umbraclaw` both measured 0.0% silhouette difference before this field existed.
   */
  shape: 0 | 1 | 2;
  mark: Mark;
  /** True for elites and bosses: an aura ring and extra structure. */
  lord: boolean;
}

interface Pose {
  /** Body offset, in whole pixels. */
  dx: number;
  dy: number;
  /** 0 or 1: which pair of limbs is forward. */
  limb: number;
  /** Lean in pixels across the body, positive tips the head forward. */
  lean: number;
  /** 0-3: how far a mouth, wing or flare is open. */
  flare: number;
  /** Frames drop this share of their pixels by hash — used only by the faint set. */
  dissolve: number;
}

const IDLE: readonly Pose[] = [
  { dx: 0, dy: 0, limb: 0, lean: 0, flare: 0, dissolve: 0 },
  { dx: 0, dy: -1, limb: 1, lean: 0, flare: 1, dissolve: 0 },
  { dx: 1, dy: -1, limb: 0, lean: 1, flare: 2, dissolve: 0 },
  { dx: 1, dy: 0, limb: 1, lean: 0, flare: 1, dissolve: 0 },
];

const ATTACK: readonly Pose[] = [
  { dx: -2, dy: 1, limb: 0, lean: -2, flare: 0, dissolve: 0 },
  { dx: -1, dy: 0, limb: 1, lean: -1, flare: 1, dissolve: 0 },
  { dx: 3, dy: -1, limb: 1, lean: 4, flare: 3, dissolve: 0 },
  { dx: 5, dy: 0, limb: 0, lean: 6, flare: 3, dissolve: 0 },
  { dx: 1, dy: 1, limb: 0, lean: 1, flare: 1, dissolve: 0 },
];

const HURT: readonly Pose[] = [
  { dx: -1, dy: -1, limb: 0, lean: -3, flare: 2, dissolve: 0 },
  { dx: -3, dy: 0, limb: 1, lean: -5, flare: 1, dissolve: 0 },
  { dx: -2, dy: 1, limb: 0, lean: -2, flare: 0, dissolve: 0 },
];

const FAINT: readonly Pose[] = [
  { dx: 0, dy: 1, limb: 0, lean: 0, flare: 1, dissolve: 0 },
  { dx: 1, dy: 3, limb: 1, lean: 2, flare: 0, dissolve: 0.35 },
  { dx: 1, dy: 5, limb: 0, lean: 3, flare: 0, dissolve: 0.7 },
];

export interface CritterFrames {
  idle: Pixmap[];
  attack: Pixmap[];
  hurt: Pixmap[];
  faint: Pixmap[];
}

/** Where a mark may attach: the body's middle, the head's middle, and the surface below them. */
interface Anchor {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  palette: CritterPalette;
  flare: number;
}

const r = (value: number): number => Math.round(value);

/**
 * Three builds per archetype. `bulk` scales a sprite; this changes its proportions, which is the
 * difference between a family that reads as one creature drawn at three sizes and one that reads
 * as three animals that happen to share a body plan.
 */
const PROPORTIONS = {
  crawler: { rx: [1, 1.25, 0.85], ry: [1, 0.8, 1.3], head: [4, 3, 5] },
  blob: { rx: [1.1, 0.72, 1.3], ry: [0.85, 1.45, 0.72] },
  rootfist: { trunk: [1.1, 0.72, 1.3], top: [10, 6, 8], reach: [8, 11, 7] },
  floater: {
    span: [1.1, 0.7, 1.2],
    lift: [1, 3, 0],
    thread: [3, 8, 5],
    body: [1, 1.35, 0.85],
  },
  beast: {
    leg: [3, 8, 5],
    rx: [1.05, 0.8, 1.15],
    ry: [0.85, 1.3, 0.8],
    head: [4.5, 3, 5.5],
    tail: [1, 4, 0],
  },
  husk: { top: [8, 4, 6], shoulder: [1, 0.8, 1.35], hem: [27, 31, 30] },
} as const;

/** Two-pixel limb. The thick axis follows the segment, so diagonals never pinch to one pixel. */
function limb(target: Pixmap, x0: number, y0: number, x1: number, y1: number, color: number): void {
  line(target, x0, y0, x1, y1, color);
  if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) line(target, x0, y0 + 1, x1, y1 + 1, color);
  else line(target, x0 + 1, y0, x1 + 1, y1, color);
}

/** Ground shadow, painted last and only into clear pixels so it can never eat the sprite. */
function shadow(target: Pixmap, cx: number, cy: number, rx: number, strength: number): void {
  for (let y = -2; y <= 2; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / 4 > 1) continue;
      if (hash2(x + 97, y + 97, 11) % 100 > strength) continue;
      const px = cx + x;
      const py = cy + y;
      if (px < 0 || py < 0 || px >= target.w || py >= target.h) continue;
      if (target.data[py * target.w + px]) continue;
      target.data[py * target.w + px] = C.ink800;
    }
  }
}

/** The topmost painted pixel in a column, so a crown sits on the head instead of beside it. */
function topAt(target: Pixmap, x: number): number {
  if (x < 0 || x >= target.w) return 0;
  for (let y = 0; y < target.h; y++) if (target.data[y * target.w + x]) return y;
  return target.h - 1;
}

/** The lowest painted pixel in a column, for anything that hangs. */
function bottomAt(target: Pixmap, x: number): number {
  if (x < 0 || x >= target.w) return 0;
  for (let y = target.h - 1; y >= 0; y--) if (target.data[y * target.w + x]) return y;
  return 0;
}

/** Paint inside the existing silhouette only — a highlight can never orphan a pixel. */
function inside(target: Pixmap, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= target.w || y >= target.h) return;
  if (!target.data[y * target.w + x]) return;
  setPx(target, x, y, color);
}

function aura(target: Pixmap, cx: number, cy: number, radius: number, color: number): void {
  for (let a = 0; a < 16; a++) {
    const x = cx + r(Math.cos((a / 16) * Math.PI * 2) * radius);
    const y = cy + r(Math.sin((a / 16) * Math.PI * 2) * radius * 0.7);
    setPx(target, x, y, a % 4 === 0 ? color : C.ink600);
  }
}

/** Rim light on the upper-left edge of the finished silhouette. This is what makes dark bodies read. */
function rimLight(target: Pixmap, rim: number): void {
  const w = target.w;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= target.h ? 0 : (target.data[y * w + x] ?? 0);
  for (let y = 0; y < target.h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) !== 0) continue;
      const litAbove = at(x, y - 1) !== 0 && at(x, y - 2) === 0;
      const litLeft = at(x - 1, y) !== 0 && at(x - 2, y) === 0;
      if (!litAbove && !litLeft) continue;
      // A rim every other pixel keeps the outline dominant instead of turning the body white.
      if ((x + y) % 2 === 0) target.data[y * w + x] = rim;
    }
  }
}

/** The one distinguishing feature, drawn against the pixels that are already there. */
function mark(target: Pixmap, kind: Mark, a: Anchor): void {
  const { palette } = a;
  switch (kind) {
    case 'coin': {
      // A keyhole seal: the toll motif, punched into the shell rather than sitting on it.
      fillEllipse(target, a.cx, a.cy - 1, 2, 2, INK);
      fillRect(target, a.cx - 1, a.cy, 2, 3, INK);
      inside(target, a.cx - 2, a.cy - 2, palette.light);
      inside(target, a.cx + 2, a.cy - 2, palette.light);
      inside(target, a.cx, a.cy - 1, palette.glow);
      break;
    }
    case 'thorn': {
      const crest = topAt(target, a.cx);
      for (const [ox, tall] of [
        [-4, 3],
        [0, 5],
        [4, 3],
      ] as const) {
        const x = a.cx + ox;
        const y = topAt(target, x);
        // A column with no body under it has no surface to grow from.
        if (y > crest + 5) continue;
        const base = y + 1;
        fillPolygon(
          target,
          [
            [x - 1, base],
            [x, base - tall],
            [x + 1, base],
          ],
          palette.edge,
        );
        setPx(target, x, base - tall, palette.glow);
      }
      break;
    }
    case 'lamp': {
      // A lantern in the chest: a dark housing, a lit core, and one blown pixel of flame.
      fillEllipse(target, a.cx, a.cy, 3, 3, INK);
      fillEllipse(target, a.cx, a.cy, 2, 2, palette.glow);
      setPx(target, a.cx, a.cy - 1, C.paper0);
      setPx(target, a.cx - 1, a.cy, C.paper0);
      setPx(target, a.cx + 1, a.cy, palette.light);
      break;
    }
    case 'crack': {
      for (const [ox, oy, len] of [
        [-3, -3, 4],
        [2, -1, 5],
      ] as const) {
        for (let i = 0; i < len; i++) {
          inside(target, a.cx + ox + (i % 2), a.cy + oy + i, palette.glow);
          inside(target, a.cx + ox + 1 + (i % 2), a.cy + oy + i, INK);
        }
        inside(target, a.cx + ox, a.cy + oy + 2, C.paper0);
      }
      break;
    }
    case 'crown': {
      // A circlet that follows the skull, then spikes that rise out of it. A straight band at a
      // fixed height reads as a halo floating next to a round head, which is exactly what it did.
      const half = 5;
      const headTop = topAt(target, a.hx);
      const tops: number[] = [];
      for (let ox = -half; ox <= half; ox++) {
        const y = topAt(target, a.hx + ox);
        tops.push(y > headTop + 5 ? -1 : y);
      }
      for (const [i, y] of tops.entries()) {
        if (y < 0) continue;
        fillRect(target, a.hx - half + i, y, 1, 2, palette.edge);
      }
      for (const [ox, tall] of [
        [-4, 3],
        [-1, 5],
        [2, 5],
        [5, 3],
      ] as const) {
        const y = tops[ox + half]!;
        if (y < 0) continue;
        const x = a.hx + ox;
        fillPolygon(
          target,
          [
            [x, y],
            [x, y - tall],
            [x + 1, y],
          ],
          palette.edge,
        );
        setPx(target, x, y - tall, palette.glow);
      }
      break;
    }
    case 'veil': {
      // Cloth hanging off the hem, so a veil is the one silhouette that reads while moving.
      const hem = bottomAt(target, a.cx) - 1;
      for (let x = -5; x <= 5; x++) {
        const drop = 3 + (hash2(x + 31, 7, 5) % 4);
        for (let y = 0; y <= drop; y++) {
          if ((x + y) % 3 === 0) continue;
          setPx(target, a.cx + x, hem + y, y > drop - 2 ? palette.shade : palette.body);
        }
      }
      break;
    }
    case 'jaw': {
      // An open mouth on the head: a dark gap, a lit upper tooth, and a lower jaw that swings
      // further open as the pose flares.
      const gap = 1 + a.flare;
      fillPolygon(
        target,
        [
          [a.hx - 5, a.hy - 1],
          [a.hx, a.hy - 2],
          [a.hx, a.hy],
          [a.hx - 5, a.hy + 1],
        ],
        INK,
      );
      fillPolygon(
        target,
        [
          [a.hx - 5, a.hy + 1 + gap],
          [a.hx, a.hy + 1],
          [a.hx, a.hy + 3],
          [a.hx - 4, a.hy + 3 + gap],
        ],
        palette.shade,
      );
      setPx(target, a.hx - 4, a.hy, palette.edge);
      setPx(target, a.hx - 2, a.hy, palette.edge);
      setPx(target, a.hx - 3, a.hy + 1 + gap, palette.edge);
      break;
    }
    case 'none':
      break;
  }
}

function eyes(target: Pixmap, cx: number, cy: number, palette: CritterPalette, gap = 2): void {
  for (const side of [-gap, gap]) {
    setPx(target, cx + side, cy, INK);
    setPx(target, cx + side, cy + 1, palette.eye);
    setPx(target, cx + side, cy + 2, palette.eye);
    setPx(target, cx + side + 1, cy + 1, C.paper0);
  }
}

function crawler(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.crawler;
  const cx = r(18 + pose.dx + pose.lean * 0.4);
  const cy = r(18 + pose.dy);
  const rx = r(8 * bulk * p.rx[recipe.shape]);
  const ry = r(6 * bulk * p.ry[recipe.shape]);
  const headR = p.head[recipe.shape];
  for (let leg = 0; leg < recipe.limbs; leg++) {
    const forward = leg % 2 === pose.limb;
    const x = cx - rx + 3 + leg * 3;
    const kneeY = cy + ry - 2 + (forward ? 2 : 0);
    limb(target, x, cy + ry - 4, x - 1, kneeY, palette.shade);
    limb(target, x - 1, kneeY, x - 1, 28, palette.body);
    setPx(target, x - 1, 28, palette.edge);
    setPx(target, x, 28, palette.edge);
  }
  fillEllipse(target, cx, cy, rx, ry, palette.body);
  fillEllipse(target, cx - 1, cy - 1, rx - 2, ry - 2, palette.light);
  for (let x = -rx + 2; x <= 1; x++) {
    const arc = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
    inside(target, cx + x, cy - arc, palette.light);
  }
  const hx = cx - rx - 1;
  const hy = cy + 2;
  limb(target, hx + 3, hy - 2, cx - rx + 2, cy, palette.body);
  fillEllipse(target, hx, hy, headR, headR, palette.body);
  fillEllipse(target, hx - 1, hy - 1, headR - 2, headR - 2, palette.light);
  eyes(target, hx - 1, hy - 1, palette, 1);
  setPx(target, hx - headR, hy + 2, palette.edge);
  setPx(target, hx - headR + 1, hy + 3, palette.edge);
  line(target, hx - 1, hy - headR, hx - 4, hy - headR - 4 + pose.flare, palette.edge);
  line(target, hx + 1, hy - headR, hx + 2, hy - headR - 4 - pose.flare, palette.edge);
  setPx(target, hx - 4, hy - headR - 4 + pose.flare, palette.glow);
  setPx(target, hx + 2, hy - headR - 4 - pose.flare, palette.glow);
  mark(target, recipe.mark, { cx, cy, hx, hy, palette, flare: pose.flare });
}

function blob(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.blob;
  const cx = r(16 + pose.dx);
  const cy = r(20 + pose.dy);
  const rx = r(9 * bulk * p.rx[recipe.shape]);
  const ry = r(7 * bulk * p.ry[recipe.shape]);
  fillEllipse(target, cx, cy, rx, ry, palette.body);
  fillEllipse(target, cx - 2, cy - 2, rx - 4, ry - 3, palette.light);
  for (let drip = 0; drip < recipe.limbs; drip++) {
    const x = cx - rx + 4 + drip * 4;
    const length = 2 + ((drip + pose.limb) % 3);
    const top = bottomAt(target, x) - 1;
    limb(target, x, top, x + (drip % 2 === 0 ? 0 : 1), top + length, palette.body);
    setPx(target, x, top + length + 1, palette.light);
  }
  // A mouth line, so the dome is a face and not a puddle.
  fillRect(target, cx - 3, cy + 3, 7, 1, INK);
  for (let tooth = -2; tooth <= 2; tooth += 2) setPx(target, cx + tooth, cy + 4, palette.edge);
  eyes(target, cx, cy - 2, palette, 3);
  mark(target, recipe.mark, { cx, cy, hx: cx, hy: cy - ry + 2, palette, flare: pose.flare });
}

function rootfist(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.rootfist;
  const cx = r(16 + pose.dx);
  const base = r(28 + pose.dy * 0.4);
  const top = r(p.top[recipe.shape] + pose.dy);
  const lean = r(pose.lean * 0.7);
  const trunkW = r(4 * bulk * p.trunk[recipe.shape]) + (recipe.lord ? 1 : 0);
  // Root feet first: three two-pixel roots that flare out and meet the floor.
  for (let foot = 0; foot < 3; foot++) {
    const side = foot - 1;
    const x0 = cx + side * 2;
    const x1 = cx + side * (trunkW + 3);
    limb(target, x0, base - 5, (x0 + x1) >> 1, base - 1, palette.shade);
    limb(target, (x0 + x1) >> 1, base - 1, x1, base, palette.body);
    setPx(target, x1, base, palette.edge);
  }
  // Arm roots: thick roots that lift on the strike pose.
  const arms = recipe.lord ? 3 : 2;
  for (let arm = 0; arm < arms; arm++) {
    const side = arm % 2 === 0 ? -1 : 1;
    const y0 = top + 4 + Math.floor(arm / 2) * 4;
    const reach = r(p.reach[recipe.shape] * bulk) + (side < 0 ? lean : -lean);
    const lift = arm % 2 === pose.limb ? -2 : 1;
    limb(target, cx + side * 2, y0, cx + side * reach, y0 + lift + 2, palette.shade);
    limb(
      target,
      cx + side * reach,
      y0 + lift + 2,
      cx + side * (reach + 2),
      y0 + lift + 5,
      palette.body,
    );
    setPx(target, cx + side * (reach + 2), y0 + lift + 5, palette.edge);
    setPx(target, cx + side * (reach + 3), y0 + lift + 4, palette.edge);
  }
  // The trunk: a tapered knot, wider at the crown where it becomes the head.
  for (let y = top; y <= base - 4; y++) {
    const t = (y - top) / Math.max(1, base - 4 - top);
    const half = Math.max(2, r(trunkW * (0.72 + t * 0.5)));
    const x = cx + r(lean * (1 - t));
    hline(target, x - half, x + half, y, t > 0.62 ? palette.body : palette.shade);
  }
  fillEllipse(target, cx + lean, top + 1, trunkW + 1, trunkW, palette.body);
  // Grain: two knots and a lit edge down the sunward side.
  for (let i = 0; i < 3; i++) {
    const y = top + 4 + i * 5;
    inside(target, cx + lean - 2 + i, y, palette.shade);
    inside(target, cx + lean - 1 + i, y + 1, palette.shade);
  }
  for (let y = top + 2; y < base - 5; y += 2)
    inside(target, cx + lean - trunkW + 1, y, palette.light);
  setPx(target, cx + lean - 3, top + 6, palette.glow);
  setPx(target, cx + lean + 3, top + 9, palette.glow);
  eyes(target, cx + lean, top + 2, palette, 2);
  fillRect(target, cx + lean - 2, top + 5, 5, 1, INK);
  mark(target, recipe.mark, {
    cx: cx + r(lean * 0.4),
    cy: top + 10,
    hx: cx + lean,
    hy: top + 1,
    palette,
    flare: pose.flare,
  });
}

function floater(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.floater;
  const cx = r(16 + pose.dx);
  const cy = r(15 + pose.dy - pose.flare);
  const span = r(9 * bulk * p.span[recipe.shape]);
  const lift = pose.flare + p.lift[recipe.shape];
  const pairs = recipe.lord ? 2 : 1;
  for (let wing = 0; wing < pairs; wing++) {
    const inset = wing * 3;
    for (const side of [-1, 1]) {
      // Membrane first, then a lit leading edge, so the wing has a front and a back.
      fillPolygon(
        target,
        [
          [cx + side * 3, cy + 1 + inset],
          [cx + side * (span - inset), cy - 3 - lift + inset * 2],
          [cx + side * (span - 2 - inset), cy + 4 + lift + inset],
          [cx + side * 4, cy + 5 + inset],
        ],
        palette.shade,
      );
      line(
        target,
        cx + side * 3,
        cy + 1 + inset,
        cx + side * (span - inset),
        cy - 3 - lift + inset * 2,
        palette.light,
      );
      line(
        target,
        cx + side * (span - inset),
        cy - 3 - lift + inset * 2,
        cx + side * (span - 2 - inset),
        cy + 4 + lift + inset,
        palette.body,
      );
    }
  }
  // Threads hang from the body, two pixels thick, and swing on the pose.
  for (let thread = 0; thread < Math.min(3, recipe.limbs); thread++) {
    const x = cx - 2 + thread * 2;
    const length = p.thread[recipe.shape] + ((thread + pose.limb) % 3) * 2;
    limb(target, x, cy + 5, x + (thread % 2 === 0 ? -1 : 1), cy + 5 + length, palette.shade);
    setPx(target, x, cy + 5 + length + 1, palette.glow);
  }
  fillEllipse(
    target,
    cx,
    cy + 2,
    r((3 * bulk + 1) * p.body[recipe.shape]),
    r(4.5 * bulk * p.body[recipe.shape]),
    palette.body,
  );
  fillEllipse(target, cx - 1, cy + 1, 1, 2, palette.light);
  fillEllipse(target, cx, cy - 3, 3, 2, palette.body);
  eyes(target, cx, cy - 4, palette, 1);
  line(target, cx - 2, cy - 5, cx - 4, cy - 9 - pose.flare, palette.edge);
  line(target, cx + 2, cy - 5, cx + 4, cy - 9 + pose.flare, palette.edge);
  setPx(target, cx - 4, cy - 9 - pose.flare, palette.glow);
  setPx(target, cx + 4, cy - 9 + pose.flare, palette.glow);
  mark(target, recipe.mark, { cx, cy: cy + 2, hx: cx, hy: cy - 3, palette, flare: pose.flare });
}

function beast(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.beast;
  const shape = recipe.shape;
  const cx = r(18 + pose.dx + pose.lean * 0.3);
  // A long-legged build carries its body higher over the same four legs.
  const cy = r(19 + pose.dy - (p.leg[shape] - 3));
  const rx = r(8 * bulk * p.rx[shape]);
  const ry = r(5 * bulk * p.ry[shape]);
  const headR = p.head[shape];
  const hx = r(cx - rx - 2 + pose.lean * 0.6);
  const hy = cy - 3;
  for (let leg = 0; leg < recipe.limbs; leg++) {
    const forward = leg % 2 === pose.limb;
    const x = cx - rx + 4 + leg * 4;
    const kneeY = cy + ry - 2;
    limb(target, x, cy + 2, x + (forward ? 2 : -2), kneeY, palette.shade);
    limb(target, x + (forward ? 2 : -2), kneeY, x + (forward ? 2 : -2), 28, palette.body);
    setPx(target, x + (forward ? 2 : -2), 28, palette.edge);
    setPx(target, x + (forward ? 3 : -1), 28, palette.edge);
  }
  // A neck, so the head is a separate mass rather than a bump on the body.
  limb(target, hx + 2, hy, cx - rx + 3, cy - 1, palette.body);
  fillEllipse(target, cx, cy, rx, ry, palette.body);
  fillEllipse(target, cx - rx + 4, cy - 2, 3, 3, palette.body);
  if (recipe.lord) {
    // A spine crest that follows the back curve: the elite and the ordinary are different shapes,
    // not different sizes.
    for (let plate = 0; plate < 4; plate++) {
      const x = cx - rx + 6 + plate * 3;
      const tall = 2 + (plate === 1 ? 2 : plate === 2 ? 1 : 0);
      const base = topAt(target, x) + 1;
      fillPolygon(
        target,
        [
          [x - 1, base],
          [x, base - tall],
          [x + 1, base],
        ],
        palette.shade,
      );
      setPx(target, x, base - tall, palette.edge);
    }
  } else {
    for (const [ox, oy] of [
      [rx - 2, -3],
      [rx, -5],
    ] as const) {
      limb(
        target,
        cx + ox,
        cy + oy,
        cx + ox + 3,
        cy + oy - 2 - pose.flare - p.tail[shape],
        palette.shade,
      );
    }
  }
  for (let x = -rx + 3; x <= rx - 3; x++) {
    const arc = Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
    inside(target, cx + x, cy + arc - 1, palette.shade);
  }
  fillEllipse(target, hx, hy, headR, r(headR * 0.75), palette.body);
  fillEllipse(target, hx - 1, hy - 1, headR - 2, r(headR * 0.5) - 1, palette.light);
  eyes(target, hx, hy - 2, palette, 1);
  // An ear, so the head has a back.
  fillPolygon(
    target,
    [
      [hx + 1, hy - r(headR * 0.6)],
      [hx + 3, hy - headR - 2 - pose.flare],
      [hx + 4, hy - r(headR * 0.4)],
    ],
    palette.body,
  );
  mark(target, recipe.mark === 'none' ? 'jaw' : recipe.mark, {
    cx,
    cy,
    hx,
    hy,
    palette,
    flare: pose.flare,
  });
}

function husk(target: Pixmap, recipe: CritterRecipe, pose: Pose): void {
  const { palette, bulk } = recipe;
  const p = PROPORTIONS.husk;
  const cx = r(16 + pose.dx + pose.lean * 0.4);
  const top = r(p.top[recipe.shape] + pose.dy);
  const hem = p.hem[recipe.shape];
  const shoulder = r(4 * bulk * p.shoulder[recipe.shape]);
  const flare = r(6 * bulk) + (recipe.lord ? 1 : 0);
  // Arms hang from the shoulders. They used to reach up, which read as ears.
  for (const side of [-1, 1]) {
    const x0 = cx + side * (shoulder - 1);
    const y0 = top + 6;
    const swing = side < 0 === (pose.limb === 1) ? -1 : 1;
    limb(target, x0, y0, cx + side * (flare + 1), y0 + 5 + swing, palette.shade);
    limb(
      target,
      cx + side * (flare + 1),
      y0 + 5 + swing,
      cx + side * (flare + 1),
      y0 + 9,
      palette.body,
    );
    setPx(target, cx + side * (flare + 1), y0 + 10, palette.edge);
    setPx(target, cx + side * (flare + 2), y0 + 10, palette.edge);
  }
  // A tapered robe: narrow at the shoulders, wide and torn at the hem.
  for (let y = top + 3; y <= hem; y++) {
    const t = (y - (top + 3)) / Math.max(1, hem - top - 3);
    const half = Math.max(shoulder, r(shoulder + t * (flare - shoulder)));
    hline(target, cx - half, cx + half, y, palette.body);
    inside(target, cx - half, y, palette.shade);
  }
  for (let x = cx - flare; x <= cx + flare; x++) {
    const tear = hash2(x + 41, 3, 17) % 4;
    for (let y = 0; y < tear; y++) inside(target, x, hem - y, 0);
  }
  // Ribs across the front, so the robe has a body inside it.
  for (let rib = 0; rib < 3; rib++) {
    const y = top + 9 + rib * 4;
    line(target, cx - 3, y, cx + 3, y + 1, palette.shade);
  }
  if (recipe.lord) {
    // Pauldrons: the body's own value with a lit rim, not a slab of near-white metal.
    for (const side of [-1, 1]) {
      const x = cx + side * (shoulder + 1);
      fillEllipse(target, x, top + 5, 3, 2, palette.body);
      fillEllipse(target, x, top + 6, 2, 1, palette.shade);
      setPx(target, x - 1, top + 4, palette.edge);
      setPx(target, x, top + 4, palette.edge);
      setPx(target, x + 1, top + 5, palette.light);
    }
  }
  // The hollow: a dark socket with the creature's own light burning in it.
  fillEllipse(target, cx, top + 12, 3, 4, INK);
  fillEllipse(target, cx, top + 12, 2, 2, palette.glow);
  setPx(target, cx, top + 11, C.paper0);
  setPx(target, cx - 1, top + 13, palette.light);
  // A hood, not a head.
  fillEllipse(target, cx, top, r(4 * bulk), 4, palette.body);
  fillEllipse(target, cx, top + 1, r(3 * bulk), 3, INK);
  eyes(target, cx, top, palette, 2);
  mark(target, recipe.mark, { cx, cy: top + 12, hx: cx, hy: top, palette, flare: pose.flare });
}

const ARCHETYPES: Record<Archetype, (target: Pixmap, recipe: CritterRecipe, pose: Pose) => void> = {
  crawler,
  blob,
  rootfist,
  floater,
  beast,
  husk,
};

function compose(recipe: CritterRecipe, pose: Pose): Pixmap {
  const target = createPixmap(32, 32);
  ARCHETYPES[recipe.archetype](target, recipe, pose);
  outline(target, INK);
  rimLight(target, recipe.palette.light);
  shadow(target, 16, 30, r(9 * recipe.bulk), recipe.lord ? 34 : 52);
  if (recipe.lord)
    aura(target, 16 + pose.dx, 16 + pose.dy, r(13 * recipe.bulk), recipe.palette.glow);
  dissolve(target, pose.dissolve);
  return target;
}

export function buildCritter(recipe: CritterRecipe): CritterFrames {
  return {
    idle: IDLE.map((pose) => compose(recipe, pose)),
    attack: ATTACK.map((pose) => compose(recipe, pose)),
    hurt: HURT.map((pose) => compose(recipe, pose)),
    faint: FAINT.map((pose) => compose(recipe, pose)),
  };
}

const ramp = (
  body: number,
  shade: number,
  light: number,
  edge: number,
  glow: number,
  eye: number,
): CritterPalette => ({ body, shade, light, edge, glow, eye });

/**
 * One recipe per bestiary entry except the Tollbug, which keeps its hand-authored frames.
 * The archetype follows how the creature moves and the mark is the line of its lore a player can
 * actually see: a seal, a thorn, a lamp, a crack.
 */
const RECIPES: readonly CritterRecipe[] = [
  {
    id: 'mossbite',
    shape: 0,
    archetype: 'blob',
    palette: ramp(C.moss3, C.moss5, C.moss1, C.paper2, C.amber1, C.amber0),
    bulk: 0.9,
    limbs: 4,
    mark: 'thorn',
    lord: false,
  },
  {
    id: 'rootsnarl',
    shape: 0,
    archetype: 'rootfist',
    palette: ramp(C.paper4, C.paper5, C.paper2, C.ink600, C.moss2, C.amber0),
    bulk: 1,
    limbs: 4,
    mark: 'none',
    lord: false,
  },
  {
    id: 'sparkmoth',
    shape: 0,
    archetype: 'floater',
    palette: ramp(C.steel2, C.ink500, C.paper1, C.steel0, C.amber1, C.cyan1),
    bulk: 1,
    limbs: 3,
    mark: 'lamp',
    lord: false,
  },
  {
    id: 'cinderbeetle',
    shape: 0,
    archetype: 'crawler',
    palette: ramp(C.ember3, C.ember4, C.ember1, C.steel1, C.amber1, C.amber0),
    bulk: 0.95,
    limbs: 3,
    mark: 'crack',
    lord: false,
  },
  {
    id: 'emberjaw',
    shape: 0,
    archetype: 'beast',
    palette: ramp(C.ember2, C.ember3, C.ember1, C.paper1, C.amber0, C.ink800),
    bulk: 1,
    limbs: 4,
    mark: 'jaw',
    lord: false,
  },
  {
    id: 'smolderhusk',
    shape: 1,
    archetype: 'husk',
    palette: ramp(C.ink400, C.ink600, C.steel2, C.steel1, C.ember1, C.amber1),
    bulk: 1,
    limbs: 3,
    mark: 'crack',
    lord: false,
  },
  {
    id: 'shadewisp',
    shape: 1,
    archetype: 'floater',
    palette: ramp(C.violet4, C.violet5, C.violet2, C.violet1, C.cyan2, C.paper0),
    bulk: 0.8,
    limbs: 4,
    mark: 'none',
    lord: false,
  },
  {
    id: 'umbraclaw',
    shape: 1,
    archetype: 'beast',
    palette: ramp(C.violet4, C.violet5, C.violet2, C.rose2, C.violet1, C.rose0),
    bulk: 1.05,
    limbs: 4,
    mark: 'jaw',
    lord: false,
  },
  {
    id: 'voidveil',
    shape: 2,
    archetype: 'floater',
    palette: ramp(C.violet3, C.violet5, C.violet1, C.frost2, C.frost1, C.paper0),
    bulk: 1.1,
    limbs: 5,
    mark: 'veil',
    lord: false,
  },
  {
    id: 'thornheart',
    shape: 1,
    archetype: 'rootfist',
    palette: ramp(C.moss4, C.moss5, C.moss1, C.rose2, C.rose0, C.amber0),
    bulk: 1.15,
    limbs: 5,
    mark: 'thorn',
    lord: true,
  },
  {
    id: 'cindermaw',
    shape: 2,
    archetype: 'beast',
    palette: ramp(C.ember3, C.ember4, C.ember1, C.paper1, C.amber0, C.paper0),
    bulk: 1.15,
    limbs: 4,
    mark: 'jaw',
    lord: true,
  },
  {
    id: 'veilweaver',
    shape: 0,
    archetype: 'floater',
    palette: ramp(C.violet3, C.ink700, C.frost2, C.steel0, C.cyan1, C.paper0),
    bulk: 1.15,
    limbs: 6,
    mark: 'veil',
    lord: true,
  },
  {
    id: 'thorncrown',
    shape: 2,
    archetype: 'rootfist',
    palette: ramp(C.moss4, C.moss5, C.moss2, C.gold1, C.amber1, C.rose1),
    bulk: 1.2,
    limbs: 6,
    mark: 'crown',
    lord: true,
  },
  {
    id: 'ashwrought',
    shape: 2,
    archetype: 'husk',
    palette: ramp(C.steel2, C.ink600, C.paper1, C.steel0, C.ember1, C.amber0),
    bulk: 1.2,
    limbs: 4,
    mark: 'crack',
    lord: true,
  },
  {
    id: 'umbralmonarch',
    shape: 0,
    archetype: 'husk',
    palette: ramp(C.violet4, C.ink800, C.violet2, C.gold0, C.frost1, C.frost0),
    bulk: 1.25,
    limbs: 5,
    mark: 'crown',
    lord: true,
  },
];

export const CRITTER_RECIPES: ReadonlyMap<string, CritterRecipe> = new Map(
  RECIPES.map((recipe) => [recipe.id, recipe]),
);

/**
 * Every bestiary id in the order the codex lists them: 10 ordinaries, 3 elites, 3 bosses.
 * A missing family shows up here, so the test suite can fail on a hole instead of the canvas
 * drawing a blank square mid-run.
 */
export function bestiaryIds(): string[] {
  return [...ENEMIES, ...ELITES, ...BOSSES].map((enemy) => enemy.id);
}

export function critterRecipe(id: string): CritterRecipe | undefined {
  return CRITTER_RECIPES.get(id);
}

const cache = new Map<string, CritterFrames>();
let tollbug: EnemyFrames | undefined;

/**
 * The one lookup a battle scene should use: hand-authored frames for the Tollbug, recipe frames
 * for everything else. Built once per species — the frames are pure functions of the recipe.
 */
export function enemyFrames(id: string): CritterFrames | null {
  if (id === 'tollbug') {
    tollbug ??= buildTollbug();
    return tollbug;
  }
  const cached = cache.get(id);
  if (cached) return cached;
  const recipe = CRITTER_RECIPES.get(id);
  if (!recipe) return null;
  const built = buildCritter(recipe);
  cache.set(id, built);
  return built;
}

/** Bestiary ids with no sprite family at all. Empty is the only acceptable answer. */
export function unartoredIds(): string[] {
  return bestiaryIds().filter((id) => enemyFrames(id) === null);
}
