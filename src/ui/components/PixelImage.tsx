import { useEffect, useRef } from 'react';
import type { Pixmap } from '../../art/px';
import { pixelGrid, pixmapToCanvas } from '../lib/canvas';

interface Props {
  pixmap: Pixmap;
  scale?: number;
  alt: string;
  className?: string;
}

export function PixelImage({ pixmap, scale = 1, alt, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const integerScale = Math.max(1, Math.round(scale));
  // Size the canvas in the render pass, not only in the effect: an unsized canvas is 300x150 and
  // collapses every wrapping line the moment the effect lands, which is a full-page layout shift.
  const width = pixelGrid(pixmap.w, integerScale);
  const height = pixelGrid(pixmap.h, integerScale);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width.backing;
    canvas.height = height.backing;
    canvas.style.width = `${width.css}px`;
    canvas.style.height = `${height.css}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixmapToCanvas(pixmap), 0, 0, canvas.width, canvas.height);
  }, [pixmap, scale]);

  return (
    <canvas
      ref={ref}
      className={className}
      width={width.backing}
      height={height.backing}
      style={{ width: `${width.css}px`, height: `${height.css}px` }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-pixel-scale={scale}
      data-art-width={pixmap.w}
    />
  );
}
