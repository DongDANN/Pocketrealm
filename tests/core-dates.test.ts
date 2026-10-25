import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  compareDates,
  dateOf,
  daysBetween,
  isLocalDate,
  isoWeekId,
  monthKey,
  parseDate,
} from '../src/core/dates';
import { mulberry32 } from '../src/core/rng';

describe('local date helpers', () => {
  it('round-trips dates through epoch ms', () => {
    const d = parseDate('2026-10-25');
    expect(dateOf(d.getTime())).toBe('2026-10-25');
  });

  it('validates local date strings', () => {
    expect(isLocalDate('2026-10-25')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('not-a-date')).toBe(false);
    expect(isLocalDate('2026-1-5')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween is an exact inverse of addDays (property)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const base = `202${rng.int(8)}-${String(1 + rng.int(12)).padStart(2, '0')}-${String(
        1 + rng.int(28),
      ).padStart(2, '0')}`;
      const n = rng.int(400) - 200;
      const to = addDays(base, n);
      expect(daysBetween(base, to)).toBe(n);
    }
  });

  it('addMonths clamps the day to the target month length', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-01-15', 13)).toBe('2027-02-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('computes ISO week ids', () => {
    expect(isoWeekId('2026-01-01')).toBe('2026-W01');
    expect(isoWeekId('2026-10-19')).toBe('2026-W43'); // Monday
    expect(isoWeekId('2026-10-25')).toBe('2026-W43'); // Sunday of the same week
  });

  it('monthKey slices correctly', () => {
    expect(monthKey('2026-10-25')).toBe('2026-10');
    expect(compareDates('2026-10-01', '2026-10-02')).toBe(-1);
    expect(compareDates('2026-10-02', '2026-10-01')).toBe(1);
    expect(compareDates('2026-10-01', '2026-10-01')).toBe(0);
  });
});
