import { useEffect, useRef } from 'react';
import { colorHex } from '../../art/palette';
import type { Pixmap } from '../../art/px';

interface Props {
  pixmap: Pixmap;
  scale?: number;
  alt: string;
  className?: string;
}

export function PixelImage({ pixmap, scale = 1, alt, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
    const renderScale = Math.max(1, Math.round(scale)) * dpr;
    canvas.width = pixmap.w * renderScale;
    canvas.height = pixmap.h * renderScale;
    canvas.style.width = `${pixmap.w * Math.max(1, Math.round(scale))}px`;
    canvas.style.height = `${pixmap.h * Math.max(1, Math.round(scale))}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const off = document.createElement('canvas');
    off.width = pixmap.w;
    off.height = pixmap.h;
    const offCtx = off.getContext('2d');
    if (!offCtx) return;
    const image = offCtx.createImageData(pixmap.w, pixmap.h);
    for (let i = 0; i < pixmap.data.length; i++) {
      const idx = pixmap.data[i] ?? 0;
      if (idx === 0) continue;
      const hex = colorHex(idx);
      image.data[i * 4] = parseInt(hex.slice(1, 3), 16);
      image.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
      image.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
      image.data[i * 4 + 3] = 255;
    }
    offCtx.putImageData(image, 0, 0);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [pixmap, scale]);

  return (
    <canvas ref={ref} className={className} role="img" aria-label={alt} data-pixel-scale={scale} />
  );
}
