import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLElement> {
  tone?: 'dark' | 'paper';
  children: ReactNode;
}

export function PixelPanel({ tone = 'dark', className, children, ...rest }: Props) {
  return (
    <section
      className={['panel', tone === 'paper' ? 'panel-paper' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </section>
  );
}
