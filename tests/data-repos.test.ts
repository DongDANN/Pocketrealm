/**
 * Gate 2 — repositories (SPEC 3/4). The screens must never touch Dexie directly: this is the only
 * place that writes rows, it soft-deletes transactions, and it stamps the injected clock so the
 * core's "no Date.now() in core" rule survives contact with storage.
 */

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/data/db';
import {
  contributeToGoal,
  deleteTransaction,
  editTransaction,
  getCompanion,
  getEnvelope,
  getSettings,
  listEnvelopes,
  listRecurrings,
  listTransactions,
  markRecurringGenerated,
  recordPurchase,
  saveCompanion,
  saveEnvelope,
  saveSettings,
  setQuestProgress,
  unlockAchievement,
  upsertRecurring,
  writeTransaction,
} from '../src/data/repos';
import type { Clock } from '../src/core/types';
import { testDb } from './data-harness';

const clock = (ms: number, date: string): Clock => ({ now: () => ms, today: () => date });
const DAY1 = clock(1_760_000_000_000, '2026-10-04');
const DAY2 = clock(1_760_086_400_000, '2026-10-05');

/** Deterministic ids so tests can assert on them. */
function idSeq(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe('settings', () => {
  it('falls back to the documented defaults on a fresh install', async () => {
    const db = testDb('settings-default');
    const s = await getSettings(db);
    expect(s).toEqual({
      currency: 'PHP',
      locale: 'en-PH',
      periodStartDay: 1,
      theme: 'system',
      reducedMotion: 'system',
      // Silent until a touch says otherwise (SPEC §15.10).
      sound: false,
      restTokensPerMonth: 2,
      schemaVersion: SCHEMA_VERSION,
    });
    db.close();
  });

  it('saves once and updates in place', async () => {
    const db = testDb('settings-save');
    const first = await getSettings(db);
    await saveSettings(db, { ...first, currency: 'USD', periodStartDay: 15 });
    const again = await saveSettings(db, { ...(await getSettings(db)), sound: true });
    expect(again.currency).toBe('USD');
    expect(again.periodStartDay).toBe(15);
    expect(again.sound).toBe(true);
    expect(await db.settings.count()).toBe(1);
    db.close();
  });
});

describe('transactions', () => {
  it('writes an expense with the injected clock and id', async () => {
    const db = testDb('txn-write');
    const txn = await writeTransaction(
      db,
      {
        kind: 'expense',
        amount: 12_500,
        envelopeId: 'groceries',
        date: '2026-10-04',
        note: 'Talaba',
      },
      { clock: DAY1, newId: idSeq('txn') },
    );
    expect(txn).toEqual({
      id: 'txn-1',
      kind: 'expense',
      amount: 12_500,
      envelopeId: 'groceries',
      date: '2026-10-04',
      note: 'Talaba',
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
    });
    await expect(db.transactions.get('txn-1')).resolves.toEqual(txn);
    db.close();
  });

  it('keeps a transfer between envelopes and an occurrence key when given', async () => {
    const db = testDb('txn-transfer');
    const txn = await writeTransaction(
      db,
      {
        kind: 'transfer',
        amount: 5_000,
        envelopeId: 'groceries',
        toEnvelopeId: 'savings',
        date: '2026-10-04',
        recurringId: 'rent',
        occurrenceKey: 'rec:rent:2026-10-04',
      },
      { clock: DAY1, newId: idSeq('txn') },
    );
    expect(txn.toEnvelopeId).toBe('savings');
    expect(txn.occurrenceKey).toBe('rec:rent:2026-10-04');
    db.close();
  });

  it('lists a date range newest-first and hides deleted rows', async () => {
    const db = testDb('txn-list');
    const ctx = { clock: DAY1, newId: idSeq('txn') };
    await writeTransaction(
      db,
      { kind: 'expense', amount: 1_00, envelopeId: 'a', date: '2026-10-01' },
      ctx,
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 2_00, envelopeId: 'a', date: '2026-10-03' },
      ctx,
    );
    await writeTransaction(db, { kind: 'income', amount: 9_00, date: '2026-10-20' }, ctx);
    await writeTransaction(
      db,
      { kind: 'expense', amount: 3_00, envelopeId: 'a', date: '2026-10-02' },
      ctx,
    );
    await deleteTransaction(db, 'txn-2', DAY2);

    const within = await listTransactions(db, { from: '2026-10-01', to: '2026-10-05' });
    expect(within.map((t) => t.id)).toEqual(['txn-4', 'txn-1']);
    expect(await listTransactions(db)).toHaveLength(3);
    expect((await listTransactions(db, { includeDeleted: true })).map((t) => t.id)).toContain(
      'txn-2',
    );
    db.close();
  });

  it('edits in place, bumping updatedAt and keeping createdAt', async () => {
    const db = testDb('txn-edit');
    await writeTransaction(
      db,
      { kind: 'expense', amount: 1_00, envelopeId: 'a', date: '2026-10-01', note: 'wrong' },
      { clock: DAY1, newId: idSeq('txn') },
    );
    const edited = await editTransaction(db, 'txn-1', { amount: 2_50, note: 'fixed' }, DAY2);
    expect(edited?.amount).toBe(2_50);
    expect(edited?.note).toBe('fixed');
    expect(edited?.createdAt).toBe(1_760_000_000_000);
    expect(edited?.updatedAt).toBe(1_760_086_400_000);
    await expect(db.transactions.count()).resolves.toBe(1);
    db.close();
  });

  it('soft-deletes without losing the row', async () => {
    const db = testDb('txn-delete');
    await writeTransaction(
      db,
      { kind: 'expense', amount: 1_00, envelopeId: 'a', date: '2026-10-01' },
      { clock: DAY1, newId: idSeq('txn') },
    );
    const gone = await deleteTransaction(db, 'txn-1', DAY2);
    expect(gone?.deletedAt).toBe(1_760_086_400_000);
    await expect(db.transactions.count()).resolves.toBe(1);
    expect(await listTransactions(db)).toHaveLength(0);
    db.close();
  });

  it('filters by envelope and by recurring rule', async () => {
    const db = testDb('txn-filter');
    const ctx = { clock: DAY1, newId: idSeq('txn') };
    await writeTransaction(
      db,
      { kind: 'expense', amount: 1_00, envelopeId: 'a', date: '2026-10-01' },
      ctx,
    );
    await writeTransaction(
      db,
      { kind: 'expense', amount: 2_00, envelopeId: 'b', date: '2026-10-02', recurringId: 'rent' },
      ctx,
    );
    expect((await listTransactions(db, { envelopeId: 'b' })).map((t) => t.id)).toEqual(['txn-2']);
    expect((await listTransactions(db, { recurringId: 'rent' })).map((t) => t.id)).toEqual([
      'txn-2',
    ]);
    db.close();
  });
});

describe('envelopes, goals, recurrings, companion', () => {
  it('saves envelopes and lists them by sortOrder, hiding archived ones', async () => {
    const db = testDb('envelopes');
    await saveEnvelope(db, {
      id: 'b',
      name: 'Bills',
      icon: 'lamp',
      colorKey: 'moss',
      monthlyAllowance: 500_00,
      rollover: 'none',
      archived: false,
      sortOrder: 2,
    });
    await saveEnvelope(db, {
      id: 'a',
      name: 'Groceries',
      icon: 'basket',
      colorKey: 'ember',
      monthlyAllowance: 800_00,
      rollover: 'carry',
      archived: false,
      sortOrder: 1,
    });
    const rows = await listEnvelopes(db);
    expect(rows.map((e) => e.id)).toEqual(['a', 'b']);
    await saveEnvelope(db, { ...rows[1]!, archived: true });
    expect((await listEnvelopes(db)).map((e) => e.id)).toEqual(['a']);
    expect((await listEnvelopes(db, { includeArchived: true })).map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
    expect((await getEnvelope(db, 'b'))?.archived).toBe(true);
    db.close();
  });

  it('contributes to a goal without overwriting its other fields', async () => {
    const db = testDb('goals');
    await db.goals.add({
      id: 'emergency',
      name: 'Emergency fund',
      target: 5000_00,
      saved: 0,
      icon: 'jar',
      archived: false,
    });
    const after = await contributeToGoal(db, 'emergency', 1000_00);
    expect(after).toMatchObject({ saved: 1000_00, name: 'Emergency fund' });
    expect(await contributeToGoal(db, 'missing', 100)).toBeNull();
    db.close();
  });

  it('stores recurring rules and remembers the last generated date', async () => {
    const db = testDb('recurrings');
    await upsertRecurring(db, {
      id: 'rent',
      template: { kind: 'expense', amount: 1500_00, envelopeId: 'rent' },
      cadence: 'monthly',
      startDate: '2026-09-01',
    });
    expect(await listRecurrings(db)).toHaveLength(1);
    await markRecurringGenerated(db, 'rent', '2026-10-01');
    const [rule] = await listRecurrings(db);
    expect(rule?.lastGenerated).toBe('2026-10-01');
    await upsertRecurring(db, { ...rule!, endDate: '2026-12-31' });
    expect((await listRecurrings(db))[0]?.endDate).toBe('2026-12-31');
    await expect(db.recurrings.count()).resolves.toBe(1);
    db.close();
  });

  it('keeps one companion row and updates it in place', async () => {
    const db = testDb('companion');
    expect(await getCompanion(db)).toBeNull();
    await saveCompanion(db, {
      id: 'warden',
      speciesKey: 'warden',
      name: 'Warden',
      cosmetics: [],
      equipped: {},
    });
    await saveCompanion(db, {
      id: 'warden',
      speciesKey: 'warden',
      name: 'Lantern Warden',
      cosmetics: ['hat-ember'],
      equipped: { hat: 'hat-ember' },
    });
    const c = await getCompanion(db);
    expect(c?.name).toBe('Lantern Warden');
    await expect(db.companions.count()).resolves.toBe(1);
    db.close();
  });
});

describe('quest, achievement and purchase state', () => {
  it('writes quest progress keyed by quest and period', async () => {
    const db = testDb('quests');
    await setQuestProgress(db, { questId: 'log-3', periodId: '2026-10-04', progress: 2 });
    await setQuestProgress(db, { questId: 'log-3', periodId: '2026-10-04', progress: 3 });
    expect(await db.questProgress.count()).toBe(1);
    const rows = await db.questProgress.where('periodId').equals('2026-10-04').toArray();
    expect(rows[0]).toMatchObject({ questId: 'log-3', progress: 3 });
    db.close();
  });

  it('unlocks an achievement once and never overwrites the first timestamp', async () => {
    const db = testDb('achievements');
    await unlockAchievement(db, 'first-log', DAY1);
    await unlockAchievement(db, 'first-log', DAY2);
    const row = await db.achievements.get('first-log');
    expect(row).toEqual({ id: 'first-log', unlockedAt: 1_760_000_000_000 });
    db.close();
  });

  it('records cosmetic purchases with the clock and cost', async () => {
    const db = testDb('purchases');
    await recordPurchase(db, { cosmeticId: 'hat-ember', cost: 40 }, DAY1);
    await recordPurchase(db, { cosmeticId: 'skin-moss', cost: 90 }, DAY2);
    const rows = await db.purchases.toArray();
    expect(rows.map((r) => [r.cosmeticId, r.at, r.cost])).toEqual([
      ['hat-ember', 1_760_000_000_000, 40],
      ['skin-moss', 1_760_086_400_000, 90],
    ]);
    db.close();
  });
});
