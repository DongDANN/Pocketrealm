/**
 * Gate 3c — the two Settings promises that touch every row: a manual backup remembers when and why
 * it was taken, and "delete all data" leaves no table behind. Both run over the real Dexie schema.
 */

import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../src/data/db';
import { latestBackup, recordBackup } from '../src/data/backups';
import { wipeBook } from '../src/data/wipe';
import { saveEnvelope, saveSettings } from '../src/data/repos';
import { defaultSettings } from '../src/data/seed';
import { testDb } from './data-harness';

async function seed(db: ReturnType<typeof testDb>) {
  await saveSettings(db, defaultSettings());
  await saveEnvelope(db, {
    id: 'food',
    name: 'Food',
    icon: 'jar',
    colorKey: 'moss',
    monthlyAllowance: 10_000,
    rollover: 'none',
    archived: false,
    sortOrder: 0,
  });
}

describe('recordBackup and latestBackup', () => {
  it('keeps the snapshot, its reason and its schema stamp', async () => {
    const db = testDb('backup-record');
    const row = await recordBackup(db, '{"hello":"book"}', {
      reason: 'manual',
      now: 1_700_000_000_000,
    });

    expect(row.id).toBeTypeOf('number');
    expect(row.at).toBe(1_700_000_000_000);
    expect(row.reason).toBe('manual');
    expect(row.schemaVersion).toBe(SCHEMA_VERSION);
    expect(row.json).toBe('{"hello":"book"}');
    expect(await db.backups.get(row.id!)).toEqual(row);
  });

  it('answers with the newest backup even when it was written first', async () => {
    const db = testDb('backup-latest');
    await recordBackup(db, '{"n":1}', { reason: 'pre-import', now: 300 });
    await recordBackup(db, '{"n":2}', { reason: 'manual', now: 100 });
    await recordBackup(db, '{"n":3}', { reason: 'reminder', now: 200 });

    const newest = await latestBackup(db);
    expect(newest?.json).toBe('{"n":1}');
    expect(newest?.reason).toBe('pre-import');
  });

  it('says nothing when the book has never been backed up', async () => {
    const db = testDb('backup-empty');
    expect(await latestBackup(db)).toBeUndefined();
  });
});

describe('wipeBook', () => {
  it('clears every table, including the backups that could restore it', async () => {
    const db = testDb('wipe-all');
    await seed(db);
    await recordBackup(db, '{"before":"wipe"}', { reason: 'manual', now: 1 });
    await db.goals.add({
      id: 'trip',
      name: 'Trip',
      target: 100_000,
      saved: 0,
      icon: 'spark',
      archived: false,
    });

    await wipeBook(db);

    for (const name of db.tables.map((table) => table.name)) {
      expect(await db.table(name).count(), name).toBe(0);
    }
    expect(await db.companions.count()).toBe(0);
    expect(await db.settings.count()).toBe(0);
  });

  it('leaves the database usable for a fresh start', async () => {
    const db = testDb('wipe-reuse');
    await seed(db);
    await wipeBook(db);

    await saveSettings(db, defaultSettings());
    expect(await db.settings.count()).toBe(1);
    expect(await db.envelopes.count()).toBe(0);
  });
});
