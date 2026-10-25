/**
 * The Realm diorama: a lazily loaded Canvas view of the floating island, drawn from code.
 *
 * It shows what the player has actually paid for. A plot with no building on it is a lantern post and
 * a claim stake, not a translucent ghost of the treasury, and the level-2 storey only appears once the
 * upgrade has been paid for. The scene owns no game state: the screen passes levels in, and the only
 * thing it decides for itself is where the companion walks.
 *
 * Frames compose at art resolution (320x180) and scale by a whole number at draw time, so the parallax
 * and the lantern flicker never land between pixels.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { buildingById } from '../../core/delve/buildings';
import { buildWarden } from '../../art/companion';
import { C } from '../../art/palette';
import { blit, setPx, type Pixmap } from '../../art/px';
import {
  composeRealm,
  plotBox,
  REALM_BUILDINGS,
  sparkle,
  type RealmBuilding,
  type RealmPeriod,
} from '../../art/scenes/realm';
import { SCENE_H, SCENE_W } from '../../art/scenes/rootfall';
import { pixelGrid, pixmapToImageData } from '../lib/canvas';

export interface RealmDioramaProps {
  levels: Record<string, number>;
  period: RealmPeriod;
  /** The companion stands on the island only once one has been adopted. */
  companion?: boolean;
  /** The selected building: the companion walks there and the plot gets a bracket. */
  focus?: RealmBuilding | null;
  /** A plot that was just built on, which gets one sparkle pass. */
  celebrate?: RealmBuilding | null;
  reducedMotion?: boolean;
  /** Art pixels per CSS pixel. */
  scale?: number;
  parallax?: boolean;
  alt: string;
  className?: string;
  style?: CSSProperties;
  onSelect?: (id: RealmBuilding) => void;
}

const TICK_MS = 100;
const WALK_SPEED = 3;
const SPARKLE_TICKS = 20;
/** Where the companion stands with nothing selected, in art pixels from the left. */
const HOME_X = 136;

interface Runtime {
  frame: number;
  look: number;
  companionX: number;
  sparkleT: number;
}

function freshRuntime(): Runtime {
  return { frame: 0, look: 0, companionX: HOME_X, sparkleT: 0 };
}

function standX(id: RealmBuilding | null | undefined): number {
  if (!id) return HOME_X;
  const box = plotBox(id);
  return Math.max(44, Math.min(244, box.x + (box.w >> 1) - 24));
}

let wardenIdle: readonly Pixmap[] | undefined;
function companionFrames() {
  if (!wardenIdle) wardenIdle = buildWarden().idle;
  return wardenIdle;
}

/**
 * Corner brackets rather than a box: a one-pixel outline over a busy scene reads as a rendering
 * artefact, and a filled box hides the building it is supposed to be pointing at.
 */
function bracketPlot(stage: Pixmap, id: RealmBuilding, frame: number): void {
  const box = plotBox(id);
  const color = (frame & 8) === 0 ? C.gold1 : C.gold2;
  const arm = 5;
  const corners: [number, number, number, number][] = [
    [box.x, box.y, 1, 1],
    [box.x + box.w - 1, box.y, -1, 1],
    [box.x, box.y + box.h - 1, 1, -1],
    [box.x + box.w - 1, box.y + box.h - 1, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    for (let i = 0; i < arm; i++) {
      setPx(stage, cx + dx * i, cy + dy * i, color);
      setPx(stage, cx + dx * i, cy + dy * i + dy, color);
    }
  }
}

export function RealmDiorama({
  levels,
  period,
  companion = false,
  focus = null,
  celebrate = null,
  reducedMotion = false,
  scale = 1,
  parallax = true,
  alt,
  className,
  style,
  onSelect,
}: RealmDioramaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rtRef = useRef<Runtime>(freshRuntime());
  const stateRef = useRef({ levels, period, companion, focus, celebrate });
  stateRef.current = { levels, period, companion, focus, celebrate };
  const redrawRef = useRef<(() => void) | null>(null);
  const plotKey = REALM_BUILDINGS.map(
    (id) => `${id}${Math.max(0, Math.min(2, levels[id] ?? 0))}`,
  ).join('');

  useEffect(() => {
    rtRef.current.sparkleT = celebrate ? 1 : 0;
  }, [celebrate]);

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

    const draw = () => {
      const rt = rtRef.current;
      const s = stateRef.current;
      const islandX = Math.round(Math.max(-1, Math.min(1, rt.look)) * -4);
      const stage = composeRealm(
        rt.frame,
        rt.look,
        s.period,
        s.levels,
        s.companion
          ? { companion: companionFrames()[rt.frame % 6]!, companionX: rt.companionX }
          : {},
      );
      if (s.focus) bracketPlot(stage, s.focus, rt.frame);
      if (rt.sparkleT > 0 && s.celebrate) {
        const sprite = sparkle(rt.sparkleT >> 2);
        const box = plotBox(s.celebrate);
        blit(stage, sprite, box.x + (box.w >> 1) - 8 + islandX, box.y + 16);
      }
      bufferCtx.putImageData(pixmapToImageData(stage), 0, 0);
      liveCtx.clearRect(0, 0, canvas.width, canvas.height);
      liveCtx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    };

    if (reducedMotion) {
      rtRef.current.companionX = standX(stateRef.current.focus);
      redrawRef.current = draw;
      draw();
      return () => {
        redrawRef.current = null;
      };
    }

    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let stopped = false;

    const tick = (now: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const delta = Math.min(400, now - last);
      last = now;
      if (document.hidden) return;
      carry += delta;
      let steps = 0;
      while (carry >= TICK_MS && steps < 4) {
        carry -= TICK_MS;
        steps++;
        const rt = rtRef.current;
        rt.frame++;
        const target = standX(stateRef.current.focus);
        if (rt.companionX < target) rt.companionX = Math.min(target, rt.companionX + WALK_SPEED);
        else if (rt.companionX > target)
          rt.companionX = Math.max(target, rt.companionX - WALK_SPEED);
        if (rt.sparkleT > 0) rt.sparkleT = rt.sparkleT < SPARKLE_TICKS ? rt.sparkleT + 1 : 0;
      }
      if (steps > 0) draw();
    };

    draw();
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [scale, reducedMotion, parallax]);

  // Under reduced motion nothing animates itself, so every state change has to ask for a repaint.
  useEffect(() => {
    if (reducedMotion) redrawRef.current?.();
  }, [reducedMotion, plotKey, period, focus, companion, celebrate]);

  const grid = pixelGrid(SCENE_W, scale);
  const perArt = grid.css / SCENE_W;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: grid.css,
        height: pixelGrid(SCENE_H, scale).css,
        lineHeight: 0,
        ...style,
      }}
    >
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
      {onSelect
        ? REALM_BUILDINGS.map((id) => {
            const box = plotBox(id);
            const built = Math.max(0, Math.min(2, levels[id] ?? 0));
            return (
              <button
                key={id}
                type="button"
                className="pr-realm-plot"
                aria-label={`${buildingById(id)?.name ?? id}${built > 0 ? ` level ${built}` : ': not built yet'}`}
                onClick={() => onSelect(id)}
                style={{
                  position: 'absolute',
                  left: box.x * perArt,
                  top: box.y * perArt,
                  width: box.w * perArt,
                  height: box.h * perArt,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              />
            );
          })
        : null}
    </div>
  );
}

export default RealmDiorama;
