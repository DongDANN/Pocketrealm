/**
 * Gate 2 — Dexie schema. The database must open with the current store set, keep every record
 * JSON-round-trippable (a PWA backup is plain JSON), and actually persist across a reopen.
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_TABLES, SCHEMA_VERSION, openDatabase, type TransactionRow } from '../src/data/db';
import { MIGRATIONS } from '../src/data/migrations';
import { testDb } from './data-harness';

const SAMPLE: TransactionRow = {
  id: 'txn-1',
  kind: 'expense',
  amount: 12_500,
  envelopeId: 'groceries',
  date: '2026-10-25',
  note: 'Wet market',
  createdAt: 1_760_000_000_000,
  updatedAt: 1_760_000_000_000,
};

describe('database schema', () => {
  it('opens at the current schema version with every table', async () => {
    const db = testDb('opens');
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect([...db.tables.map((t) => t.name)].sort()).toEqual([...DB_TABLES].sort());
    db.close();
  });

  it('round-trips a record through IndexedDB without losing or inventing fields', async () => {
    const db = testDb('roundtrip');
    await db.transactions.add(SAMPLE);
    const back = await db.transactions.get('txn-1');
    expect(back).toEqual(SAMPLE);
    // Export and backup depend on this: the stored row survives JSON.
    expect(JSON.parse(JSON.stringify(back))).toEqual(SAMPLE);
    db.close();
  });

  it('keeps data across a reopen of the same database', async () => {
    const factory = new IDBFactory();
    const first = openDatabase({ name: 'test-reopen', indexedDB: factory });
    await first.transactions.add(SAMPLE);
    first.close();

    const second = openDatabase({ name: 'test-reopen', indexedDB: factory });
    await expect(second.transactions.count()).resolves.toBe(1);
    second.close();
  });

  it('exposes the indexes the screens and lifecycle jobs query', async () => {
    const db = testDb('indexes');
    const txnIndexes = db.transactions.schema.indexes.map((i) => i.name);
    expect(txnIndexes).toContain('date');
    expect(txnIndexes).toContain('occurrenceKey');
    expect(db.questProgress.schema.primKey.keyPath).toEqual(['questId', 'periodId']);
    db.close();
  });

  it('never declares a dash-prefixed index, which IndexedDB cannot create', () => {
    // Dexie has no descending-index syntax: '-createdAt' would become an index literally named
    // "-createdAt" and blow up the upgrade transaction on a real browser too.
    for (const step of MIGRATIONS) {
      for (const spec of Object.values(step.stores ?? {})) {
        for (const index of spec.split(',')) {
          expect(index.trim().startsWith('-'), `${step.version}: ${spec}`).toBe(false);
        }
      }
    }
  });

  it('reads newest-first through a plain createdAt index at query time', async () => {
    const db = testDb('ordering');
    await db.transactions.bulkAdd([
      { ...SAMPLE, id: 'txn-old', createdAt: 1_760_000_000_000 },
      { ...SAMPLE, id: 'txn-new', createdAt: 1_760_000_900_000 },
    ]);
    const newestFirst = await db.transactions.orderBy('createdAt').reverse().primaryKeys();
    expect(newestFirst).toEqual(['txn-new', 'txn-old']);
    db.close();
  });
});
