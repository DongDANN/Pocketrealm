import { useCallback, useEffect, useRef } from 'react';
import type { Pixmap } from '../../art/px';
import { pixelGrid, pixmapToCanvas } from '../lib/canvas';

interface Props {
  frames: readonly Pixmap[];
  frameMs?: number;
  scale?: number;
  alt: string;
  playing?: boolean;
  step?: number;
  onFrame?: (frame: number) => void;
  className?: string;
}

export function AnimatedPixmap({
  frames,
  frameMs = 120,
  scale = 1,
  alt,
  playing = true,
  step = 0,
  onFrame,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const cacheRef = useRef<HTMLCanvasElement[]>([]);
  const indexRef = useRef(0);
  const stepRef = useRef(step);

  const paint = useCallback((index: number) => {
    const canvas = canvasRef.current;
    const off = cacheRef.current[index];
    if (!canvas || !off) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (frames.length === 0) return;
    cacheRef.current = frames.map(pixmapToCanvas);
    indexRef.current = 0;
    const canvas = canvasRef.current;
    const first = frames[0];
    if (!canvas || !first) return;
    const integerScale = Math.max(1, Math.round(scale));
    const width = pixelGrid(first.w, integerScale);
    const height = pixelGrid(first.h, integerScale);
    canvas.width = width.backing;
    canvas.height = height.backing;
    canvas.style.width = `${width.css}px`;
    canvas.style.height = `${height.css}px`;
    paint(0);
    onFrameRef.current?.(0);
  }, [frames, scale, paint]);

  useEffect(() => {
    if (!playing || frames.length < 2) {
      paint(indexRef.current);
      return;
    }
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      carry += Math.min(250, now - last);
      last = now;
      let advanced = false;
      while (carry >= frameMs) {
        carry -= frameMs;
        indexRef.current = (indexRef.current + 1) % frames.length;
        advanced = true;
      }
      if (advanced) {
        paint(indexRef.current);
        onFrameRef.current?.(indexRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frameMs, frames.length, paint]);

  useEffect(() => {
    if (step === stepRef.current) return;
    stepRef.current = step;
    if (frames.length === 0) return;
    indexRef.current = (indexRef.current + 1) % frames.length;
    paint(indexRef.current);
    onFrameRef.current?.(indexRef.current);
  }, [step, frames.length, paint]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label={alt}
      data-frame-count={frames.length}
      data-art-width={frames[0]?.w ?? 0}
    />
  );
}
