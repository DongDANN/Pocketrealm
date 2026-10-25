import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { nextMonth, streakState, tokenGrants } from '../src/core/streaks';

const day = (d: string) => d;

describe('streaks and rest tokens', () => {
  it('counts consecutive active days including today', () => {
    const s = streakState(['2026-10-23', '2026-10-24', '2026-10-25'], 0, '2026-10-25');
    expect(s.streak).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.tokenSpends).toEqual([]);
  });

  it('a missed day between active days spends a token and preserves the streak', () => {
    const s = streakState(['2026-10-23', '2026-10-25'], 1, '2026-10-25');
    // Oct 24 was missed, but a token covered it.
    expect(s.streak).toBe(3);
    expect(s.tokens).toBe(0);
    expect(s.tokenSpends).toEqual([{ date: '2026-10-24', before: 1, after: 0 }]);
  });

  it('a token never invents days before the first activity', () => {
    const s = streakState(['2026-10-25'], 2, '2026-10-25');
    expect(s.streak).toBe(1);
    expect(s.longest).toBe(1);
    expect(s.tokens).toBe(2);
    expect(s.tokenSpends).toEqual([]);
  });

  it('a missed day before the current run started is not a break', () => {
    const s = streakState(['2026-10-24', '2026-10-25'], 0, '2026-10-25');
    expect(s.streak).toBe(2);
    expect(s.breaks).toEqual([]);
  });

  it('today not logged yet is neither a break nor a token spend', () => {
    const s = streakState(['2026-10-23', '2026-10-24'], 0, '2026-10-25');
    expect(s.streak).toBe(2);
    expect(s.tokenSpends).toEqual([]);
    expect(s.breaks).toEqual([]);
  });

  it('longest streak survives later breaks', () => {
    const s = streakState(
      ['2026-10-20', '2026-10-21', '2026-10-24', '2026-10-25'],
      0,
      '2026-10-25',
    );
    expect(s.streak).toBe(2);
    expect(s.longest).toBe(2);
    expect(s.breaks).toEqual(['2026-10-22']);
  });

  it('never goes negative with clock changes or empty input', () => {
    expect(streakState([], 0, '2026-10-25').streak).toBe(0);
    // Active dates in the "future" relative to a rewound clock are simply not counted.
    const s = streakState(['2026-10-25', '2026-10-26'], 2, '2026-10-24');
    expect(s.streak).toBe(0);
    expect(s.tokens).toBe(2);
  });

  it('token grants count calendar months inclusively', () => {
    expect(tokenGrants('2026-01', '2026-01', 2)).toBe(2);
    expect(tokenGrants('2026-01', '2026-10', 2)).toBe(20);
    expect(tokenGrants('2026-10', '2026-01', 2)).toBe(0);
  });

  it('nextMonth rolls the year', () => {
    expect(nextMonth('2026-12-01')).toBe('2027-01-01');
    expect(nextMonth('2026-01-15')).toBe('2026-02-01');
  });

  it('addDays helper used in tests stays consistent', () => {
    expect(addDays('2026-10-25', -1)).toBe(day('2026-10-24'));
  });
});
