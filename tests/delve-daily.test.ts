/**
 * Gate 1.6e — Daily Challenge: seeded by hash(date, "daily") so every player gets the same
 * dungeon on a date with no server; a fixed loadout; one attempt per local day; a small Embers
 * and Spark reward; a local personal best; and no Lantern Oil cost.
 */

import { describe, expect, it } from 'vitest';
import { emptyMeta, stepRun, type BoonTag, type DelveMeta } from '../src/core/delve';
import { dailyHollow, dailySeed, finishDailyRun, newDailyRun } from '../src/core/delve/daily';

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), ...over };
}

const PRIORITY: BoonTag[] = ['guard', 'vigor', 'fury', 'fortune', 'thrift'];

const ctx = (meta: DelveMeta, oil: number) => ({
  now: 0,
  oil,
  oilCapacity: 100,
  signals: {
    checkedInToday: false,
    envelopesWithinAllowance: 0,
    contributedToGoalLast7d: false,
    reviewedLast7d: false,
  },
  meta,
  policy: {
    mode: 'autopilot' as const,
    tagPriority: PRIORITY,
    retreatHpPercent: 0,
    route: 'balanced' as const,
  },
  today: '2026-10-25',
});

describe('daily seed', () => {
  it('is deterministic per date and differs across dates', () => {
    expect(dailySeed('2026-10-25')).toBe(dailySeed('2026-10-25'));
    const seeds = new Set([
      dailySeed('2026-10-24'),
      dailySeed('2026-10-25'),
      dailySeed('2026-10-26'),
    ]);
    expect(seeds.size).toBe(3);
    const hollow = dailyHollow('2026-10-25');
    expect([1, 2, 3]).toContain(hollow);
  });
});

describe('newDailyRun', () => {
  it('uses a fixed loadout independent of meta progression', () => {
    const meta = metaWith({
      forge: { maxhp: 5, atk: 5, glint: 5 },
      cards: ['rainy-day'],
      equippedConsumables: ['fire-oil'],
      buildingLevels: { treasury: 2, smithy: 2 },
      clearedHollows: [1, 2],
    });
    const out = newDailyRun('2026-10-25', meta);
    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.run.daily).toBe(true);
    expect(out.run.companionLevel).toBe(12);
    expect(out.run.buildId).toBe('warden');
    expect(out.run.boons).toEqual([]);
    expect(out.run.cards).toEqual([]);
    expect(out.run.consumables).toEqual([]);
    expect(out.run.buildings).toEqual({});
    expect(out.run.heat).toBe(0);
    expect(out.meta.daily).toEqual({ date: '2026-10-25', played: true });
  });

  it('allows one attempt per local day', () => {
    const meta = metaWith({ daily: { date: '2026-10-25', played: true } });
    const out = newDailyRun('2026-10-25', meta);
    expect('error' in out).toBe(true);
    const next = newDailyRun('2026-10-26', meta);
    expect('error' in next).toBe(false);
  });

  it('gives everyone the same dungeon on a date', () => {
    const a = newDailyRun('2026-10-25', metaWith({ runsStarted: 0 }));
    const b = newDailyRun('2026-10-25', metaWith({ runsStarted: 41, clearedHollows: [1, 2, 3] }));
    if ('error' in a || 'error' in b) throw new Error('expected runs');
    expect(a.run.floorPlan).toEqual(b.run.floorPlan);
    expect(a.run.runId).not.toBe(b.run.runId);
  });
});

describe('daily steps and rewards', () => {
  it('costs no oil and still progresses', () => {
    const start = newDailyRun('2026-10-25', metaWith({}));
    if ('error' in start) throw new Error('expected run');
    const out = stepRun(start.run, ctx(start.meta, 0));
    expect(out.oilSpent).toBe(0);
    expect(out.run.result).toBe('active');
    expect(out.run.roomsVisited.length).toBe(1);
  });

  it('pays floor-scaled Embers and Sparks and keeps a personal best', () => {
    const start = newDailyRun('2026-10-25', metaWith({ embersDay: '2026-10-25' }));
    if ('error' in start) throw new Error('expected run');
    const run = { ...start.run, floor: 3, result: 'retreated' as const };
    const done = finishDailyRun(start.meta, run, '2026-10-25');
    if ('error' in done) throw new Error(done.error);
    expect(done.embers).toBe(6);
    expect(done.sparks).toBe(3);
    expect(done.floor).toBe(3);
    expect(done.best).toBe(true);
    expect(done.meta.dailyBest).toBe(3);
    expect(done.meta.daily.settled).toBe(true);

    const replay = { ...done.meta, daily: { date: '2026-10-25', played: true } };
    const again = finishDailyRun(replay, { ...run, floor: 2 }, '2026-10-25');
    if ('error' in again) throw new Error(again.error);
    expect(again.best).toBe(false);
    expect(again.meta.dailyBest).toBe(3);

    const twice = finishDailyRun(done.meta, { ...run, floor: 2 }, '2026-10-25');
    expect('error' in twice).toBe(true);
  });

  it('respects the daily Ember cap and rejects active runs', () => {
    const meta = metaWith({ embersDay: '2026-10-25', embersToday: 48 });
    const active = finishDailyRun(meta, { floor: 4, result: 'active' } as never, '2026-10-25');
    expect('error' in active).toBe(true);

    const run = { floor: 4, result: 'fainted' as const } as never;
    const done = finishDailyRun(meta, run, '2026-10-25');
    if ('error' in done) throw new Error(done.error);
    expect(done.embers).toBe(2); // capped at 50/day
    expect(done.meta.embers).toBe(2);
  });
});
