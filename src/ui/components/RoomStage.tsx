import { useEffect, useRef } from 'react';
import { composeRoomPreview, ROOM_LOOP_FRAMES, SCENE_H, SCENE_W } from '../../art/scenes/rootfall';
import { pixelGrid, pixmapToImageData } from '../lib/canvas';

interface Props {
  scale?: number;
  frameMs?: number;
  playing?: boolean;
  parallax?: boolean;
  alt: string;
  className?: string;
}

/**
 * Integer-scaled low-res room renderer. Layers are re-composed with a small per-layer
 * camera offset, so parallax stays inside the 320x180 art instead of blurring CSS transforms.
 */
export function RoomStage({
  scale = 1,
  frameMs = 100,
  playing = true,
  parallax = true,
  alt,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lookRef = useRef(0);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const parallaxRef = useRef(parallax);
  parallaxRef.current = parallax;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const integerScale = Math.max(1, Math.round(scale));
    const width = pixelGrid(SCENE_W, integerScale);
    const height = pixelGrid(SCENE_H, integerScale);
    canvas.width = width.backing;
    canvas.height = height.backing;
    canvas.style.width = `${width.css}px`;
    canvas.style.height = `${height.css}px`;
    const liveCtx = canvas.getContext('2d');
    if (!liveCtx) return;
    liveCtx.imageSmoothingEnabled = false;
    const buffer = document.createElement('canvas');
    buffer.width = SCENE_W;
    buffer.height = SCENE_H;
    const bufferCtx = buffer.getContext('2d');
    if (!bufferCtx) return;

    let frame = 0;
    let last = performance.now();
    let lastRender = 0;
    let carry = 0;
    let renderedFrame = -1;
    let renderedLook = Number.NaN;
    let raf = 0;
    let stopped = false;

    const paint = () => {
      const pixmap = composeRoomPreview(frame, parallaxRef.current ? lookRef.current : 0);
      bufferCtx.putImageData(pixmapToImageData(pixmap), 0, 0);
      liveCtx.clearRect(0, 0, canvas.width, canvas.height);
      liveCtx.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    };

    paint();
    renderedFrame = frame;
    renderedLook = 0;
    lastRender = performance.now();

    const tick = (now: number) => {
      if (stopped) return;
      const delta = Math.min(200, now - last);
      last = now;
      if (playingRef.current) {
        carry += delta;
        while (carry >= frameMs) {
          carry -= frameMs;
          frame = (frame + 1) % ROOM_LOOP_FRAMES;
        }
      } else {
        carry = 0;
      }
      const look = parallaxRef.current ? Math.round(lookRef.current * 8) / 8 : 0;
      if (now - lastRender >= 80 && (frame !== renderedFrame || look !== renderedLook)) {
        paint();
        renderedFrame = frame;
        renderedLook = look;
        lastRender = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [scale, frameMs]);

  return (
    <div className={['room-stage', className].filter(Boolean).join(' ')}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        data-art-width={SCENE_W}
        onPointerMove={(event) => {
          if (!parallax) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          lookRef.current = Math.max(-1, Math.min(1, nx));
        }}
        onPointerLeave={() => {
          lookRef.current = 0;
        }}
      />
    </div>
  );
}
