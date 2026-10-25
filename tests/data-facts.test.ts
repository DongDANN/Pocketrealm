/**
 * Gate 3b — the read side. Quests, achievements and every screen header are allowed to look at the
 * book only through BudgetFacts, so this module is the single place that decides what "the facts"
 * means: live rows only, the caller's window for counts, the settings' period for money, carry-ins
 * read back from the stored closes, and level taken from the ledger instead of a counter beside it.
 */

import { describe, expect, it } from 'vitest';
import { checkinReward, nospendReward, reviewReward } from '../src/core/habits';
import { isoWeekId } from '../src/core/dates';
import { periodOf } from '../src/core/periods';
import type { Clock, Envelope, Goal } from '../src/core/types';
import { closeEndedPeriods } from '../src/data/lifecycle';
import { grantMany } from '../src/data/ledger';
import { loadFacts } from '../src/data/factsStore';
import {
  deleteTransaction,
  getSettings,
  saveEnvelope,
  saveGoal,
  saveSettings,
  writeTransaction,
  type WriteContext,
} from '../src/data/repos';
import { testDb } from './data-harness';

const TODAY = '2026-10-25';
const NOW = 1_760_000_000_000;
const clock: Clock = { now: () => NOW, today: () => TODAY };

function ctx(): WriteContext {
  let n = 0;
  return { clock, newId: () => `f-${++n}` };
}

const food = (over: Partial<Envelope> = {}): Envelope => ({
  id: 'food',
  name: 'Food',
  icon: 'bowl',
  colorKey: 'moss',
  monthlyAllowance: 100_00,
  rollover: 'carry',
  archived: false,
  sortOrder: 0,
  ...over,
});

const fun = (over: Partial<Envelope> = {}): Envelope => ({
  id: 'fun',
  name: 'Fun',
  icon: 'spark',
  colorKey: 'amber',
  monthlyAllowance: 50_00,
  rollover: 'none',
  archived: true,
  sortOrder: 1,
  ...over,
});

const fund = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Emergency fund',
  target: 50_00,
  saved: 60_00,
  icon: 'lantern',
  archived: false,
  ...over,
});

/** The month the screens sit in, which is also the window most tests ask for. */
const OCT = { start: '2026-10-01', end: '2026-10-31' };

/**
 * September spent 60 of a 100 allowance on a carry envelope, so October starts with 40. October has
 * a 40 expense with a note today, a 500 income on the 23rd, a deleted 10 expense today, a check-in
 * today, a no-spend yesterday, this week's review, and a stray check-in back in September.
 */
async function seeded(): Promise<ReturnType<typeof testDb>> {
  const db = testDb('facts');
  const w = ctx();
  await saveEnvelope(db, food());
  await saveEnvelope(db, fun());
  await saveGoal(db, fund());
  await saveGoal(
    db,
    fund({ id: 'g0', name: 'Old fund', target: 20_00, saved: 20_00, archived: true }),
  );
  await writeTransaction(
    db,
    { kind: 'expense', amount: 60_00, envelopeId: 'food', date: '2026-09-12' },
    w,
  );
  await writeTransaction(
    db,
    { kind: 'expense', amount: 40_00, envelopeId: 'food', date: TODAY, note: 'Gabi ng halo-halo' },
    w,
  );
  await writeTransaction(db, { kind: 'income', amount: 500_00, date: '2026-10-23' }, w);
  const thrownAway = await writeTransaction(
    db,
    { kind: 'expense', amount: 10_00, envelopeId: 'food', date: TODAY },
    w,
  );
  await deleteTransaction(db, thrownAway.id, clock);
  await grantMany(db, [
    ...checkinReward('2026-09-30'),
    ...nospendReward('2026-10-24'),
    ...checkinReward(TODAY),
    ...reviewReward(isoWeekId(TODAY), '2026-10-21'),
  ]);
  await closeEndedPeriods(db, clock);
  return db;
}

describe('loadFacts', () => {
  it('reads the whole book into one snapshot', async () => {
    const db = await seeded();
    const facts = await loadFacts(db, {
      today: TODAY,
      window: OCT,
      flags: { backupCreated: true },
    });

    expect(facts.txnCount).toBe(2); // October only, and the deleted entry is not a row
    expect(facts.noteCount).toBe(1);
    expect(facts.checkinCount).toBe(1); // September's check-in is outside the window
    expect(facts.nospendCount).toBe(1);
    expect(facts.reviewCount).toBe(1);
    expect(facts.transferCount).toBe(0);
    expect(facts.recurringCount).toBe(0);
    expect(facts.goalContributions).toBe(0);
    expect(facts.archivedEnvelopeCount).toBe(1);
    expect(facts.envelopeStates.map((e) => e.envelopeId)).toEqual(['food']);
    // 40 spent of a 100 allowance plus the 40 September carried in.
    expect(facts.envelopeStates[0]).toMatchObject({ percentUsed: 29, entriesLogged: 1 });
    // An archived goal is still history: archiving hides it from the screens, it does not undo it.
    expect([...facts.goalReachedGoalIds].sort()).toEqual(['g0', 'g1']);
    // 60 saved against an average of 50 spent per month.
    expect(facts.emergencyFundRatio).toBe(1.2);
    expect(facts.level).toBe(2); // 90 xp in the ledger
    expect(facts.weekEnvelopeUnder80).toBe(true);
    expect(facts).toMatchObject({
      backupCreated: true,
      installedToHomeScreen: false,
      usedOffline: false,
    });
  });

  it('counts the rest tokens for every month the book has run through', async () => {
    const db = testDb('facts-tokens');
    const w = ctx();
    // Activity on the 21st, 23rd and 25th. The month grants two tokens, spent on the 22nd and 24th
    // instead of breaking the run.
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: '2026-10-21' }, w);
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: '2026-10-23' }, w);
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: TODAY }, w);
    const facts = await loadFacts(db, { today: TODAY, window: OCT });
    expect(facts.streak).toBe(5);
    expect(facts.longestStreak).toBe(5);
  });

  it('starts the token count at the first entry even when it long predates any check-in', async () => {
    const db = testDb('facts-tokens-txn');
    const w = ctx();
    // Three months of book (Aug 15, Oct 23, Oct 25) but the only check-in is today, so the run is
    // held up by 6 tokens and reaches 8 before it runs out.
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: '2026-08-15' }, w);
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: '2026-10-23' }, w);
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: TODAY }, w);
    await grantMany(db, checkinReward(TODAY));
    const facts = await loadFacts(db, { today: TODAY, window: OCT });
    expect(facts.longestStreak).toBe(8);
  });

  it('starts the token count at a check-in when that was the first thing done', async () => {
    const db = testDb('facts-tokens-checkin');
    const w = ctx();
    await grantMany(db, checkinReward('2026-08-30'));
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: '2026-10-23' }, w);
    await writeTransaction(db, { kind: 'expense', amount: 1_00, date: TODAY }, w);
    const facts = await loadFacts(db, { today: TODAY, window: OCT });
    expect(facts.longestStreak).toBe(8);
  });

  it('scopes the counts to the window but the money to the period', async () => {
    const db = await seeded();
    const facts = await loadFacts(db, {
      today: TODAY,
      window: { start: '2026-10-24', end: TODAY },
    });
    expect(facts.txnCount).toBe(1);
    expect(facts.checkinCount).toBe(1);
    expect(facts.nospendCount).toBe(1);
    expect(facts.reviewCount).toBe(0);
    // The envelope still reports the month: a two-day window is not a two-day budget.
    expect(facts.envelopeStates[0]).toMatchObject({ percentUsed: 29, entriesLogged: 1 });
    expect(facts.weekEnvelopeUnder80).toBe(false);
  });

  it('gives a usable snapshot to a book with nothing in it', async () => {
    const db = testDb('facts-empty');
    const facts = await loadFacts(db, { today: TODAY, window: OCT });
    expect(facts).toMatchObject({
      txnCount: 0,
      activeDates: [],
      envelopeStates: [],
      goalReachedGoalIds: [],
      archivedEnvelopeCount: 0,
      streak: 0,
      longestStreak: 0,
      emergencyFundRatio: 0,
      level: 1,
      backupCreated: false,
    });
    expect(facts.weekEnvelopeUnder80).toBe(false);
  });

  it('measures money against the period start day the user chose', async () => {
    const db = testDb('facts-start-day');
    const w = ctx();
    const settings = await getSettings(db);
    await saveSettings(db, { ...settings, periodStartDay: 15 });
    await saveEnvelope(db, food());
    await writeTransaction(
      db,
      { kind: 'expense', amount: 60_00, envelopeId: 'food', date: '2026-09-20' },
      w,
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 30_00, envelopeId: 'food', date: '2026-10-05' },
      w,
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 40_00, envelopeId: 'food', date: TODAY },
      w,
    );
    await closeEndedPeriods(db, clock);

    const period = periodOf(TODAY, 15);
    expect(period.id).toBe('2026-10-15');
    const facts = await loadFacts(db, { today: TODAY, window: period });
    // The close that ended on the 14th left 10 behind, and only the 25th falls inside the 15th-to-
    // 14th period. A calendar-month read would say 64% used from two entries.
    expect(facts.envelopeStates[0]).toMatchObject({ percentUsed: 36, entriesLogged: 1 });
    expect(facts.txnCount).toBe(1);
  });
});
