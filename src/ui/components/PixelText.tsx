import { useMemo } from 'react';
import { ADVANCE, LINE_HEIGHT, textPixmap } from '../../art/font5x7';
import { cssPerArtPixel } from '../lib/canvas';
import { PixelImage } from './PixelImage';
import { useTextMode } from '../lib/textMode';

interface Props {
  text: string;
  color: number;
  pixelScale?: number;
  className?: string;
  /** Soft line-length cap in characters; lines still break earlier on narrow screens. */
  wrap?: number;
  /** Vertical gap between wrapped lines, in art pixels. */
  lineGap?: number;
  align?: 'left' | 'center' | 'right';
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/**
 * "Lantern Sans" bitmap text. Words become one canvas each inside a wrapping flex line, so a
 * paragraph reflows with the panel instead of forcing it wider. Readable text mode swaps in the
 * system face at the same cap.
 */
export function PixelText({
  text,
  color,
  pixelScale = 2,
  className,
  wrap,
  lineGap = 2,
  align = 'left',
}: Props) {
  const mode = useTextMode();
  const words = useMemo(
    () => (wrap && wrap > 0 ? text.split(/\s+/).filter(Boolean) : null),
    [text, wrap],
  );

  const maxWidth = words && wrap ? wrap * ADVANCE * cssPerArtPixel(pixelScale) : undefined;

  const pixmaps = useMemo(
    () => (words ?? [text]).map((word) => textPixmap(word, color, pixelScale)),
    [words, text, color, pixelScale],
  );

  if (mode === 'system') {
    return (
      <span
        className={['readable-text', className].filter(Boolean).join(' ')}
        style={{
          display: 'block',
          maxWidth,
          fontSize: pixelScale * 10,
          lineHeight: `${pixelScale * LINE_HEIGHT}px`,
          letterSpacing: `${pixelScale}px`,
          textTransform: 'uppercase',
          textAlign: align,
        }}
      >
        {text}
      </span>
    );
  }

  if (!words) {
    return <PixelImage pixmap={pixmaps[0]!} scale={1} alt={text} className={className} />;
  }

  const unit = cssPerArtPixel(pixelScale);
  return (
    <span
      className={['pixel-text', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={text}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: JUSTIFY[align],
        gap: `${lineGap * unit}px ${ADVANCE * unit}px`,
        maxWidth,
      }}
    >
      {pixmaps.map((pixmap, index) => (
        <PixelImage key={`${words[index]}-${index}`} pixmap={pixmap} scale={1} alt="" />
      ))}
    </span>
  );
}
