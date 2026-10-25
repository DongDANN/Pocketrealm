/**
 * One-shot combat effects, authored as code like everything else in `src/art`.
 *
 * Two kinds of thing live here. An `Effect` is a short pre-drawn strip — a slash, an impact, a
 * shockwave — played once over a sprite. A `Particle` is a single moving pixel with a velocity, which
 * is how debris fills the space between the two actors without hand-drawing every frame.
 *
 * Both are pure and deterministic: the same seed throws the same debris, so a replayed run animates
 * identically. Everything is palette indices on the 64-colour master palette.
 */
import { C } from './palette';
import { blit, createPixmap, fillEllipse, hline, px, setPx, type Pixmap } from './px';

export interface Effect {
  readonly id: string;
  readonly size: number;
  readonly frames: readonly Pixmap[];
  /** Frames per second at normal speed. Reduced motion plays the first frame only. */
  readonly fps: number;
}

const cache = new Map<string, Effect>();

function strip(
  id: string,
  size: number,
  fps: number,
  count: number,
  draw: (p: Pixmap, i: number) => void,
): Effect {
  const hit = cache.get(id);
  if (hit) return hit;
  const frames: Pixmap[] = [];
  for (let i = 0; i < count; i++) {
    const p = createPixmap(size, size);
    draw(p, i);
    frames.push(p);
  }
  const effect: Effect = { id, size, frames, fps };
  cache.set(id, effect);
  return effect;
}

/**
 * A downward arc that sweeps and thins. Drawn as a band rather than a one-pixel curve, because a hair
 * line is the one thing the style lock forbids and it vanishes at 1x anyway.
 */
export function slash(color: number, hot: number = C.paper0): Effect {
  return strip(`slash:${color}:${hot}`, 32, 24, 4, (p, i) => {
    const sweep = i / 3;
    const from = -1.9 + sweep * 1.1;
    const to = 0.5 + sweep * 1.5;
    const width = 4 - Math.round(i * 0.7);
    for (let s = 0; s <= 26; s++) {
      const a = from + (to - from) * (s / 26);
      const cx = 16 + Math.round(Math.cos(a) * 13);
      const cy = 16 + Math.round(Math.sin(a) * 13);
      for (let w = 0; w < width; w++) setPx(p, cx, cy + w, w === 0 ? hot : color);
    }
    // the tip burns out ahead of the tail, so the strip reads as motion and not as a static ring
    for (let d = 0; d < i * 4; d++) {
      setPx(p, 16 + Math.round(Math.cos(to) * 13) - d, 16 + Math.round(Math.sin(to) * 13) + d, 0);
    }
  });
}

/** Radial burst for a hit landing: a core, eight spokes, and a ring that arrives two frames later. */
export function impact(color: number, hot: number = C.paper0): Effect {
  return strip(`impact:${color}:${hot}`, 32, 26, 5, (p, i) => {
    const t = i / 4;
    const r = Math.round(2 + t * 11);
    fillEllipse(p, 16, 16, Math.max(1, 6 - i), Math.max(1, 6 - i), i < 3 ? hot : color);
    for (let s = 0; s < 8; s++) {
      const a = (Math.PI / 4) * s + 0.3;
      const len = Math.max(1, Math.round(4 + t * 7));
      const x0 = 16 + Math.round(Math.cos(a) * r);
      const y0 = 16 + Math.round(Math.sin(a) * r);
      for (let d = 0; d < len; d++) {
        setPx(
          p,
          x0 + Math.round(Math.cos(a) * d),
          y0 + Math.round(Math.sin(a) * d),
          d < 2 ? hot : color,
        );
        setPx(p, x0 + Math.round(Math.cos(a) * d), y0 + 1 + Math.round(Math.sin(a) * d), color);
      }
    }
    if (i < 2) return;
    const ring = 6 + (i - 2) * 4;
    for (let s = 0; s < 24; s++) {
      const a = (Math.PI * 2 * s) / 24;
      setPx(
        p,
        16 + Math.round(Math.cos(a) * ring),
        16 + Math.round(Math.sin(a) * (ring - 2)),
        color,
      );
    }
  });
}

/** A flat wave along the ground for heavy hits and boss slams. */
export function shockwave(color: number): Effect {
  return strip(`wave:${color}`, 32, 20, 4, (p, i) => {
    const half = 3 + i * 3;
    const y = 16 + (i % 2);
    // It widens while it thins: the tips dither away, the second row only belongs to the young wave,
    // and the crest highlight is gone by the last frame — otherwise the ring pops off at full size.
    for (let x = 16 - half; x <= 16 + half; x++) {
      if (Math.abs(x - 16) > half - 3 && (x + y) % 2 !== 0) continue;
      setPx(p, x, y, color);
    }
    if (i < 2) hline(p, 16 - half + 2, 16 + half - 2, y + 1, color);
    if (i === 2) hline(p, 16 - half + 4, 16 + half - 4, y - 1, C.paper2);
  });
}

/** Motes rising off a healed or buffed actor. */
export function ascend(color: number): Effect {
  return strip(`ascend:${color}`, 32, 12, 5, (p, i) => {
    for (let s = 0; s < 6; s++) {
      const x = 6 + s * 4 + ((s * 7) % 3);
      const y = 26 - ((i * 5 + s * 4) % 22);
      setPx(p, x, y, color);
      setPx(p, x, y + 1, color);
      if (y > 10) setPx(p, x, y + 2, C.paper2);
    }
  });
}

/** Dust kicked up when an actor lunges. */
export function puff(color: number): Effect {
  return strip(`puff:${color}`, 32, 18, 4, (p, i) => {
    for (let s = 0; s < 5 - i; s++) {
      const x = 4 + s * 5 + i;
      const y = 22 - Math.abs(((s * 3 + i * 2) % 5) - 2);
      fillEllipse(p, x, y, 3 - Math.min(2, i), 2 - Math.min(1, i), color);
    }
  });
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  color: number;
  /** 1 or 2 pixels tall. */
  size: number;
  gravity: number;
}

export interface BurstOptions {
  gravity?: number;
  ttl?: number;
  /** Every fifth particle catches the light, which is what makes a burst sparkle instead of smoke. */
  hot?: number;
}

/**
 * A burst aimed along the ground toward `dir`. Velocities come from an integer hash of the seed, not
 * `Math.random`, so the same event always throws the same debris.
 */
export function burst(
  x: number,
  y: number,
  color: number,
  count: number,
  dir = 1,
  seed = 1,
  opts: BurstOptions = {},
): Particle[] {
  const gravity = opts.gravity ?? 0.22;
  const ttl = opts.ttl ?? 26;
  const hot = opts.hot ?? C.paper0;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const h = (((seed * 2654435761 + i * 40503) >>> 0) % 65536) | 0;
    out.push({
      x,
      y,
      vx: dir * (0.4 + (h % 100) / 62),
      vy: -(((h >> 7) % 100) / 34) - 0.4,
      life: 0,
      ttl: Math.round(ttl * (0.7 + ((h >> 3) % 60) / 100)),
      color: h % 5 === 0 ? hot : color,
      size: h % 4 === 0 ? 2 : 1,
      gravity,
    });
  }
  return out;
}

/** Advances one particle by a frame. Returns false once it has died or left the frame. */
export function stepParticle(p: Particle, bounds: { w: number; h: number }): boolean {
  p.vy += p.gravity;
  p.x += p.vx;
  p.y += p.vy;
  p.life++;
  if (p.life >= p.ttl) return false;
  if (p.x < -2 || p.y < -2 || p.x > bounds.w + 2 || p.y > bounds.h + 2) return false;
  return true;
}

/**
 * Draws a particle plus a one-pixel trail behind it. The trail is the difference between a dot and
 * something that was moving, and it costs one pixel.
 */
export function drawParticle(target: Pixmap, p: Particle): void {
  if (p.life > p.ttl * 0.6 && (p.life & 1) === 0) return;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  setPx(target, x, y, p.color);
  if (p.size > 1) setPx(target, x, y + 1, p.color);
  setPx(target, x - Math.sign(p.vx || 1), y, p.color);
}

/** Blits an effect frame anchored at its centre, so callers never redo the half-size arithmetic. */
export function drawEffect(
  target: Pixmap,
  effect: Effect,
  frame: number,
  cx: number,
  cy: number,
): void {
  const n = effect.frames.length;
  const f = effect.frames[((Math.round(frame) % n) + n) % n]!;
  blit(target, f, Math.round(cx - effect.size / 2), Math.round(cy - effect.size / 2));
}

/** Opaque pixel count for one frame. The validator uses it to prove a strip is not empty. */
export function coverage(effect: Effect, frame: number): number {
  const f = effect.frames[frame]!;
  let n = 0;
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (px(f, x, y)) n++;
  return n;
}
