/**
 * Gate 2 — migrations from a stored v1 fixture (SPEC 10). A database written by the old
 * budget-only schema must open through the production builder, keep every row, gain the new tables,
 * and have `occurrenceKey` backfilled so the recurring generator cannot double-log a rent payment.
 */

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { emptyMeta } from '../src/core/delve';
import { occurrenceKey } from '../src/core/recurring';
import type { RewardEvent, Transaction } from '../src/core/types';
import { DB_TABLES, SCHEMA_VERSION, openDatabase } from '../src/data/db';
import { LEGACY_STORES, MIGRATIONS } from '../src/data/migrations';

/** A v1 database, exactly as an older build would have left it. */
const V1_FIXTURE = {
  envelopes: [
    {
      id: 'rent',
      name: 'Rent',
      icon: 'house',
      colorKey: 'ember',
      monthlyAllowance: 150_000,
      rollover: 'carry',
      archived: false,
      sortOrder: 0,
    },
  ],
  transactions: [
    // Written before occurrence keys existed: must be backfilled.
    {
      id: 'txn-rent-sep',
      kind: 'expense',
      amount: 150_000,
      envelopeId: 'rent',
      date: '2026-09-01',
      createdAt: 1_756_000_000_000,
      updatedAt: 1_756_000_000_000,
      recurringId: 'rent-monthly',
    },
    // Already carries a key: the upgrade must leave it alone.
    {
      id: 'txn-rent-oct',
      kind: 'expense',
      amount: 150_000,
      envelopeId: 'rent',
      date: '2026-10-01',
      createdAt: 1_759_000_000_000,
      updatedAt: 1_759_000_000_000,
      recurringId: 'rent-monthly',
      occurrenceKey: 'manual:key:2026-10-01',
    },
    // Not recurring: untouched.
    {
      id: 'txn-coffee',
      kind: 'expense',
      amount: 18_500,
      envelopeId: 'rent',
      date: '2026-10-04',
      createdAt: 1_759_500_000_000,
      updatedAt: 1_759_500_000_000,
    },
  ] as Transaction[],
  rewards: [
    { key: 'log:txn-coffee', type: 'log', xp: 5, sparks: 0, at: '2026-10-04' },
  ] as RewardEvent[],
  delveMeta: [{ key: 'meta', value: emptyMeta(), updatedAt: 1_759_500_000_000 }],
};

async function writeLegacyDb(factory: IDBFactory, name: string): Promise<void> {
  const legacy = new Dexie(name, { indexedDB: factory, IDBKeyRange: globalThis.IDBKeyRange });
  legacy.version(1).stores(LEGACY_STORES);
  await legacy.open();
  await legacy.table('envelopes').bulkAdd(V1_FIXTURE.envelopes as never[]);
  await legacy.table('transactions').bulkAdd(V1_FIXTURE.transactions as never[]);
  await legacy.table('rewards').bulkAdd(V1_FIXTURE.rewards as never[]);
  await legacy.table('delveMeta').bulkAdd(V1_FIXTURE.delveMeta as never[]);
  legacy.close();
}

describe('schema migrations', () => {
  it('upgrades a v1 database and backfills occurrence keys', async () => {
    const factory = new IDBFactory();
    await writeLegacyDb(factory, 'migrate-backfill');

    const db = openDatabase({ name: 'migrate-backfill', indexedDB: factory });
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);

    const sep = await db.transactions.get('txn-rent-sep');
    expect(sep?.occurrenceKey).toBe(occurrenceKey('rent-monthly', '2026-09-01'));

    const oct = await db.transactions.get('txn-rent-oct');
    expect(oct?.occurrenceKey).toBe('manual:key:2026-10-01');

    const coffee = await db.transactions.get('txn-coffee');
    expect(coffee?.occurrenceKey).toBeUndefined();

    // Nothing else changed about the rows.
    expect(sep?.amount).toBe(150_000);
    await expect(db.envelopes.count()).resolves.toBe(1);
    await expect(db.rewards.count()).resolves.toBe(1);
    db.close();
  });

  it('gives a v1 meta row the Lantern Oil balance column', async () => {
    const factory = new IDBFactory();
    await writeLegacyDb(factory, 'migrate-oil');
    const db = openDatabase({ name: 'migrate-oil', indexedDB: factory });
    await db.open();

    const row = await db.delveMeta.get('meta');
    expect(row?.oil).toBe(0);
    expect(row?.value.runsStarted).toBe(0);
    db.close();
  });

  it('creates the new v2 tables empty instead of dropping old data', async () => {
    const factory = new IDBFactory();
    await writeLegacyDb(factory, 'migrate-tables');
    const db = openDatabase({ name: 'migrate-tables', indexedDB: factory });
    await db.open();

    for (const name of ['questProgress', 'periodCloses', 'backups']) {
      const table = db.tables.find((t) => t.name === name);
      expect(table, `${name} missing after upgrade`).toBeTruthy();
      expect(await db.table(name).count()).toBe(0);
    }
    await expect(db.transactions.count()).resolves.toBe(3);
    db.close();
  });

  it('is a no-op when the database is already current', async () => {
    const factory = new IDBFactory();
    await writeLegacyDb(factory, 'migrate-twice');

    const first = openDatabase({ name: 'migrate-twice', indexedDB: factory });
    await first.open();
    first.close();

    const second = openDatabase({ name: 'migrate-twice', indexedDB: factory });
    await second.open();
    expect(second.verno).toBe(SCHEMA_VERSION);
    const sep = await second.transactions.get('txn-rent-sep');
    expect(sep?.occurrenceKey).toBe(occurrenceKey('rent-monthly', '2026-09-01'));
    await expect(second.transactions.count()).resolves.toBe(3);
    second.close();
  });

  it('keeps a fresh install on the current version with every table', async () => {
    const db = openDatabase({ name: 'migrate-fresh', indexedDB: new IDBFactory() });
    await db.open();
    expect(db.verno).toBe(MIGRATIONS.at(-1)?.version);
    expect([...db.tables.map((t) => t.name)].sort()).toEqual([...DB_TABLES].sort());
    db.close();
  });
});
