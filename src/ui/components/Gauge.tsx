interface Props {
  value: number;
  label: string;
  tone?: 'moss' | 'amber' | 'rose';
  cells?: number;
}

export function Gauge({ value, label, tone = 'moss', cells = 10 }: Props) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * cells);
  return (
    <div
      className={`gauge gauge-${tone}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      {Array.from({ length: cells }, (_, index) => (
        <span key={index} className={index < filled ? 'gauge-cell on' : 'gauge-cell'} />
      ))}
    </div>
  );
}
