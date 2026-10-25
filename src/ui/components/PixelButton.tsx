import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const PixelButton = forwardRef<HTMLButtonElement, Props>(function PixelButton(
  { variant = 'primary', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={['pixel-button', variant === 'secondary' ? 'secondary' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    />
  );
});
