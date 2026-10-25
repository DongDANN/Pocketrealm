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
  // Words are always separate canvases so a line can reflow with its panel: a single bitmap run
  // cannot shrink, and an unshrinkable line is what pushes a card past the edge of the screen.
  const words = useMemo(() => {
    const split = text.split(/\s+/).filter(Boolean);
    return split.length > 0 ? split : [''];
  }, [text]);

  const advance = ADVANCE * cssPerArtPixel(pixelScale);
  // `wrap` is only a soft cap on top of that: `.pixel-text` also shrinks with its panel.
  const maxWidth = wrap && wrap > 0 ? wrap * advance : undefined;

  const pixmaps = useMemo(
    () => words.map((word) => textPixmap(word, color, pixelScale)),
    [words, color, pixelScale],
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
