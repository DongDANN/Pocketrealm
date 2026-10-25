/**
 * Mossling Warden — original companion art, authored as code.
 * Part-based rig: feet/shadow are static; body, arms, staff and lantern are composited
 * with integer offsets per frame. No runtime rotation or fractional scaling.
 */
import { C } from './palette';
import {
  autoLight,
  blit,
  clonePixmap,
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

export interface WardenFrames {
  idle: Pixmap[];
  attack: Pixmap[];
  portrait: Pixmap;
}

interface Pose {
  bodyDX: number;
  bodyDY: number;
  staffTopDX: number;
  staffTopDY: number;
  lanternDX: number;
  lanternDY: number;
  flame: number;
  arm: number;
  trail?: number;
  burst?: number;
  blink?: boolean;
}

const IDLE_POSES: Pose[] = [
  {
    bodyDX: 0,
    bodyDY: 0,
    staffTopDX: 0,
    staffTopDY: 0,
    lanternDX: 0,
    lanternDY: 0,
    flame: 0,
    arm: 0,
  },
  {
    bodyDX: 0,
    bodyDY: 0,
    staffTopDX: 0,
    staffTopDY: -1,
    lanternDX: -1,
    lanternDY: 0,
    flame: 1,
    arm: 1,
  },
  {
    bodyDX: 0,
    bodyDY: -1,
    staffTopDX: 0,
    staffTopDY: -1,
    lanternDX: -1,
    lanternDY: -1,
    flame: 2,
    arm: 1,
  },
  {
    bodyDX: 0,
    bodyDY: -1,
    staffTopDX: 0,
    staffTopDY: 0,
    lanternDX: 0,
    lanternDY: -1,
    flame: 0,
    arm: 0,
  },
  {
    bodyDX: 0,
    bodyDY: 0,
    staffTopDX: 0,
    staffTopDY: 1,
    lanternDX: 1,
    lanternDY: 0,
    flame: 1,
    arm: 0,
  },
  {
    bodyDX: 0,
    bodyDY: 0,
    staffTopDX: 0,
    staffTopDY: 0,
    lanternDX: 1,
    lanternDY: 0,
    flame: 2,
    arm: -1,
    blink: true,
  },
];

const ATTACK_POSES: Pose[] = [
  {
    bodyDX: 0,
    bodyDY: 1,
    staffTopDX: 0,
    staffTopDY: 2,
    lanternDX: 0,
    lanternDY: 2,
    flame: 1,
    arm: -1,
  },
  {
    bodyDX: -1,
    bodyDY: 0,
    staffTopDX: 1,
    staffTopDY: -5,
    lanternDX: 1,
    lanternDY: -6,
    flame: 2,
    arm: -1,
  },
  {
    bodyDX: 1,
    bodyDY: -1,
    staffTopDX: 5,
    staffTopDY: -2,
    lanternDX: 4,
    lanternDY: -4,
    flame: 0,
    arm: 1,
    trail: 1,
  },
  {
    bodyDX: 2,
    bodyDY: 0,
    staffTopDX: 7,
    staffTopDY: 3,
    lanternDX: 6,
    lanternDY: 2,
    flame: 1,
    arm: 1,
    trail: 2,
    burst: 1,
  },
  {
    bodyDX: 1,
    bodyDY: 1,
    staffTopDX: 5,
    staffTopDY: 7,
    lanternDX: 4,
    lanternDY: 6,
    flame: 2,
    arm: 1,
    burst: 2,
  },
  {
    bodyDX: 0,
    bodyDY: 0,
    staffTopDX: 1,
    staffTopDY: 1,
    lanternDX: 1,
    lanternDY: 1,
    flame: 0,
    arm: 0,
  },
];

function shadedBody(): Pixmap {
  const p = createPixmap(48, 48);
  // hood point
  fillPolygon(
    p,
    [
      [23, 7],
      [30, 15],
      [32, 24],
      [28, 29],
      [18, 29],
      [14, 24],
      [16, 15],
    ],
    C.moss3,
  );
  // head and torso
  fillEllipse(p, 23, 24, 11, 12, C.moss3);
  // cloak flare with a scalloped hem
  fillPolygon(
    p,
    [
      [12, 27],
      [34, 27],
      [35, 35],
      [32, 38],
      [28, 36],
      [25, 39],
      [23, 36],
      [20, 39],
      [17, 36],
      [13, 38],
      [10, 35],
    ],
    C.moss3,
  );
  // a shoulder/back fold to break the blob
  fillPolygon(
    p,
    [
      [12, 25],
      [17, 29],
      [16, 36],
      [11, 34],
    ],
    C.moss4,
  );

  const height = new Uint8Array(48 * 48);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      if (p.data[y * 48 + x] === 0) continue;
      const dx = (x - 13) / 34;
      const dy = (y - 9) / 34;
      const d = Math.sqrt(dx * dx + dy * dy);
      const rim = y < 16 && x < 30 ? 0.1 : 0;
      height[y * 48 + x] = Math.round(255 * Math.min(1, Math.max(0.08, 1 - d + rim)));
    }
  }
  autoLight(p, height, [C.moss5, C.moss5, C.moss4, C.moss3, C.moss2, C.moss1], { bias: 0.02 });

  // selective outline: dark lower-right, warm-moss upper-left
  const copy = clonePixmap(p);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 48; x++) {
      if (copy.data[y * 48 + x] !== 0) continue;
      const hasNeighbor =
        (x > 0 && copy.data[y * 48 + x - 1] !== 0) ||
        (x < 47 && copy.data[y * 48 + x + 1] !== 0) ||
        (y > 0 && copy.data[(y - 1) * 48 + x] !== 0) ||
        (y < 47 && copy.data[(y + 1) * 48 + x] !== 0);
      if (!hasNeighbor) continue;
      const lowerRight =
        (x > 0 && y < 47 && copy.data[(y + 1) * 48 + x - 1] !== 0) ||
        (x < 47 && y < 47 && copy.data[(y + 1) * 48 + x] !== 0);
      setPx(p, x, y, lowerRight ? C.moss5 : C.moss2);
    }
  }

  // hood opening and face void
  fillEllipse(p, 23, 23, 7, 7, C.ink500);
  fillEllipse(p, 23, 24, 6, 6, C.ink700);
  fillEllipse(p, 23, 26, 5, 3, C.ink600);
  // inner hood rim: a lit crescent above the void, shaded below
  for (let x = 17; x <= 29; x++) {
    const dx = (x - 23) / 6.5;
    if (Math.abs(dx) > 1) continue;
    const y = 24 - Math.round(6 * Math.sqrt(1 - dx * dx));
    setPx(p, x, y - 1, C.moss2);
    setPx(p, x, y, C.moss3);
    setPx(p, x, y + 1, C.moss4);
  }
  vline(p, 16, 20, 27, C.moss3);
  vline(p, 30, 21, 26, C.moss5);
  // wide lantern eyes with dark sockets and warm glints
  const eyes: [number, number][] = [
    [19, 23],
    [25, 23],
  ];
  for (const [ex, ey] of eyes) {
    fillRect(p, ex - 1, ey - 1, 5, 4, C.ink800);
    fillRect(p, ex, ey, 3, 2, C.amber2);
    setPx(p, ex, ey, C.amber0);
    setPx(p, ex + 2, ey, C.amber3);
    setPx(p, ex, ey + 1, C.amber1);
    setPx(p, ex + 1, ey + 1, C.amber2);
    setPx(p, ex + 2, ey + 1, C.amber3);
    setPx(p, ex + 1, ey + 2, C.amber4);
  }
  // cheek freckles / moss texture clusters
  setPx(p, 16, 28, C.moss4);
  setPx(p, 17, 28, C.moss5);
  setPx(p, 29, 27, C.moss4);
  setPx(p, 28, 28, C.moss5);
  speckle(p, 13, 30, 21, 5, C.moss4, 0.08, 77);

  // leather belt with a small gold buckle
  hline(p, 13, 33, 32, C.ink400);
  hline(p, 13, 33, 33, C.ink500);
  hline(p, 15, 31, 32, C.paper5);
  fillRect(p, 21, 31, 5, 4, C.ink500);
  fillRect(p, 22, 32, 3, 2, C.gold1);
  setPx(p, 23, 32, C.ink700);
  // stitched hem
  for (let x = 12; x <= 34; x += 3) setPx(p, x, 36, C.moss4);
  // satchel strap
  line(p, 15, 19, 28, 33, C.ink400);
  line(p, 16, 19, 29, 33, C.ink500);
  setPx(p, 23, 26, C.gold1);

  // sprout and leaves
  line(p, 18, 10, 17, 5, C.teal3);
  fillEllipse(p, 14, 5, 3, 2, C.moss2);
  fillEllipse(p, 13, 4, 2, 1, C.moss1);
  setPx(p, 14, 5, C.moss1);
  line(p, 17, 6, 21, 4, C.teal3);
  fillEllipse(p, 22, 4, 2, 2, C.moss2);
  setPx(p, 22, 3, C.moss1);

  // AO under hood and behind belt
  hline(p, 17, 29, 30, C.moss5);
  return p;
}

function drawFeet(target: Pixmap): void {
  // ground shadow, dithered so it does not read as a solid slab
  for (let y = -3; y <= 3; y++) {
    for (let x = -13; x <= 13; x++) {
      const d = (x * x) / 169 + (y * y) / 9;
      if (d > 1) continue;
      if (hash2(x + 30, y + 30, 51) % 100 < 55) setPx(target, 23 + x, 41 + y, C.ink800);
    }
  }
  // boots: dark soles, lit toes, a clear gap between the legs
  for (const bx of [14, 25]) {
    fillRect(target, bx, 37, 7, 4, C.moss5);
    hline(target, bx + 1, bx + 5, 37, C.moss3);
    fillRect(target, bx, 39, 7, 1, C.moss4);
    hline(target, bx, bx + 6, 40, C.ink600);
    setPx(target, bx + 1, 38, C.moss2);
    setPx(target, bx + 5, 38, C.moss4);
    // contact core: the halo alone floated the Warden, so the sole meets the floor solidly
    hline(target, bx + 1, bx + 5, 41, C.ink900);
    setPx(target, bx, 41, C.ink800);
    setPx(target, bx + 6, 41, C.ink800);
  }
  // ankle cuffs
  hline(target, 15, 19, 36, C.moss3);
  hline(target, 26, 30, 36, C.moss3);
}

function drawArm(target: Pixmap, dx: number, dy: number, swing: number): void {
  // left paw, forward of the cloak
  const x = 10 + dx + (swing > 0 ? 2 : 0);
  const y = 27 + dy;
  fillEllipse(target, x + 2, y + 2, 3, 3, C.moss4);
  setPx(target, x + 1, y, C.moss2);
  setPx(target, x + 2, y + 1, C.moss3);
  setPx(target, x + 4, y + 4, C.moss5);
  setPx(target, x + 5, y + 3, C.moss2);
  // sleeve cuff
  hline(target, x - 1, x + 2, y, C.ink400);
  // right paw gripping the staff: centred on the shaft column, or the Warden appears to
  // hold the pole at a distance
  fillEllipse(target, 37 + dx, 31 + dy, 2, 3, C.moss4);
  setPx(target, 36 + dx, 30 + dy, C.moss3);
  setPx(target, 38 + dx, 32 + dy, C.moss5);
  setPx(target, 37 + dx, 33 + dy, C.moss2);
}

function drawStaff(target: Pixmap, pose: Pose, bodyX: number, bodyY: number): void {
  const topX = 40 + pose.staffTopDX;
  const topY = 10 + pose.staffTopDY;
  const bottomX = 41 + bodyX;
  const bottomY = 40 + bodyY;
  // shaft: one 3px column resampled along the grip-to-hook line, so the staff keeps the same
  // width at every swing angle instead of thickening where two offset lines diverge.
  const run = topX - bottomX;
  const rise = topY - bottomY;
  const steps = Math.max(Math.abs(run), Math.abs(rise));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(bottomX + (run * i) / steps);
    const y = Math.round(bottomY + (rise * i) / steps);
    setPx(target, x - 1, y, C.paper5);
    setPx(target, x, y, C.paper4);
    setPx(target, x + 1, y, C.paper3);
  }
  // grip wraps
  for (let i = 0; i < 3; i++) {
    const y = 28 + bodyY + i * 2;
    setPx(target, 39 + bodyX, y, C.ink500);
    setPx(target, 40 + bodyX, y, C.ink500);
  }
  // hook
  line(target, topX + 1, topY, topX - 2, topY - 2, C.steel1);
  line(target, topX - 2, topY - 2, topX - 4, topY - 1, C.steel2);
  setPx(target, topX - 4, topY, C.steel0);
  // hanging ring: the chain must land on a visible steel loop above the cap
  setPx(target, topX - 5, topY, C.steel2);
  setPx(target, topX - 5, topY + 1, C.ink500);
  // chain
  const lx = 35 + pose.lanternDX;
  const ly = 14 + pose.lanternDY;
  line(target, topX - 4, topY, lx, ly - 2, C.steel2);
  setPx(target, lx - 1, ly - 1, C.steel1);
  setPx(target, lx + 1, ly - 1, C.steel1);
  setPx(target, lx, ly - 2, C.steel0);
  // lantern hangs from the chain
  drawLantern(target, lx, ly, pose.flame);
}

function drawLantern(target: Pixmap, cx: number, topY: number, flame: number): void {
  // cap
  fillRect(target, cx - 4, topY, 9, 1, C.ink400);
  fillRect(target, cx - 3, topY - 1, 7, 1, C.steel2);
  fillRect(target, cx - 2, topY + 1, 5, 1, C.amber5);
  // glass body
  fillRect(target, cx - 4, topY + 2, 9, 9, C.amber5);
  fillRect(target, cx - 3, topY + 2, 7, 9, C.amber4);
  fillRect(target, cx - 2, topY + 3, 5, 7, C.amber3);
  fillRect(target, cx - 1, topY + 4, 3, 5, C.amber2);
  // frame ribs
  hline(target, cx - 4, cx + 4, topY + 2, C.ink400);
  hline(target, cx - 4, cx + 4, topY + 10, C.ink400);
  line(target, cx - 4, topY + 2, cx - 4, topY + 10, C.ink400);
  line(target, cx + 4, topY + 2, cx + 4, topY + 10, C.ink400);
  // base
  fillRect(target, cx - 5, topY + 11, 11, 2, C.ink400);
  hline(target, cx - 4, cx + 4, topY + 11, C.steel2);
  setPx(target, cx - 5, topY + 13, C.ink500);
  setPx(target, cx + 5, topY + 13, C.ink500);
  // flame, animated; positions are relative to the lantern so it swings with it
  const fx = cx + (flame === 2 ? -1 : flame === 1 ? 1 : 0);
  const fy = topY + 6;
  setPx(target, fx - 1, fy + 2, C.amber1);
  setPx(target, fx, fy + 1, C.amber1);
  setPx(target, fx + 1, fy + 2, C.amber1);
  setPx(target, fx, fy + 2, C.amber0);
  setPx(target, fx, fy + 3, C.amber0);
  setPx(target, fx, fy, C.paper0);
  setPx(target, fx, fy - 1, C.amber0);
  // highlight
  setPx(target, cx - 3, topY + 4, C.paper0);
  setPx(target, cx - 3, topY + 5, C.amber0);
  setPx(target, cx - 2, topY + 6, C.amber1);
}

function drawTrail(target: Pixmap, pose: Pose): void {
  if (!pose.trail) return;
  // A readable overhead arc: dense at the grip, thinning toward the lantern.
  const cx = 37;
  const cy = 28;
  const count = pose.trail === 2 ? 30 : 20;
  const start = -1.9;
  const end = pose.trail === 2 ? 0.95 : 0.5;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const a = start + (end - start) * t;
    const r = 12 + t * 6 + (i % 3);
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (x < 1 || x > 46 || y < 2) continue;
    setPx(target, x, y, i % 3 === 0 ? C.amber1 : i % 3 === 1 ? C.amber3 : C.amber5);
    if (i % 2 === 0 && x + 1 <= 46) setPx(target, x + 1, y, C.amber5);
    if (i > count * 0.45 && y + 1 < 46) setPx(target, x, y + 1, C.amber4);
  }
  if (pose.burst && pose.burst > 0) {
    const lx = 35 + pose.lanternDX;
    const ly = 20 + pose.lanternDY;
    const r = pose.burst === 2 ? 10 : 7;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d > r || d < r - 2) continue;
        if ((x + y + 100) % 3 !== 0) continue;
        const tx = lx + x + 2;
        const ty = ly + y;
        if (tx < 0 || tx > 47 || ty < 0 || ty > 47) continue;
        setPx(target, tx, ty, d > r - 1 ? C.amber3 : C.amber1);
      }
    }
    // motion smear behind the swing
    for (let i = 0; i < 4; i++) {
      const x = 43 + (i % 2);
      const y = 26 + i * 2;
      setPx(target, x, y, C.amber5);
      setPx(target, x + 1, y, C.amber4);
    }
  }
}

function drawLanternRim(target: Pixmap): void {
  // The lantern is the key light: warm the right contour so the cloak is not lit
  // from the top-left only. One pixel wide keeps the silhouette crisp.
  for (let y = 16; y <= 37; y++) {
    for (let x = 40; x >= 12; x--) {
      if (!target.data[y * 48 + x]) continue;
      setPx(target, x, y, y % 4 === 0 ? C.amber3 : C.amber4);
      break;
    }
  }
  // a second, dimmer bounce row so the rim does not read as a hard outline
  for (const y of [21, 25, 30, 34]) {
    for (let x = 39; x >= 12; x--) {
      if (!target.data[y * 48 + x]) continue;
      if (x - 1 >= 12 && target.data[y * 48 + x - 1]) setPx(target, x - 1, y, C.amber5);
      break;
    }
  }
}

/**
 * Carve a one-pixel transparent trench around a part before it is composited. The staff and
 * lantern cross the cloak, and without negative space the flat silhouette fuses into one mass.
 */
function punchGap(target: Pixmap, part: Pixmap): void {
  const solid = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < part.w && y < part.h && part.data[y * part.w + x] !== 0;
  for (let y = 0; y < part.h; y++) {
    for (let x = 0; x < part.w; x++) {
      if (part.data[y * part.w + x]) continue;
      if (!solid(x - 1, y) && !solid(x + 1, y) && !solid(x, y - 1) && !solid(x, y + 1)) continue;
      if (target.data[y * target.w + x]) target.data[y * target.w + x] = 0;
    }
  }
}

function compose(pose: Pose, body: Pixmap): Pixmap {
  const out = createPixmap(48, 48);
  drawFeet(out);
  const bodyCopy = createPixmap(48, 48);
  blit(bodyCopy, body, pose.bodyDX, pose.bodyDY);
  if (pose.blink) {
    // close both lantern eyes with hood-shadow lids
    for (const ex of [19, 25]) {
      fillRect(bodyCopy, ex - 1, 22, 5, 4, C.ink700);
      hline(bodyCopy, ex, ex + 2, 23, C.moss4);
      setPx(bodyCopy, ex + 1, 24, C.ink800);
    }
  }
  // The swing trail sits behind the body so the hood, face and staff stay readable.
  drawTrail(out, pose);
  blit(out, bodyCopy, 0, 0);
  drawLanternRim(out);
  const staff = createPixmap(48, 48);
  drawStaff(staff, pose, pose.bodyDX, pose.bodyDY);
  punchGap(out, staff);
  blit(out, staff, 0, 0);
  drawArm(out, pose.bodyDX, pose.bodyDY, pose.arm);
  return out;
}

function buildPortrait(): Pixmap {
  // 64x64 bust portrait for dialogue boxes.
  const base = compose(IDLE_POSES[2]!, shadedBody());
  const portrait = createPixmap(64, 64, C.ink700);
  // vignette background
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if ((x + y) % 4 === 0 && (x < 12 || x > 51 || y < 10 || y > 53))
        setPx(portrait, x, y, C.ink600);
    }
  }
  blit(portrait, base, 8, 10);
  // frame
  for (let x = 0; x < 64; x++) {
    setPx(portrait, x, 0, C.steel2);
    setPx(portrait, x, 63, C.ink900);
  }
  for (let y = 0; y < 64; y++) {
    setPx(portrait, 0, y, C.steel2);
    setPx(portrait, 63, y, C.ink900);
  }
  return portrait;
}

export function buildWarden(): WardenFrames {
  const body = shadedBody();
  return {
    idle: IDLE_POSES.map((pose) => compose(pose, body)),
    attack: ATTACK_POSES.map((pose) => compose(pose, body)),
    portrait: buildPortrait(),
  };
}
