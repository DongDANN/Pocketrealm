/**
 * Gate 3b — quests on disk. The offers themselves are pure core logic (seed + date), so all this
 * module owns is the per-period row: progress only ever climbs, completion happens once, and the
 * reward can be taken exactly once per period. A new day or a new week is a new period id, which is
 * what stops yesterday's finished quest from paying again today.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  offeredDailyQuests,
  offeredWeeklyQuests,
  questPeriodId,
  seasonQuest,
  type QuestKind,
} from '../src/core/quests';
import type { BudgetFacts, Clock } from '../src/core/types';
import { ledgerEvents } from '../src/data/ledger';
import { claimQuest, refreshQuests, type QuestState } from '../src/data/questsStore';
import { listQuestProgress, type WriteContext } from '../src/data/repos';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const SEED = 90210;
const clock: Clock = { now: () => NOW, today: () => TODAY };

function ctx(prefix = 'q'): WriteContext {
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

const quiet = { daily: facts(), weekly: facts(), season: facts() };

/** Every counter a quest can read, at or above its target. */
const busy = {
  daily: facts({
    txnCount: 9,
    noteCount: 9,
    checkinCount: 9,
    nospendCount: 9,
    goalContributions: 9,
    reviewCount: 9,
    activeDates: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
    envelopeStates: [
      { envelopeId: 'food', percentUsed: 20, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'fun', percentUsed: 30, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'rent', percentUsed: 40, entriesLogged: 6, closedWithinAllowance: true },
    ],
    goalReachedGoalIds: ['g1'],
    weekEnvelopeUnder80: true,
  }),
  weekly: facts({
    txnCount: 9,
    noteCount: 9,
    reviewCount: 1,
    nospendCount: 2,
    goalContributions: 1,
    activeDates: ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'],
    envelopeStates: [
      { envelopeId: 'food', percentUsed: 20, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'fun', percentUsed: 30, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'rent', percentUsed: 40, entriesLogged: 6, closedWithinAllowance: true },
    ],
    goalReachedGoalIds: ['g1'],
    weekEnvelopeUnder80: true,
  }),
  season: facts({
    reviewCount: 1,
    goalReachedGoalIds: ['g1'],
    envelopeStates: [
      { envelopeId: 'food', percentUsed: 20, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'fun', percentUsed: 30, entriesLogged: 6, closedWithinAllowance: true },
      { envelopeId: 'rent', percentUsed: 40, entriesLogged: 6, closedWithinAllowance: true },
    ],
  }),
};

const byKind = (states: QuestState[], kind: QuestKind) =>
  states.filter((s) => s.quest.kind === kind);

describe('refreshQuests', () => {
  it('offers three dailies, two weeklies and the season arc, each keyed to its own period', async () => {
    const db = testDb('quests-offer');
    const states = await refreshQuests(db, ctx(), SEED, quiet);

    expect(states).toHaveLength(6);
    expect(byKind(states, 'daily').map((s) => s.quest.id)).toEqual(
      offeredDailyQuests(SEED, TODAY).map((q) => q.id),
    );
    expect(byKind(states, 'weekly').map((s) => s.quest.id)).toEqual(
      offeredWeeklyQuests(SEED, TODAY).map((q) => q.id),
    );
    expect(byKind(states, 'season').map((s) => s.quest.id)).toEqual([seasonQuest().id]);
    expect(byKind(states, 'daily').map((s) => s.periodId)).toEqual([TODAY, TODAY, TODAY]);
    expect(byKind(states, 'weekly').map((s) => s.periodId)).toEqual([
      questPeriodId('weekly', TODAY),
      questPeriodId('weekly', TODAY),
    ]);
    expect(byKind(states, 'season').map((s) => s.periodId)).toEqual([
      questPeriodId('season', TODAY),
    ]);
    expect(states.every((s) => s.progress === 0 && s.completedAt === undefined)).toBe(true);
    expect(await db.questProgress.count()).toBe(6);
  });

  it('writes the progress the facts report and marks a finished quest once', async () => {
    const db = testDb('quests-busy');
    const states = await refreshQuests(db, ctx(), SEED, busy);

    expect(states.map((s) => s.progress)).toEqual(states.map((s) => s.quest.target));
    expect(states.every((s) => s.completedAt === NOW)).toBe(true);
    const stored = await listQuestProgress(db, TODAY);
    expect(stored).toHaveLength(3);
    expect(stored.every((row) => row.completedAt === NOW)).toBe(true);
  });

  it('runs twice without adding rows or losing a finish', async () => {
    const db = testDb('quests-twice');
    const first = await refreshQuests(db, ctx(), SEED, quiet);
    expect(first.every((s) => s.progress === 0)).toBe(true);

    const second = await refreshQuests(db, ctx('r'), SEED, busy);
    expect(second).toHaveLength(6);
    expect(second.map((s) => s.progress)).toEqual(second.map((s) => s.quest.target));

    const third = await refreshQuests(db, ctx('t'), SEED, quiet);
    // Progress is a high-water mark: a quiet evening does not undo the day's work.
    expect(third.map((s) => s.progress)).toEqual(third.map((s) => s.quest.target));
    expect(third.every((s) => s.completedAt === NOW)).toBe(true);
    expect(await db.questProgress.count()).toBe(6);
  });

  it('gives a new day its own rows instead of reusing yesterday’s finish', async () => {
    const db = testDb('quests-rollover');
    await refreshQuests(db, ctx(), SEED, busy);

    const tomorrow: WriteContext = {
      clock: { now: () => NOW + 86_400_000, today: () => '2026-10-26' },
      newId: () => 'x',
    };
    const states = await refreshQuests(db, tomorrow, SEED, quiet);
    const dailies = byKind(states, 'daily');
    expect(dailies).toHaveLength(3);
    expect(dailies.every((s) => s.periodId === '2026-10-26')).toBe(true);
    expect(dailies.every((s) => s.progress === 0 && s.completedAt === undefined)).toBe(true);
    // Three new dailies plus two new weeklies (the 26th opens a new ISO week); the month's arc is
    // the same period, so it is still the one row written yesterday.
    expect(await db.questProgress.count()).toBe(11);
    const season = byKind(states, 'season')[0]!;
    expect(season.periodId).toBe('2026-10');
    expect(season.progress).toBe(season.quest.target);
    expect(season.completedAt).toBe(NOW);
    expect(
      (await listQuestProgress(db, TODAY)).filter((r) => r.completedAt).length,
    ).toBeGreaterThan(0);
  });
});

describe('claimQuest', () => {
  it('pays a finished quest once and refuses a second claim', async () => {
    const db = testDb('quests-claim');
    const states = await refreshQuests(db, ctx(), SEED, busy);
    const target = byKind(states, 'daily')[0]!;

    const claimed = await claimQuest(db, ctx('c'), target.quest.id, target.periodId);
    expect(claimed).toMatchObject({ ok: true, questId: target.quest.id, granted: true });
    expect((await ledgerEvents(db)).map((e) => e.key)).toEqual([
      `quest:${target.quest.id}:${target.periodId}`,
    ]);
    expect(
      await db.rewards.where('key').equals(`quest:${target.quest.id}:${target.periodId}`).first(),
    ).toMatchObject({ type: 'quest', xp: target.quest.xp, sparks: target.quest.sparks, at: TODAY });
    expect(
      (await listQuestProgress(db, target.periodId)).find((r) => r.questId === target.quest.id),
    ).toMatchObject({ claimedAt: NOW });

    const second = await claimQuest(db, ctx('d'), target.quest.id, target.periodId);
    expect(second).toEqual({ ok: false, reason: 'already-claimed' });
    expect(await db.rewards.count()).toBe(1);
  });

  it('remains claimed when the offers are refreshed again', async () => {
    const db = testDb('quests-keep-claim');
    const states = await refreshQuests(db, ctx(), SEED, busy);
    const target = byKind(states, 'daily')[0]!;
    await claimQuest(db, ctx('c'), target.quest.id, target.periodId);

    const after = await refreshQuests(db, ctx('r'), SEED, busy);
    expect(byKind(after, 'daily')[0]).toMatchObject({ claimedAt: NOW });
    expect(await claimQuest(db, ctx('d'), target.quest.id, target.periodId)).toEqual({
      ok: false,
      reason: 'already-claimed',
    });
    expect(await db.rewards.count()).toBe(1);
  });

  it('refuses a quest that is not finished yet', async () => {
    const db = testDb('quests-early');
    const states = await refreshQuests(db, ctx(), SEED, quiet);
    const first = states[0]!;
    expect(await claimQuest(db, ctx(), first.quest.id, first.periodId)).toEqual({
      ok: false,
      reason: 'in-progress',
    });
    expect(await db.rewards.count()).toBe(0);
  });

  it('refuses a quest this device was never offered', async () => {
    const db = testDb('quests-unknown');
    expect(await claimQuest(db, ctx(), 'daily-log-3', TODAY)).toEqual({
      ok: false,
      reason: 'unknown',
    });
    expect(await db.rewards.count()).toBe(0);
  });

  it('rolls back the reward and the claim together', async () => {
    const db = testDb('quests-atomic');
    const states = await refreshQuests(db, ctx(), SEED, busy);
    const target = byKind(states, 'daily')[0]!;
    const realAdd = db.rewards.add.bind(db.rewards);
    vi.spyOn(db.rewards, 'add').mockImplementation((async (row: Parameters<typeof realAdd>[0]) => {
      await realAdd(row);
      throw new Error('quota');
    }) as unknown as typeof db.rewards.add);

    await expect(claimQuest(db, ctx('c'), target.quest.id, target.periodId)).rejects.toThrow(
      'quota',
    );
    vi.restoreAllMocks();
    expect(await db.rewards.count()).toBe(0);
    expect(
      (await listQuestProgress(db, target.periodId)).find((r) => r.questId === target.quest.id)
        ?.claimedAt,
    ).toBeUndefined();
  });

  it('gives back the reward when the claim itself cannot be written', async () => {
    const db = testDb('quests-atomic-2');
    const states = await refreshQuests(db, ctx(), SEED, busy);
    const target = byKind(states, 'daily')[0]!;
    const realPut = db.questProgress.put.bind(db.questProgress);
    vi.spyOn(db.questProgress, 'put').mockImplementation((async (
      row: Parameters<typeof realPut>[0],
    ) => {
      await realPut(row);
      throw new Error('disk full');
    }) as unknown as typeof db.questProgress.put);

    await expect(claimQuest(db, ctx('c'), target.quest.id, target.periodId)).rejects.toThrow(
      'disk full',
    );
    vi.restoreAllMocks();
    // A paid reward with no claim recorded would let the same quest pay twice on the next open.
    expect(await db.rewards.count()).toBe(0);
  });
});
