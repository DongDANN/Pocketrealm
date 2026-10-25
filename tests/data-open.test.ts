/**
 * Gate 3b — the open. One call does what the app owes itself on a cold start: generate the recurring
 * entries that came due while it was shut, close any period that ended, take the free daily oil,
 * score the quests against the window each kind owns, and pay achievements the user earned on a day
 * they never opened the app. Every step is keyed, so the whole thing is safe to run twice in a minute.
 */

import { describe, expect, it } from 'vitest';
import { isoWeekBounds } from '../src/core/dates';
import type { Clock, Recurring } from '../src/core/types';
import { checkinReward, reviewReward } from '../src/core/habits';
import { offeredDailyQuests } from '../src/core/quests';
import { grantMany, ledgerEvents } from '../src/data/ledger';
import { loadFacts } from '../src/data/factsStore';
import { completeOnboarding, questSeed } from '../src/data/onboard';
import { runOpenJobs } from '../src/data/openJobs';
import { saveGoal, upsertRecurring, writeTransaction, type WriteContext } from '../src/data/repos';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const clock: Clock = { now: () => NOW, today: () => TODAY };

function ctx(prefix = 'o'): WriteContext {
  let n = 0;
  return { clock, newId: () => `${prefix}-${++n}` };
}

const rent: Recurring = {
  id: 'rent',
  cadence: 'monthly',
  startDate: '2026-09-01',
  template: { kind: 'expense', amount: 150_00, envelopeId: 'rent' },
};

const setup = {
  currency: 'PHP',
  periodStartDay: 1,
  templateId: 'essentials',
  income: 450_00,
  companionName: 'Pip',
  speciesKey: 'mossling',
};

async function started(templateId = 'essentials', income = 450_00) {
  const db = testDb('open');
  const outcome = await completeOnboarding(db, ctx('n'), { ...setup, templateId, income });
  if (!outcome.ok) throw new Error('fixture setup failed');
  return db;
}

describe('runOpenJobs', () => {
  it('catches the book up: occurrences, the ended period, oil and the quest offers', async () => {
    const db = await started();
    await upsertRecurring(db, rent);

    const report = await runOpenJobs(db, ctx(), {});

    expect(report.recurring.written).toBe(2); // the 1st of September and of October
    expect(report.closed.map((s) => s.periodId)).toEqual(['2026-09-01']);
    expect(report.current.id).toBe('2026-10-01');
    expect(report.oil.granted).toBe(true);
    expect(report.quests).toHaveLength(6);
    // The offers come from this install's own seed, not from a constant one.
    const seed = await questSeed(db);
    expect(seed).toBeGreaterThan(0);
    expect(report.quests.filter((s) => s.quest.kind === 'daily').map((s) => s.quest.id)).toEqual(
      offeredDailyQuests(seed, TODAY).map((q) => q.id),
    );
    // 'recurring-setup' only unlocks if the entries generated on this open are already in the facts.
    expect(report.achievements.map((a) => a.id)).toContain('recurring-setup');
    expect((await ledgerEvents(db)).find((e) => e.key === 'oil:trickle:2026-10-25')).toMatchObject({
      type: 'oil:trickle',
      oil: 20,
      xp: 0,
      at: TODAY,
    });
    expect(await db.transactions.count()).toBe(2);
  });

  it('writes nothing new on a second open', async () => {
    const db = await started();
    await upsertRecurring(db, rent);
    const first = await runOpenJobs(db, ctx('a'), { backupCreated: true });
    const rewardsAfterFirst = await db.rewards.count();

    const second = await runOpenJobs(db, ctx('b'), { backupCreated: true });
    expect(second.recurring.written).toBe(0);
    expect(second.closed).toEqual([]);
    expect(second.current.id).toBe(first.current.id);
    expect(second.oil.granted).toBe(false);
    expect(second.achievements).toEqual([]);
    expect(second.quests).toHaveLength(6);
    expect(await db.rewards.count()).toBe(rewardsAfterFirst);
    expect(await db.transactions.count()).toBe(2);
    expect(await db.periodCloses.count()).toBe(1);
  });

  it('pays an achievement earned while the app was shut', async () => {
    const db = await started();
    const w = ctx('t');
    await writeTransaction(db, { kind: 'expense', amount: 10_00, date: '2026-10-20' }, w);
    await grantMany(db, reviewReward('2026-W42', '2026-10-20'));

    const report = await runOpenJobs(db, ctx(), { backupCreated: true });
    expect(report.achievements.map((a) => a.id).sort()).toEqual([
      'backup-created',
      'first-entry',
      'first-review',
    ]);
    // The next open has nothing left to hand out.
    expect(await runOpenJobs(db, ctx('c'), { backupCreated: true })).toMatchObject({
      achievements: [],
    });
  });

  it('scores each kind of quest against its own window', async () => {
    const db = await started('custom', 0);
    const w = ctx('t');
    await writeTransaction(
      db,
      { kind: 'expense', amount: 10_00, date: '2026-10-24', note: 'Jeepney' },
      w,
    );
    await writeTransaction(db, { kind: 'expense', amount: 20_00, date: TODAY, note: 'Gabi' }, w);
    await grantMany(db, [
      ...reviewReward('2026-W41', '2026-10-15'),
      ...checkinReward('2026-10-15'),
    ]);

    const report = await runOpenJobs(db, ctx(), {});
    const seed = await questSeed(db);
    const daily = await loadFacts(db, { today: TODAY, window: { start: TODAY, end: TODAY } });
    const weekly = await loadFacts(db, { today: TODAY, window: isoWeekBounds(TODAY) });
    const season = await loadFacts(db, {
      today: TODAY,
      window: { start: '2026-10-01', end: '2026-10-31' },
    });
    // The three windows have to differ or the routing below proves nothing.
    expect([daily.txnCount, weekly.txnCount, season.txnCount]).toEqual([1, 2, 2]);
    expect([daily.reviewCount, weekly.reviewCount, season.reviewCount]).toEqual([0, 0, 1]);
    expect([daily.checkinCount, weekly.checkinCount, season.checkinCount]).toEqual([0, 0, 1]);

    const forKind = { daily, weekly, season } as const;
    expect(report.quests.map((s) => s.progress)).toEqual(
      report.quests.map((s) => s.quest.progress(forKind[s.quest.kind])),
    );
    expect(seed).toBeGreaterThan(0);
  });

  it('gives a daily quest nothing for work that happened on an earlier day of the week', async () => {
    const db = await started('custom', 0);
    const w = ctx('t');
    await writeTransaction(
      db,
      { kind: 'expense', amount: 10_00, date: '2026-10-21', note: 'Bus' },
      w,
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 20_00, date: '2026-10-22', note: 'Load' },
      w,
    );
    await grantMany(db, [
      ...reviewReward('2026-W42', '2026-10-21'),
      ...checkinReward('2026-10-21'),
    ]);

    const report = await runOpenJobs(db, ctx(), {});
    const daily = await loadFacts(db, { today: TODAY, window: { start: TODAY, end: TODAY } });
    const weekly = await loadFacts(db, { today: TODAY, window: isoWeekBounds(TODAY) });
    const season = await loadFacts(db, {
      today: TODAY,
      window: { start: '2026-10-01', end: '2026-10-31' },
    });
    // A week that busy against a day that empty: swap the two windows and something has to change.
    expect([daily.txnCount, weekly.txnCount]).toEqual([0, 2]);
    expect([daily.reviewCount, weekly.reviewCount]).toEqual([0, 1]);
    expect([daily.checkinCount, weekly.checkinCount]).toEqual([0, 1]);

    const forKind = { daily, weekly, season } as const;
    expect(report.quests.map((s) => s.progress)).toEqual(
      report.quests.map((s) => s.quest.progress(forKind[s.quest.kind])),
    );
    expect(report.quests.filter((s) => s.quest.kind === 'weekly').some((s) => s.progress > 0)).toBe(
      true,
    );
    const quietDailies = report.quests
      .filter((s) => s.quest.kind === 'daily' && s.quest.id !== 'daily-envelope-watch')
      .map((s) => s.progress);
    expect(quietDailies.some((p) => p > 0)).toBe(false);
  });

  it('pays a badge earned in a period that has already closed', async () => {
    const db = await started();
    await writeTransaction(db, { kind: 'expense', amount: 10_00, date: '2026-09-10' }, ctx('t'));

    const report = await runOpenJobs(db, ctx(), {});
    expect(report.achievements.map((a) => a.id)).toContain('first-entry');
  });

  it('credits a goal reached while the app was closed', async () => {
    const db = await started();
    await saveGoal(db, {
      id: 'g1',
      name: 'Load',
      target: 20_00,
      saved: 20_00,
      icon: 'battery',
      archived: false,
    });

    const report = await runOpenJobs(db, ctx(), {});
    expect(report.achievements.map((a) => a.id)).toContain('first-goal');
    expect(report.quests.find((s) => s.quest.id === 'season-fill-lantern')).toMatchObject({
      progress: 1,
    });
  });
});
