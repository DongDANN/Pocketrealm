import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { playSfx } from '../lib/sound';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

/**
 * Every press answers with a blip, which is also the gesture the audio engine waits for. A player
 * with sound off hears nothing: `playSfx` is a no-op until the engine is armed.
 */
export const PixelButton = forwardRef<HTMLButtonElement, Props>(function PixelButton(
  { variant = 'primary', className, onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={['pixel-button', variant === 'secondary' ? 'secondary' : '', className]
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => {
        playSfx(variant === 'secondary' ? 'menu' : 'confirm');
        onClick?.(event);
      }}
      {...rest}
    />
  );
});
