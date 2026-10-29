/**
 * Gate 2c — JSON export/import (SPEC 10: "Import: validate with zod and the schema version, show a
 * preview (counts, date range), auto-create a backup of the current data first, then offer merge or
 * replace with confirmation; abort cleanly on any error with no partial writes").
 */

import { describe, expect, it, vi } from 'vitest';
import { emptyMeta, newRun, resolveChoice, stepRun, type RunState } from '../src/core/delve';
import type { Clock, Envelope } from '../src/core/types';
import { DB_TABLES, SCHEMA_VERSION, type PocketDb } from '../src/data/db';
import { commitBatch } from '../src/data/delveStore';
import {
  EXPORTED_TABLES,
  exportDatabase,
  importDatabase,
  inspectImport,
} from '../src/data/exportImport';
import { grantReward } from '../src/data/ledger';
import {
  getSettings,
  recordPurchase,
  saveEnvelope,
  saveSettings,
  writeTransaction,
} from '../src/data/repos';
import { testDb } from './data-harness';
import { mkCtx } from './delve-helpers';

const clock = (ms: number, date: string): Clock => ({ now: () => ms, today: () => date });
const DAY1 = clock(1_760_000_000_000, '2026-10-04');
const NOW = 1_760_000_000_000;

function ids(rows: { id?: string; key?: string; runId?: string }[]) {
  return rows.map((r) => r.id ?? r.key ?? r.runId).sort();
}

/** A database with one row in every interesting shape: money, ledger, receipts and a live run. */
async function seed(db: PocketDb, options: { txnId?: string; amount?: number } = {}) {
  const ctx = { clock: DAY1, newId: () => options.txnId ?? 'seed-1' };
  await saveSettings(db, await getSettings(db));
  await saveEnvelope(db, {
    id: 'rent',
    name: 'Rent',
    icon: 'house',
    colorKey: 'ember',
    monthlyAllowance: 150_000,
    rollover: 'carry',
    archived: false,
    sortOrder: 0,
  });
  await writeTransaction(
    db,
    { kind: 'expense', amount: options.amount ?? 12_000, envelopeId: 'rent', date: '2026-10-04' },
    ctx,
  );
  await writeTransaction(
    db,
    { kind: 'income', amount: 50_000, date: '2026-10-06' },
    { ...ctx, newId: () => 'seed-2' },
  );
  await grantReward(db, { key: 'log:seed-1', type: 'log', xp: 5, sparks: 0, at: '2026-10-04' });
  await recordPurchase(db, { cosmeticId: 'hat-ember', cost: 40 }, DAY1);

  const meta = emptyMeta();
  const run = newRun(21, 1, 4, meta);
  // Walk until the run has entered its first room, so the fixture stores a real step.
  let stepped = run;
  let steppedMeta = meta;
  for (let i = 0; i < 50 && stepped.stepIndex === 0; i++) {
    if (stepped.pendingChoice) {
      const out = resolveChoice(stepped, mkCtx(steppedMeta), stepped.pendingChoice.options[0]!.id);
      stepped = out.run;
      steppedMeta = out.meta;
      continue;
    }
    const out = stepRun(stepped, mkCtx(steppedMeta));
    stepped = out.run;
    steppedMeta = out.meta;
  }
  await commitBatch(db, {
    run: stepped,
    meta: steppedMeta,
    oil: 100,
    ledger: [],
    today: '2026-10-04',
    now: NOW,
  });
}

/** A hand-written payload, so a bad file is really bad rather than a copy of a good one. */
function payload(tables: Record<string, unknown[]>, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    app: 'pocketrealm',
    schemaVersion: SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt: NOW,
    tables,
    ...over,
  });
}

const ENVELOPE: Envelope = {
  id: 'food',
  name: 'Food',
  icon: 'bowl',
  colorKey: 'moss',
  monthlyAllowance: 20_000,
  rollover: 'none',
  archived: false,
  sortOrder: 1,
};

describe('export', () => {
  it('writes every table with the app, schema and app version', async () => {
    const db = testDb('export-shape');
    await seed(db);

    const file = JSON.parse(await exportDatabase(db, { now: NOW, appVersion: '1.2.3' }));
    expect(file).toMatchObject({
      app: 'pocketrealm',
      schemaVersion: SCHEMA_VERSION,
      appVersion: '1.2.3',
      exportedAt: NOW,
    });
    // Backups are deliberately excluded: a snapshot must not carry its own history.
    expect([...EXPORTED_TABLES].sort()).toEqual(DB_TABLES.filter((t) => t !== 'backups').sort());
    expect(Object.keys(file.tables).sort()).toEqual([...EXPORTED_TABLES].sort());
    expect(file.tables.transactions).toHaveLength(2);
    expect(file.tables.delveRuns).toHaveLength(1);
    expect(file.tables.backups).toBeUndefined();
    db.close();
  });
});

describe('import', () => {
  it('round trips a full database into an empty one', async () => {
    const source = testDb('roundtrip-src');
    const target = testDb('roundtrip-dst');
    await seed(source);

    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });
    const result = await importDatabase(target, text, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(true);

    for (const name of EXPORTED_TABLES) {
      expect(await target.table(name).toArray(), `${name} differs`).toEqual(
        await source.table(name).toArray(),
      );
    }
    source.close();
    target.close();
  });

  it('refuses a file from a newer schema version and writes nothing', async () => {
    const db = testDb('import-newer');
    const result = await importDatabase(
      db,
      payload({ envelopes: [ENVELOPE] }, { schemaVersion: SCHEMA_VERSION + 1 }),
      { mode: 'replace', now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.some((p) => p.path === 'schemaVersion')).toBe(true);
    }
    await expect(db.envelopes.count()).resolves.toBe(0);
    db.close();
  });

  it('refuses a file from a different app', async () => {
    const db = testDb('import-other-app');
    const result = await importDatabase(
      db,
      payload({ envelopes: [ENVELOPE] }, { app: 'otherrealm' }),
      { mode: 'replace', now: NOW },
    );
    expect(result.ok).toBe(false);
    await expect(db.envelopes.count()).resolves.toBe(0);
    db.close();
  });

  it('names the table and row that fail validation, and writes nothing at all', async () => {
    const db = testDb('import-bad-row');
    const text = payload({
      envelopes: [ENVELOPE],
      transactions: [
        {
          id: 'ok-1',
          kind: 'expense',
          amount: 1_000,
          date: '2026-10-04',
          createdAt: NOW,
          updatedAt: NOW,
        },
        // Amounts are integer minor units: a float is corruption, not a rounding choice.
        {
          id: 'bad-1',
          kind: 'expense',
          amount: 12.5,
          date: '2026-10-04',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });

    const inspected = inspectImport(text);
    expect(inspected.ok).toBe(false);
    if (!inspected.ok) {
      // The person holding the file needs the row and the field, not "invalid".
      expect(inspected.problems.map((p) => p.path)).toContain('tables.transactions[1].amount');
    }

    const result = await importDatabase(db, text, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(false);
    // The valid table was not applied either: an import is all of it or none of it.
    await expect(db.envelopes.count()).resolves.toBe(0);
    await expect(db.transactions.count()).resolves.toBe(0);
    db.close();
  });

  it('rejects text that is not JSON at all', async () => {
    const inspected = inspectImport('{"app": "pocketrealm", ');
    expect(inspected.ok).toBe(false);
    if (!inspected.ok) expect(inspected.problems[0]!.path).toBe('file');
  });

  it('reports unknown tables instead of ignoring them', async () => {
    const db = testDb('import-unknown-table');
    const result = await importDatabase(db, payload({ wallets: [ENVELOPE] }), {
      mode: 'replace',
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.some((p) => p.path === 'tables.wallets')).toBe(true);
    db.close();
  });

  it('previews counts and the date range without touching the database', async () => {
    const source = testDb('preview-src');
    const target = testDb('preview-dst');
    await seed(source);
    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });

    const inspected = inspectImport(text);
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) throw new Error('unreachable');
    expect(inspected.preview.counts).toMatchObject({ transactions: 2, envelopes: 1, rewards: 1 });
    expect(inspected.preview.dateRange).toEqual({ from: '2026-10-04', to: '2026-10-06' });
    await expect(target.transactions.count()).resolves.toBe(0);
    source.close();
    target.close();
  });

  it('backs up the current data inside the same transaction as a replace', async () => {
    const source = testDb('backup-src');
    const target = testDb('backup-dst');
    await seed(source);
    // The target has one different row, which the backup has to preserve.
    await seed(target, { txnId: 'local-1', amount: 9_900 });
    const localTxns = ids(await target.transactions.toArray());

    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });
    const result = await importDatabase(target, text, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(true);

    const backups = await target.backups.toArray();
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ reason: 'pre-import', schemaVersion: SCHEMA_VERSION });
    const snapshot = JSON.parse(backups[0]!.json);
    expect(ids(snapshot.tables.transactions)).toEqual(localTxns);
    // And the replace actually replaced.
    expect(ids(await target.transactions.toArray())).toEqual(
      ids(await source.transactions.toArray()),
    );
    source.close();
    target.close();
  });

  it('merge keeps local rows and only adds what is missing', async () => {
    const source = testDb('merge-src');
    const target = testDb('merge-dst');
    await seed(source);
    await seed(target, { txnId: 'seed-1', amount: 9_900 });
    // An envelope the source does not have: a merge must leave it alone.
    await saveEnvelope(target, ENVELOPE);
    const before = await target.transactions.toArray();

    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });
    const result = await importDatabase(target, text, { mode: 'merge', now: NOW });
    expect(result.ok).toBe(true);

    const after = await target.transactions.toArray();
    // The local edit to seed-1 survives a merge: local wins, the file never overwrites it.
    expect(after.find((t) => t.id === 'seed-1')?.amount).toBe(9_900);
    expect(ids(after)).toEqual(ids(before));
    expect((await target.envelopes.toArray()).map((e) => e.id).sort()).toEqual(['food', 'rent']);
    // A merge changes data too, so it gets the same auto-backup as a replace.
    const backups = await target.backups.toArray();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.reason).toBe('pre-import');
    expect(JSON.parse(backups[0]!.json).tables.transactions).toHaveLength(2);
    source.close();
    target.close();
  });

  it('leaves data and backups untouched when a replace is rejected', async () => {
    const db = testDb('import-abort');
    await seed(db);
    const txns = await db.transactions.toArray();
    const settings = await db.settings.toArray();

    const bad = payload({
      envelopes: [ENVELOPE],
      // A reward event without a key cannot be idempotent, so the whole file is refused.
      rewards: [{ type: 'log', xp: 5, sparks: 0, at: '2026-10-04' }],
    });
    const result = await importDatabase(db, bad, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(false);
    expect(await db.transactions.toArray()).toEqual(txns);
    expect(await db.settings.toArray()).toEqual(settings);
    await expect(db.envelopes.count()).resolves.toBe(1); // only the seeded 'rent'
    await expect(db.backups.count()).resolves.toBe(0); // no orphan backup from a failed import
    db.close();
  });

  it('rolls back the writes and the backup when a replace fails halfway', async () => {
    const source = testDb('rollback-src');
    const target = testDb('rollback-dst');
    await seed(source);
    await seed(target, { txnId: 'local-1', amount: 9_900 });
    const localTxns = await target.transactions.toArray();

    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });

    // Envelopes are applied before transactions, so a write that dies partway through the file has
    // already left the database half-replaced — and orphaned the backup nobody agreed to keep.
    vi.spyOn(target.table('transactions'), 'put').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(importDatabase(target, text, { mode: 'replace', now: NOW })).rejects.toThrow(
      'quota',
    );
    vi.restoreAllMocks();

    expect(await target.transactions.toArray()).toEqual(localTxns); // the clear rolled back too
    expect((await target.envelopes.toArray()).map((e) => e.id)).toEqual(['rent']);
    await expect(target.backups.count()).resolves.toBe(0);
    source.close();
    target.close();
  });
});

/**
 * Gate 7b §10.3: a v2 backup file still imports, and it goes through the same settlement the
 * database upgrade does. A restored book must not hand back a run this build cannot advance.
 */
describe('importing a book written before the turn loop', () => {
  it('settles its active run and pays the cards and the oil back', async () => {
    const db = testDb('import-v2-settle');
    const state: RunState = {
      ...newRun(0xa11ce, 1, 5, emptyMeta()),
      stepIndex: 5,
      embersEarned: 34,
    };
    // A v2 file has none of the v3 run keys at all, which is the exact hole the settlement fills.
    for (const key of ['orders', 'floorRule', 'skipOutstanding', 'skipRewardsLeft']) {
      delete (state as unknown as Record<string, unknown>)[key];
    }
    const text = payload(
      {
        delveMeta: [
          {
            key: 'meta',
            oil: 40,
            updatedAt: NOW,
            value: {
              ...emptyMeta(),
              cards: ['card-steady', 'card-ember', 'card-scout'],
              embers: 100,
            },
          },
        ],
        delveRuns: [
          {
            runId: state.runId,
            startedAt: NOW,
            updatedAt: NOW,
            hollowId: 1,
            result: 'active',
            stepIndex: 5,
            daily: false,
            state,
          },
        ],
      },
      { schemaVersion: 2 },
    );

    const result = await importDatabase(db, text, { mode: 'replace', now: NOW });
    expect(result.ok).toBe(true);

    const run = await db.delveRuns.get(state.runId);
    expect(run?.result).toBe('retreated');
    expect(run?.state.orders).toEqual([]);
    const meta = await db.delveMeta.get('meta');
    expect(meta?.value.embers).toBe(134);
    expect(meta?.value.dust).toBe(15);
    expect(meta?.value.capsules).toEqual({ rare: 1 });
    db.close();
  });

  it('leaves a v3 file exactly as it was written', async () => {
    const source = testDb('import-v3-src');
    const target = testDb('import-v3-dst');
    await seed(source);
    const text = await exportDatabase(source, { now: NOW, appVersion: '1.0.0' });

    expect((await importDatabase(target, text, { mode: 'replace', now: NOW })).ok).toBe(true);
    expect(await target.delveRuns.toArray()).toEqual(await source.delveRuns.toArray());
    expect(await target.delveMeta.toArray()).toEqual(await source.delveMeta.toArray());
    source.close();
    target.close();
  });
});
