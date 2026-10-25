import { describe, expect, it } from 'vitest';
import {
  LEVELS,
  clampOil,
  grant,
  levelForXp,
  totalSparks,
  totalXp,
  xpForLevel,
} from '../src/core/rewards';
import type { GrantSpec } from '../src/core/rewards';
import type { RewardEvent } from '../src/core/types';

function spec(key: string, type: string, xp: number, day = '2026-10-25'): GrantSpec {
  return { key, type, xp, sparks: 0, at: day };
}

describe('reward ledger', () => {
  it('ignores duplicate keys entirely', () => {
    const first = grant([], spec('log:t1', 'log', 5));
    expect(first.granted).toBe(true);
    const again = grant(first.events, spec('log:t1', 'log', 5));
    expect(again.granted).toBe(false);
    expect(again.skippedReason).toBe('duplicate');
    expect(again.events).toHaveLength(1);
  });

  it('caps log grants at 8 per day', () => {
    let events: RewardEvent[] = [];
    for (let i = 1; i <= 10; i++) {
      const result = grant(events, spec(`log:t${i}`, 'log', 5));
      events = result.events;
      if (i <= 8) expect(result.granted).toBe(true);
      else {
        expect(result.granted).toBe(false);
        expect(result.skippedReason).toBe('cap');
      }
    }
    expect(events).toHaveLength(8);
    expect(totalXp(events)).toBe(40);
  });

  it('caps goal grants at 3 per day', () => {
    let events: RewardEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      const result = grant(events, spec(`goal:t${i}`, 'goal', 15));
      events = result.events;
      expect(result.granted).toBe(i <= 3);
    }
    expect(events).toHaveLength(3);
  });

  it('delve floor XP caps at 30 per day', () => {
    let events: RewardEvent[] = [];
    for (let i = 1; i <= 5; i++) {
      const result = grant(events, spec(`delve:floor:r1:${i}`, 'delve:floor', 10));
      events = result.events;
      expect(result.granted).toBe(i <= 3);
    }
    expect(totalXp(events)).toBe(30);
  });

  it('truncates one big grant to the remaining daily XP budget instead of dropping it', () => {
    // A Hollow clear pays 60 XP at once. Refusing it outright would make the biggest Delve reward
    // permanently unreachable, so the cap means "up to 30 today", not "nothing today".
    const clear = grant([], { ...spec('delve:clear:r1', 'delve:clear', 60), sparks: 10 });
    expect(clear.granted).toBe(true);
    expect(clear.events).toHaveLength(1);
    expect(clear.events[0]).toMatchObject({ xp: 30, sparks: 10 });

    const next = grant(clear.events, spec('delve:floor:r1:2', 'delve:floor', 10));
    expect(next.granted).toBe(false);
    expect(next.skippedReason).toBe('cap');
  });

  it('tops a capped grant up to the remaining budget', () => {
    let events = grant([], spec('delve:floor:r1:1', 'delve:floor', 10)).events;
    const partial = grant(events, { ...spec('delve:clear:r1', 'delve:clear', 60), sparks: 10 });
    expect(partial.granted).toBe(true);
    expect(totalXp(partial.events)).toBe(30);
    events = partial.events;
    expect(totalSparks(events)).toBe(10);
  });

  it('the cap is per local day, not global', () => {
    let events: RewardEvent[] = [];
    for (let i = 1; i <= 8; i++) {
      events = grant(events, spec(`log:t${i}`, 'log', 5, '2026-10-25')).events;
    }
    const next = grant(events, spec('log:t9', 'log', 5, '2026-10-26'));
    expect(next.granted).toBe(true);
  });

  it('edit/delete/recreate cannot mint XP beyond caps (key changes, cap holds)', () => {
    // Log 8 entries, edit one (same id, same key => no new grant), delete one (no revocation),
    // recreate it (new id, new key => new grant attempt, but the daily cap blocks it).
    let events: RewardEvent[] = [];
    for (let i = 1; i <= 8; i++) events = grant(events, spec(`log:t${i}`, 'log', 5)).events;
    expect(events).toHaveLength(8);
    const edited = grant(events, spec('log:t2', 'log', 5));
    expect(edited.granted).toBe(false);
    const recreated = grant(events, spec('log:t2-new-id', 'log', 5));
    expect(recreated.granted).toBe(false);
    expect(totalXp(events)).toBe(40);
  });

  it('sums xp and sparks, and carries oil on events', () => {
    let events: RewardEvent[] = [];
    events = grant(events, { ...spec('checkin:d', 'checkin', 10), sparks: 2, oil: 10 }).events;
    events = grant(events, { ...spec('log:t1', 'log', 5), sparks: 1 }).events;
    expect(totalXp(events)).toBe(15);
    expect(totalSparks(events)).toBe(3);
    expect(events.find((e) => e.oil !== undefined)!.oil).toBe(10);
  });
});

describe('level curve', () => {
  it('levels are monotonic and the table is documented', () => {
    expect(LEVELS[1]).toBe(0);
    for (let i = 2; i < LEVELS.length; i++) {
      expect(LEVELS[i]!).toBeGreaterThan(LEVELS[i - 1]!);
    }
    expect(LEVELS).toHaveLength(51);
  });

  it('matches round(60 * N^1.5)', () => {
    expect(xpForLevel(1)).toBe(60);
    expect(xpForLevel(2)).toBe(Math.round(60 * 2 ** 1.5)); // 170
    expect(xpForLevel(10)).toBe(Math.round(60 * 10 ** 1.5)); // 1897
  });

  it('computes level and progress into the level', () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(59).level).toBe(1);
    expect(levelForXp(60).level).toBe(2);
    const info = levelForXp(100);
    expect(info.level).toBe(2);
    expect(info.intoLevel).toBe(40);
    expect(info.need).toBe(170);
    expect(levelForXp(-5).level).toBe(1);
  });
});

describe('oil constants', () => {
  it('clamps storage to the cap and never negative', () => {
    expect(clampOil(999)).toBe(200);
    expect(clampOil(-3)).toBe(0);
    expect(clampOil(120)).toBe(120);
  });
});
