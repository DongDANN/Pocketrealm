/**
 * The Delve battle scene: a lazily loaded Canvas renderer over the code-drawn Hollow stage.
 *
 * Everything here is presentation of a decision the engine already made. The screen passes in the
 * encounter and one `SceneAction` per resolved step; the scene plays that beat and nothing else. It
 * owns no game state and reads no storage, and if Canvas is unavailable the caller keeps the text log,
 * which says the same thing in words.
 *
 * The frame is composed at art resolution (320x180) into a pixmap and scaled by a whole number at draw
 * time, so parallax, shake and light all stay on the pixel grid.
 */
import { useEffect, useRef } from 'react';
import { buildWarden } from '../../art/companion';
import { critterRecipe, enemyFrames } from '../../art/critters';
import {
  ascend,
  burst,
  drawEffect,
  drawParticle,
  impact,
  puff,
  shockwave,
  slash,
  stepParticle,
  type Effect,
  type Particle,
} from '../../art/effects';
import { C } from '../../art/palette';
import { clonePixmap, scalePixmap, type Pixmap } from '../../art/px';
import { composeStage, GROUND_Y, type HollowId } from '../../art/scenes/hollow';
import { SCENE_H, SCENE_W } from '../../art/scenes/rootfall';
import { pixelGrid, pixmapToImageData } from '../lib/canvas';
import type { SceneAction } from '../lib/delveScene';

export interface BattleSceneProps {
  hollow: HollowId;
  enemyId: string | null;
  /** Elites and bosses reuse the 32x32 family at 2x rather than a second authored sprite. */
  big?: boolean;
  action?: SceneAction | null;
  reducedMotion?: boolean;
  /** Art pixels per CSS pixel. */
  scale?: number;
  /** Pointer parallax, off under reduced motion. */
  parallax?: boolean;
  alt: string;
  className?: string;
}

const TICK_MS = 1000 / 12;
const COMPANION_X = 66;
const ENEMY_X = 204;
const COMPANION_H = 48;

type Pose = 'idle' | 'attack' | 'hurt' | 'faint';

interface Actor {
  pose: Pose;
  dx: number;
  dy: number;
  flash: number;
  /** 0..1: how far the death dissolve has got. */
  gone: number;
}

interface Strip {
  effect: Effect;
  x: number;
  y: number;
  t: number;
}

interface Runtime {
  frame: number;
  flicker: number;
  look: number;
  action: { kind: SceneAction['kind']; heavy: boolean; t: number } | null;
  companion: Actor;
  enemy: Actor;
  strips: Strip[];
  particles: Particle[];
  shake: number;
  stop: number;
}

const actor = (): Actor => ({ pose: 'idle', dx: 0, dy: 0, flash: 0, gone: 0 });

function freshRuntime(): Runtime {
  return {
    frame: 0,
    flicker: 0,
    look: 0,
    action: null,
    companion: actor(),
    enemy: actor(),
    strips: [],
    particles: [],
    shake: 0,
    stop: 0,
  };
}

interface Encounter {
  hollow: HollowId;
  enemyId: string | null;
  big: boolean;
}

/** The enemy's own two colours: what it glows with, and what its edges are cut from. */
function tones(enemyId: string | null): [number, number] {
  const recipe = enemyId ? critterRecipe(enemyId) : undefined;
  return [recipe?.palette.glow ?? C.amber2, recipe?.palette.edge ?? C.amber4];
}

function spriteSize(big: boolean): { w: number; h: number } {
  return { w: 32 * (big ? 2 : 1), h: 32 * (big ? 2 : 1) };
}

/** Every opaque pixel becomes one colour. Two frames of this is the whole hit flash. */
function silhouetteIn(src: Pixmap, color: number): Pixmap {
  const out = clonePixmap(src);
  for (let i = 0; i < out.data.length; i++) if (out.data[i]) out.data[i] = color;
  return out;
}

/** Thinning for a death: hash-light, not a fade, so the silhouette keeps its colour until it stops. */
function thinning(src: Pixmap, gone: number, frame: number): Pixmap {
  const out = clonePixmap(src);
  const step = Math.max(2, Math.round(9 * (1 - gone)));
  for (let i = 0; i < out.data.length; i++) if ((i + frame * 7) % step === 0) out.data[i] = 0;
  return out;
}

let wardenFrames: { idle: readonly Pixmap[]; attack: readonly Pixmap[] } | undefined;
function companionFrames() {
  if (!wardenFrames) {
    const w = buildWarden();
    wardenFrames = { idle: w.idle, attack: w.attack };
  }
  return wardenFrames;
}

function pick(frames: readonly Pixmap[], frame: number): Pixmap {
  return frames[Math.abs(frame) % frames.length] ?? frames[0]!;
}

function enemyPoseFrames(enemyId: string | null, pose: Pose) {
  const frames = enemyId ? enemyFrames(enemyId) : null;
  if (!frames) return null;
  return pose === 'attack'
    ? frames.attack
    : pose === 'hurt'
      ? frames.hurt
      : pose === 'faint'
        ? frames.faint
        : frames.idle;
}

/**
 * Advances the scripted beat by one frame. Each case is a timeline in art frames, and the numbers are
 * picked so a hit lands on the frame the matching sound cue fires — that alignment is the only reason
 * the two read as one event.
 */
function advance(rt: Runtime, encounter: Encounter): void {
  const action = rt.action;
  if (!action) return;
  const t = action.t++;
  const c = rt.companion;
  const e = rt.enemy;
  const size = spriteSize(encounter.big);
  const [hot, cool] = tones(encounter.enemyId);
  const cx = COMPANION_X + 24 + c.dx;
  const cy = GROUND_Y - COMPANION_H / 2 + c.dy;
  const ex = ENEMY_X + e.dx + size.w / 2;
  const ey = GROUND_Y - size.h / 2;
  const reach = ex - cx - 26;

  const done = (frames: number) => {
    if (t < frames) return false;
    c.pose = 'idle';
    c.dx = 0;
    c.dy = 0;
    e.pose = 'idle';
    e.dx = 0;
    rt.action = null;
    return true;
  };

  switch (action.kind) {
    case 'playerAttack': {
      if (t === 2) rt.strips.push({ effect: puff(C.ink500), x: cx - 10, y: GROUND_Y - 8, t: 0 });
      if (t < 3) c.dx = -t;
      else if (t < 6) {
        c.pose = 'attack';
        c.dx = Math.round(((t - 3) / 2) * reach);
      } else c.dx = Math.round(reach * Math.max(0, 1 - (t - 6) / 7));
      if (t === 5) {
        rt.strips.push({ effect: slash(hot), x: ex - 8, y: ey, t: 0 });
        rt.particles.push(
          ...burst(ex, ey, cool, action.heavy ? 12 : 7, -1, rt.frame, { gravity: 0.16 }),
        );
        e.pose = 'hurt';
        e.flash = 2;
        e.dx = 4;
        rt.shake = action.heavy ? 5 : 3;
        rt.stop = action.heavy ? 3 : 1;
      }
      if (t === 6) rt.strips.push({ effect: impact(hot), x: ex, y: ey, t: 0 });
      done(14);
      break;
    }
    case 'enemyAttack': {
      if (t < 3) e.dx = t;
      else if (t < 6) {
        e.pose = 'attack';
        e.dx = Math.round(((t - 3) / 2) * 16);
      } else e.dx = Math.round(16 * Math.max(0, 1 - (t - 6) / 7));
      if (t === 5) {
        rt.strips.push({ effect: slash(hot, C.paper0), x: cx + 6, y: cy, t: 0 });
        rt.particles.push(
          ...burst(cx + 8, cy, cool, action.heavy ? 12 : 7, 1, rt.frame, { gravity: 0.16 }),
        );
        c.pose = 'hurt';
        c.flash = 2;
        c.dx = -5;
        rt.shake = action.heavy ? 5 : 3;
        rt.stop = action.heavy ? 3 : 1;
      }
      if (t === 6) rt.strips.push({ effect: impact(hot), x: cx + 8, y: cy, t: 0 });
      done(14);
      break;
    }
    case 'playerHurt': {
      if (t === 0) {
        c.pose = 'hurt';
        c.flash = 3;
        c.dx = -6;
        rt.shake = action.heavy ? 6 : 3;
        rt.stop = action.heavy ? 3 : 1;
        rt.strips.push({ effect: impact(C.rose2, C.paper0), x: cx + 4, y: cy, t: 0 });
        rt.particles.push(...burst(cx + 4, cy, C.rose3, action.heavy ? 14 : 8, -1, rt.frame));
      }
      c.dx = -6 + Math.round((t / 9) * 6);
      done(10);
      break;
    }
    case 'enemyHurt': {
      if (t === 0) {
        e.pose = 'hurt';
        e.flash = 2;
        e.dx = 4;
        rt.strips.push({ effect: impact(hot), x: ex, y: ey, t: 0 });
        rt.particles.push(...burst(ex, ey, cool, 8, -1, rt.frame, { gravity: 0.18 }));
      }
      e.dx = 4 - Math.round((t / 8) * 4);
      done(9);
      break;
    }
    case 'enemyFaint': {
      if (t === 0) {
        e.pose = 'faint';
        rt.shake = 6;
        rt.strips.push({ effect: shockwave(cool), x: ex, y: GROUND_Y - 6, t: 0 });
        rt.particles.push(...burst(ex, ey, cool, 16, 1, rt.frame, { gravity: 0.1, ttl: 34 }));
      }
      if (t > 6) e.gone = Math.min(1, (t - 6) / 8);
      done(16);
      break;
    }
    case 'playerFaint': {
      if (t === 0) {
        c.pose = 'faint';
        rt.shake = 6;
        rt.strips.push({ effect: shockwave(C.rose3), x: cx, y: GROUND_Y - 6, t: 0 });
      }
      c.dy = Math.round((t / 12) * 10);
      if (t > 4) c.gone = Math.min(1, (t - 4) / 10);
      break;
    }
    case 'heal': {
      if (t === 0) {
        rt.strips.push({ effect: ascend(C.moss2), x: cx, y: cy + 6, t: 0 });
        rt.particles.push(
          ...burst(cx, cy + 10, C.moss2, 8, 1, rt.frame, { gravity: -0.06, ttl: 30, hot: C.moss0 }),
        );
      }
      done(12);
      break;
    }
    case 'loot': {
      if (t === 0) {
        rt.strips.push({ effect: ascend(C.gold0), x: cx, y: cy + 6, t: 0 });
        rt.particles.push(
          ...burst(cx, cy, C.gold1, 10, 1, rt.frame, { gravity: -0.04, ttl: 34, hot: C.paper0 }),
        );
      }
      done(12);
      break;
    }
  }
}

/** One composed 320x180 frame of the scene, actors and effects included. */
function compose(rt: Runtime, encounter: Encounter): Pixmap {
  const set = companionFrames();
  const idleEnemy = enemyPoseFrames(encounter.enemyId, 'idle');
  const enemyFramesFor = enemyPoseFrames(encounter.enemyId, rt.enemy.pose);

  let companion =
    rt.companion.pose === 'attack' ? pick(set.attack, rt.frame) : pick(set.idle, rt.frame);
  if (rt.companion.flash > 0) companion = silhouetteIn(companion, C.paper0);
  if (rt.companion.gone > 0) companion = thinning(companion, rt.companion.gone, rt.frame);

  let enemy: Pixmap | undefined;
  if (idleEnemy && enemyFramesFor) {
    let raw: Pixmap = pick(enemyFramesFor, rt.frame);
    if (rt.enemy.flash > 0) raw = silhouetteIn(raw, C.paper0);
    if (rt.enemy.gone > 0) raw = thinning(raw, rt.enemy.gone, rt.frame);
    enemy = encounter.big ? scalePixmap(raw, 2) : raw;
  }

  const stage = composeStage(
    encounter.hollow,
    rt.frame,
    rt.look,
    {
      companion,
      enemy,
      companionX: COMPANION_X + rt.companion.dx,
      enemyX: ENEMY_X + rt.enemy.dx,
    },
    rt.flicker,
  );
  for (const strip of rt.strips) drawEffect(stage, strip.effect, strip.t, strip.x, strip.y);
  for (const particle of rt.particles) drawParticle(stage, particle);
  return stage;
}

export function BattleScene({
  hollow,
  enemyId,
  big = false,
  action = null,
  reducedMotion = false,
  scale = 1,
  parallax = true,
  alt,
  className,
}: BattleSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rtRef = useRef<Runtime>(freshRuntime());
  const encounter: Encounter = { hollow, enemyId, big };
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  const token = action?.token ?? null;

  // A new encounter is a new room: forget the beat that was playing.
  useEffect(() => {
    rtRef.current = freshRuntime();
  }, [hollow, enemyId, big]);

  useEffect(() => {
    if (!action) return;
    const rt = rtRef.current;
    rt.action = { kind: action.kind, heavy: action.heavy, t: 0 };
    // Reduced motion still gets the outcome: run the beat to its last frame and drop the motion.
    if (reducedMotion) {
      for (let i = 0; i < 24 && rt.action; i++) advance(rt, { hollow, enemyId, big });
      rt.strips = [];
      rt.particles = [];
      rt.shake = 0;
      rt.stop = 0;
    }
  }, [action, token, reducedMotion, hollow, enemyId, big]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const liveCtx = canvas.getContext('2d');
    if (!liveCtx) return;
    const width = pixelGrid(SCENE_W, scale);
    const height = pixelGrid(SCENE_H, scale);
    canvas.width = width.backing;
    canvas.height = height.backing;
    canvas.style.width = `${width.css}px`;
    canvas.style.height = `${height.css}px`;
    liveCtx.imageSmoothingEnabled = false;
    const buffer = document.createElement('canvas');
    buffer.width = SCENE_W;
    buffer.height = SCENE_H;
    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;
    const unit = Math.max(1, Math.round(width.backing / SCENE_W));

    const draw = (stage: Pixmap, shake: number) => {
      bufferCtx.putImageData(pixmapToImageData(stage), 0, 0);
      const sx = shake > 0 ? Math.round((Math.sin(rtRef.current.frame * 2.3) * shake) / 2) : 0;
      const sy = shake > 0 ? Math.round((Math.cos(rtRef.current.frame * 3.1) * shake) / 3) : 0;
      liveCtx.clearRect(0, 0, canvas.width, canvas.height);
      liveCtx.drawImage(buffer, sx * unit, sy * unit, canvas.width, canvas.height);
    };

    if (reducedMotion) {
      const src = rtRef.current;
      const rt: Runtime = {
        ...freshRuntime(),
        companion: { ...src.companion },
        enemy: { ...src.enemy },
      };
      draw(compose(rt, encounterRef.current), 0);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const delta = Math.min(200, now - last);
      last = now;
      if (document.hidden) return;
      carry += delta;
      let steps = 0;
      while (carry >= TICK_MS && steps < 4) {
        carry -= TICK_MS;
        steps++;
        const rt = rtRef.current;
        if (rt.stop > 0) {
          rt.stop--;
          continue;
        }
        rt.frame++;
        rt.flicker = rt.frame % 3;
        advance(rt, encounterRef.current);
        rt.strips = rt.strips.filter((strip) => {
          strip.t++;
          return strip.t < strip.effect.frames.length * 2;
        });
        rt.particles = rt.particles.filter((p) => stepParticle(p, { w: SCENE_W, h: SCENE_H }));
        if (rt.companion.flash > 0) rt.companion.flash--;
        if (rt.enemy.flash > 0) rt.enemy.flash--;
        if (rt.shake > 0) rt.shake--;
        if (!rt.action && rt.companion.pose !== 'idle' && rt.companion.gone === 0)
          rt.companion.pose = 'idle';
        if (!rt.action && rt.enemy.pose !== 'idle' && rt.enemy.gone === 0) rt.enemy.pose = 'idle';
      }
      if (steps > 0) {
        const rt = rtRef.current;
        draw(compose(rt, encounterRef.current), rt.shake);
      }
    };

    draw(compose(rtRef.current, encounterRef.current), 0);
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [scale, reducedMotion, hollow, enemyId, big, token]);

  return (
    <div className={className} style={{ lineHeight: 0 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        data-art-width={SCENE_W}
        onPointerMove={(event) => {
          if (!parallax || reducedMotion) return;
          const rect = event.currentTarget.getBoundingClientRect();
          rtRef.current.look = Math.max(
            -1,
            Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
          );
        }}
        onPointerLeave={() => {
          rtRef.current.look = 0;
        }}
      />
    </div>
  );
}

export default BattleScene;
