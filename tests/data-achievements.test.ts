/**
 * Gate 3b — achievements on disk. The unlock conditions are pure core logic over BudgetFacts, so this
 * module only compares the ledger of already-earned badges against the facts and writes the
 * difference. It runs on every open: an achievement earned three weeks ago on a day the app was never
 * opened is still paid once, and one already earned is never paid twice.
 */

import { describe, expect, it, vi } from 'vitest';
import type { BudgetFacts, Clock } from '../src/core/types';
import { ledgerEvents } from '../src/data/ledger';
import { syncAchievements } from '../src/data/achievementsStore';
import type { WriteContext } from '../src/data/repos';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const clock: Clock = { now: () => NOW, today: () => TODAY };

function ctx(prefix = 'a'): WriteContext {
  let n = 0;
  return { clock, newId: () => `${prefix}-${++n}` };
}

function facts(over: Partial<BudgetFacts> = {}): BudgetFacts {
  return {
    activeDates: [],
    txnCount: 0,
    noteCount: 0,
    goalContributions: 0,
    nospendCount: 0,
    checkinCount: 0,
    reviewCount: 0,
    transferCount: 0,
    recurringCount: 0,
    archivedEnvelopeCount: 0,
    streak: 0,
    longestStreak: 0,
    emergencyFundRatio: 0,
    envelopeStates: [],
    goalReachedGoalIds: [],
    level: 1,
    backupCreated: false,
    installedToHomeScreen: false,
    usedOffline: false,
    weekEnvelopeUnder80: false,
    ...over,
  };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('syncAchievements', () => {
  it('unlocks and pays the achievements the facts earned', async () => {
    const db = testDb('ach-earn');
    const earned = await syncAchievements(db, ctx(), facts({ txnCount: 1, reviewCount: 1 }));

    expect(ids(earned)).toEqual(['first-entry', 'first-review']);
    const stored = await db.achievements.toArray();
    expect(ids(stored).sort()).toEqual(['first-entry', 'first-review']);
    expect(stored.every((row) => row.unlockedAt === NOW)).toBe(true);
    const events = await ledgerEvents(db);
    expect(events.map((e) => e.key)).toEqual(['ach:first-entry', 'ach:first-review']);
    expect(events.map((e) => e.xp)).toEqual([10, 30]);
    expect(events.every((e) => e.at === TODAY)).toBe(true);
  });

  it('unlocks nothing while the facts are quiet', async () => {
    const db = testDb('ach-quiet');
    expect(ids(await syncAchievements(db, ctx(), facts()))).toEqual([]);
    expect(await db.achievements.count()).toBe(0);
    expect(await db.rewards.count()).toBe(0);
  });

  it('pays nothing on a second sync of the same facts', async () => {
    const db = testDb('ach-twice');
    const first = await syncAchievements(db, ctx(), facts({ txnCount: 1, reviewCount: 1 }));
    const second = await syncAchievements(db, ctx('b'), facts({ txnCount: 1, reviewCount: 1 }));

    expect(first).toHaveLength(2);
    expect(second).toEqual([]);
    expect(await db.achievements.count()).toBe(2);
    expect(await db.rewards.count()).toBe(2);
  });

  it('keeps an earned badge earned when the numbers fall again', async () => {
    const db = testDb('ach-quiet-after');
    await syncAchievements(db, ctx(), facts({ txnCount: 1, reviewCount: 1 }));
    const later: WriteContext = {
      clock: { now: () => NOW + 86_400_000, today: () => '2026-10-26' },
      newId: () => 'later',
    };

    expect(await syncAchievements(db, later, facts())).toEqual([]);
    const stored = await db.achievements.toArray();
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.unlockedAt === NOW)).toBe(true);
    expect(await db.rewards.count()).toBe(2);
  });

  it('unlocks the device facts the caller reports', async () => {
    const db = testDb('ach-flags');
    const earned = await syncAchievements(
      db,
      ctx(),
      facts({ backupCreated: true, installedToHomeScreen: true, usedOffline: true }),
    );
    expect(ids(earned).sort()).toEqual(['backup-created', 'installed', 'used-offline']);
  });

  it('rolls the unlocks back when the rewards cannot be written', async () => {
    const db = testDb('ach-atomic');
    const realAdd = db.rewards.add.bind(db.rewards);
    vi.spyOn(db.rewards, 'add').mockImplementation((async (row: Parameters<typeof realAdd>[0]) => {
      await realAdd(row);
      throw new Error('quota');
    }) as unknown as typeof db.rewards.add);

    await expect(
      syncAchievements(db, ctx(), facts({ txnCount: 1, reviewCount: 1 })),
    ).rejects.toThrow('quota');
    vi.restoreAllMocks();
    expect(await db.rewards.count()).toBe(0);
    expect(await db.achievements.count()).toBe(0);
  });
});
