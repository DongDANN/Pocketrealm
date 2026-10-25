/**
 * Original enemy art. First family: the Tollbug, a coin-shelled beetle of Rootfall Warren.
 * Frames are authored with integer offsets; shells use sharp metal highlights and dithering
 * only on the large shadowed surfaces.
 */
import { C } from './palette';
import {
  createPixmap,
  dissolve,
  fillEllipse,
  fillPolygon,
  fillRect,
  line,
  setPx,
  type Pixmap,
} from './px';
import { hash2 } from './px';

export interface EnemyFrames {
  idle: Pixmap[];
  attack: Pixmap[];
  /** Knocked back: the coin tips up and the antennae flatten. */
  hurt: Pixmap[];
  /** Hash-thinned, not faded: a dead insect stays the same colour until it stops existing. */
  faint: Pixmap[];
}

interface BugPose {
  dx: number;
  dy: number;
  legFrame: number;
  antenna: number;
  glow: boolean;
  spark?: number;
  /** How the feet are placed. Omitted means the walking pose the idle/attack sets use. */
  stance?: Stance;
  /** Coin lifted off the legs, for a recoil. */
  lift?: number;
  /** Head pulled back toward the shell. */
  tuck?: number;
  /** Head dropped toward the floor. */
  sink?: number;
  /** Share of pixels dropped by hash; used only by the faint set. */
  dissolve?: number;
}

function drawShadow(target: Pixmap): void {
  for (let y = -2; y <= 2; y++) {
    for (let x = -9; x <= 9; x++) {
      if ((x * x) / 81 + (y * y) / 4 > 1) continue;
      if (hash2(x + 20, y + 20, 9) % 100 < 50) setPx(target, 18 + x, 30 + y, C.ink800);
    }
  }
}

type Stance = 'walk' | 'brace' | 'droop';

function drawLegs(
  target: Pixmap,
  dx: number,
  dy: number,
  legFrame: number,
  stance: Stance = 'walk',
): void {
  const shift = legFrame % 2 === 0 ? 0 : 1;
  // A braced bug pushes its feet out and down; a dying one lets them hang inward. Walk is the
  // original approved pose, so it stays byte-identical.
  const out = stance === 'brace' ? 2 : stance === 'droop' ? -2 : 0;
  const down = stance === 'walk' ? 0 : 2;
  // Two-pixel legs with a visible knee, so the silhouette does not read as hair-thin wires.
  const leg = (
    x1: number,
    y1: number,
    kneeX: number,
    kneeY: number,
    footX: number,
    footY: number,
  ) => {
    line(target, x1, y1, kneeX, kneeY, C.ink600);
    line(target, x1 + 1, y1, kneeX + 1, kneeY, C.ink600);
    line(target, kneeX, kneeY, footX, footY, C.ink500);
    line(target, kneeX + 1, kneeY, footX + 1, footY, C.ink500);
    setPx(target, kneeX, kneeY, C.steel2);
    setPx(target, footX, footY, C.steel1);
  };
  const rear = (x1: number, kneeX: number, kneeY: number, footX: number, footY: number) =>
    leg(x1 + dx, 24 + dy, kneeX + dx, kneeY + dy, footX + dx + out, footY + dy + down);
  const front = (x1: number, kneeX: number, kneeY: number, footX: number, footY: number) =>
    leg(x1 + dx, 25 + dy, kneeX + dx, kneeY + dy, footX + dx - out, footY + dy + down);
  // rear legs, knees bent backward
  rear(22, 25, 26 + shift, 27, 29 + shift);
  rear(25, 28, 26 - shift, 29, 28 - shift);
  // front legs, knees bent forward
  front(13, 11, 27 + shift, 9, 30 + shift);
  front(16, 15, 28 - shift, 14, 30 - shift);
  front(10, 8, 26 - shift, 6, 27 - shift);
}

function drawShell(target: Pixmap, dx: number, dy: number): void {
  const cx = 20 + dx;
  const cy = 18 + dy;
  const rx = 9;
  const ry = 7;
  // Only paint pixels that already belong to the coin, so a rim arc can never leave a
  // orphan dot just outside the silhouette.
  const on = (x: number, y: number, c: number): void => {
    if (x < 0 || y < 0 || x >= target.w || y >= target.h) return;
    if (!target.data[y * target.w + x]) return;
    setPx(target, x, y, c);
  };
  const arc = (x: number): number =>
    Math.round(ry * Math.sqrt(Math.max(0, 1 - (x * x) / (rx * rx))));
  // A coin needs the full value range: mid-amber body, pale gold crown, dark lower rim.
  // The previous ramp ran amber3 to amber2 and flattened into one yellow mass.
  fillEllipse(target, cx, cy, rx, ry, C.amber4);
  fillEllipse(target, cx - 1, cy - 1, 6, 4, C.amber3);
  for (let x = -8; x <= 1; x++) on(cx + x, cy - arc(x), C.gold0);
  for (let x = -7; x <= -1; x++) on(cx + x, cy - arc(x) + 1, C.gold1);
  for (let x = -4; x <= 8; x++) {
    on(cx + x, cy + arc(x), C.ember4);
    if (x >= 0) on(cx + x, cy + arc(x) - 1, C.amber5);
  }
  // rivets: bronze studs, dark with a lit edge, so they read as fastened metal
  for (const [ox, oy] of [
    [-6, -2],
    [6, -2],
    [-5, 3],
    [5, 3],
  ] as const) {
    on(cx + ox, cy + oy, C.amber5);
    on(cx + ox + 1, cy + oy, C.gold2);
  }
  // keyhole mark: an old toll-box seal
  fillEllipse(target, cx + 1, cy - 1, 3, 3, C.ink600);
  fillRect(target, cx, cy, 2, 4, C.ink600);
  setPx(target, cx + 1, cy - 2, C.gold1);
  setPx(target, cx - 1, cy - 1, C.gold2);
  setPx(target, cx, cy - 1, C.ink700);
  setPx(target, cx + 1, cy - 1, C.ink700);
  setPx(target, cx + 2, cy - 1, C.gold2);
  setPx(target, cx + 1, cy, C.ink700);
  // scratches
  setPx(target, cx + 5, cy - 3, C.gold0);
  setPx(target, cx + 6, cy - 2, C.ink500);
  setPx(target, cx - 6, cy + 1, C.gold0);
}

function drawHead(target: Pixmap, dx: number, dy: number, antenna: number, glow: boolean): void {
  // Lifted clear of the shell edge and outlined in ink, so the head never merges into the coin.
  const hx = 8 + dx;
  const hy = 21 + dy;
  fillEllipse(target, hx, hy, 5, 5, C.ink700);
  // head and mandibles
  fillEllipse(target, hx, hy, 4, 4, C.ink500);
  fillEllipse(target, hx - 1, hy - 1, 3, 3, C.ink400);
  fillPolygon(
    target,
    [
      [hx - 4, hy + 2],
      [hx - 6, hy + 3],
      [hx - 3, hy + 4],
    ],
    C.steel2,
  );
  fillPolygon(
    target,
    [
      [hx + 1, hy + 3],
      [hx - 1, hy + 5],
      [hx + 2, hy + 4],
    ],
    C.steel2,
  );
  // horn
  fillPolygon(
    target,
    [
      [hx - 2, hy - 4],
      [hx - 4, hy - 6],
      [hx, hy - 5],
    ],
    C.steel1,
  );
  setPx(target, hx - 3, hy - 5, C.steel0);
  // eye
  setPx(target, hx - 2, hy - 1, C.ink800);
  setPx(target, hx - 2, hy, C.amber1);
  setPx(target, hx - 1, hy, C.amber0);
  setPx(target, hx - 3, hy, C.amber3);
  // antennae
  line(target, hx - 1, hy - 3, hx - 4, hy - 7 + antenna, C.steel2);
  line(target, hx + 1, hy - 3, hx - 1, hy - 8 - antenna, C.steel2);
  const tipY = hy - 8 - antenna;
  if (glow) {
    setPx(target, hx - 5, hy - 7 + antenna, C.amber0);
    setPx(target, hx - 2, tipY, C.paper0);
    setPx(target, hx - 1, tipY - 1, C.amber1);
    setPx(target, hx - 2, tipY - 1, C.amber2);
  } else {
    setPx(target, hx - 5, hy - 7 + antenna, C.amber3);
    setPx(target, hx - 2, tipY, C.amber2);
  }
}

function drawSpark(target: Pixmap, dx: number, dy: number, kind: number): void {
  const cx = 3 + dx;
  const cy = 22 + dy;
  const r = kind === 2 ? 5 : 3;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d > r || d < r - 1) continue;
      if ((x + y + 40) % 2 === 0) setPx(target, cx + x, cy + y, d > r - 1 ? C.amber3 : C.amber1);
    }
  }
  setPx(target, cx, cy, C.paper0);
  setPx(target, cx - 1, cy, C.amber0);
  setPx(target, cx + 1, cy, C.amber0);
}

function compose(pose: BugPose): Pixmap {
  const p = createPixmap(32, 32);
  drawShadow(p);
  drawLegs(p, pose.dx, pose.dy, pose.legFrame, pose.stance ?? 'walk');
  drawShell(p, pose.dx, pose.dy - (pose.lift ?? 0));
  drawHead(p, pose.dx + (pose.tuck ?? 0), pose.dy + (pose.sink ?? 0), pose.antenna, pose.glow);
  if (pose.spark) drawSpark(p, pose.dx, pose.dy, pose.spark);
  dissolve(p, pose.dissolve ?? 0);
  return p;
}

const IDLE: BugPose[] = [
  { dx: 0, dy: 0, legFrame: 0, antenna: 0, glow: true },
  { dx: 0, dy: -1, legFrame: 1, antenna: 0, glow: false },
  { dx: 0, dy: -1, legFrame: 0, antenna: 1, glow: true },
  { dx: 0, dy: 0, legFrame: 1, antenna: 1, glow: false },
];

const ATTACK: BugPose[] = [
  { dx: 1, dy: 1, legFrame: 0, antenna: -1, glow: true },
  { dx: 2, dy: 0, legFrame: 1, antenna: -1, glow: true },
  { dx: -3, dy: -1, legFrame: 1, antenna: 1, glow: true, spark: 1 },
  { dx: -4, dy: 0, legFrame: 0, antenna: 1, glow: true, spark: 2 },
  { dx: -1, dy: 0, legFrame: 0, antenna: 0, glow: false },
];

/** Knocked back: the coin is tossed off its legs, the head pulls in, the antennae flatten. */
const HURT: BugPose[] = [
  { dx: 1, dy: -1, legFrame: 0, antenna: 2, glow: false, stance: 'brace', lift: 2, tuck: 2 },
  { dx: 2, dy: -2, legFrame: 1, antenna: 2, glow: false, stance: 'brace', lift: 3, tuck: 2 },
  { dx: 1, dy: 0, legFrame: 1, antenna: 1, glow: false, stance: 'brace', lift: 1, tuck: 1 },
];

/** Collapsing inward, then hashing out. The shadow stays until the last frame. */
const FAINT: BugPose[] = [
  { dx: 2, dy: 1, legFrame: 0, antenna: 2, glow: false, stance: 'droop', tuck: 1, sink: 1 },
  {
    dx: 2,
    dy: 2,
    legFrame: 1,
    antenna: 2,
    glow: false,
    stance: 'droop',
    tuck: 2,
    sink: 2,
    dissolve: 0.35,
  },
  {
    dx: 2,
    dy: 3,
    legFrame: 0,
    antenna: 2,
    glow: false,
    stance: 'droop',
    tuck: 3,
    sink: 3,
    dissolve: 0.7,
  },
];

export function buildTollbug(): EnemyFrames {
  return {
    idle: IDLE.map(compose),
    attack: ATTACK.map(compose),
    hurt: HURT.map(compose),
    faint: FAINT.map(compose),
  };
}

/** A flat silhouette used by the art validator and contact sheets. */
export function silhouette(frames: readonly Pixmap[]): Pixmap[] {
  return frames.map((f) => {
    const s = createPixmap(f.w, f.h);
    for (let i = 0; i < f.data.length; i++) s.data[i] = f.data[i] ? C.ink900 : 0;
    return s;
  });
}
