/**
 * Gate 2 — migrations from a stored v1 fixture (SPEC 10). A database written by the old
 * budget-only schema must open through the production builder, keep every row, gain the new tables,
 * and have `occurrenceKey` backfilled so the recurring generator cannot double-log a rent payment.
 */

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { emptyMeta, newRun, type DelveMeta, type RunState } from '../src/core/delve';
import { occurrenceKey } from '../src/core/recurring';
import type { RewardEvent, Transaction } from '../src/core/types';
import {
  DB_TABLES,
  SCHEMA_VERSION,
  openDatabase,
  type DelveMetaRow,
  type DelveRunRow,
} from '../src/data/db';
import {
  LEGACY_STORES,
  MIGRATIONS,
  V2_STORES,
  upgradeDelveRowsToV3,
  upgradeToV2,
} from '../src/data/migrations';

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

/* --------------------------------------------------------------------------------------------
 * Gate 7b — v3 settles the away-play model out of existence.
 *
 * The app is live, so a real player can be mid-run the moment this build opens. The update deletes
 * the thing that was playing their run for them, so `upgradeToV3` has to leave that run no worse off
 * than an ordinary retreat: every Ember it had earned, its materials, and a capsule for the oil it
 * paid in. DELVE_REDESIGN §10.2, and the one migration in this project that touches money-adjacent
 * state, so it is tested from a stored fixture rather than from a comment.
 * ------------------------------------------------------------------------------------------ */

/** The v3 fields, absent from a row a v2 build actually wrote. */
function asV2<T extends object>(value: T, keys: string[]): T {
  const copy = { ...value } as Record<string, unknown>;
  for (const key of keys) delete copy[key];
  return copy as T;
}

const V3_META_FIELDS = [
  'skills',
  'knownSkills',
  'equippedSkills',
  'dust',
  'capsules',
  'capsuleIndex',
  'pitySinceEpic',
  'capsuleTagStreak',
];

/** The three run-state fields v3 adds: a v2 book has none of them, not even as undefined. */
const V3_RUN_FIELDS = ['orders', 'floorRule', 'skipOutstanding'];

/** A run state as v2 would have stored it: none of the v3 keys at all, plus whatever the case overrides. */
function v2Run(over: Partial<RunState> = {}): RunState {
  return { ...asV2(newRun(0xa11ce, 1, 5, emptyMeta()), V3_RUN_FIELDS), ...over };
}

const V2_ACTIVE = v2Run({
  runId: 'run-active',
  stepIndex: 5,
  embersEarned: 34,
  materials: { ore: 3, herb: 2, echo: 0 },
  log: [{ step: 4, type: 'combat', text: 'Tollbug falls.' }],
});

const V2_PENDING = v2Run({
  runId: 'run-pending',
  hollowId: 2,
  stepIndex: 3,
  embersEarned: 12,
  materials: { ore: 1, herb: 0, echo: 0 },
  pendingChoice: {
    kind: 'boon',
    options: [{ id: 'boon-emberwarden', label: 'Emberwarden' }],
    reason: 'A boon rests on the pedestal.',
    stepIndex: 3,
  },
});

const V2_DAILY = v2Run({
  runId: 'run-daily',
  daily: true,
  stepIndex: 4,
  embersEarned: 9,
  materials: { ore: 2, herb: 2, echo: 2 },
});

const V2_CLEARED = v2Run({
  runId: 'run-cleared',
  stepIndex: 20,
  result: 'cleared',
  embersEarned: 50,
});

function v2Meta(): DelveMeta & { cards: string[] } {
  const writtenByV2 = asV2(emptyMeta(), V3_META_FIELDS);
  return { ...writtenByV2, cards: ['card-steady', 'card-ember', 'card-scout'] };
}

/** The two Delve tables as a v2 build would have left them, plus one unrelated row to spare. */
function v2Rows(): {
  meta: DelveMetaRow[];
  runs: DelveRunRow[];
} {
  const row = (state: RunState, result = state.result): DelveRunRow => ({
    runId: state.runId,
    startedAt: 1_760_000_000_000,
    updatedAt: 1_760_000_000_000,
    hollowId: state.hollowId,
    result,
    stepIndex: state.stepIndex,
    daily: state.daily,
    state,
  });
  return {
    meta: [
      {
        key: 'meta',
        value: { ...v2Meta(), embers: 100, materials: { ore: 0, herb: 0, echo: 0 } },
        oil: 40,
        updatedAt: 1_760_000_000_000,
      },
    ],
    runs: [V2_ACTIVE, V2_PENDING, V2_DAILY, V2_CLEARED].map((state) => row(state)),
  };
}

/** Writes a real v2 database, the way the release before the turn loop left it. */
async function writeV2Db(
  factory: IDBFactory,
  name: string,
  rows: { meta: DelveMetaRow[]; runs: DelveRunRow[] },
): Promise<void> {
  const old = new Dexie(name, { indexedDB: factory, IDBKeyRange: globalThis.IDBKeyRange });
  old.version(1).stores(LEGACY_STORES);
  old.version(2).stores(V2_STORES).upgrade(upgradeToV2);
  await old.open();
  await old.table('delveMeta').bulkAdd(rows.meta as never[]);
  await old.table('delveRuns').bulkAdd(rows.runs as never[]);
  await old.table('transactions').bulkAdd([
    {
      id: 'txn-rent',
      kind: 'expense',
      amount: 150_000,
      envelopeId: 'rent',
      date: '2026-10-01',
      createdAt: 1_760_000_000_000,
      updatedAt: 1_760_000_000_000,
      recurringId: 'rent-monthly',
      // A v2 build already backfilled this; v3 must leave the budgeting rows exactly as they are.
      occurrenceKey: occurrenceKey('rent-monthly', '2026-10-01'),
    } as Transaction,
  ]);
  old.close();
}

describe('v3 settles a run the update leaves behind', () => {
  it('retreats an active run at 100% of its Embers and says why', async () => {
    const factory = new IDBFactory();
    const rows = v2Rows();
    await writeV2Db(factory, 'v3-settle', rows);

    const db = openDatabase({ name: 'v3-settle', indexedDB: factory });
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);

    const settled = await db.delveRuns.get('run-active');
    expect(settled?.result).toBe('retreated');
    expect(settled?.state.result).toBe('retreated');
    expect(settled?.state.pendingChoice).toBeNull();
    // Still a run in history, at the step it reached.
    expect(settled?.stepIndex).toBe(5);
    const log = settled?.state.log.map((entry) => entry.text).join(' | ') ?? '';
    expect(log).toContain('update');
    expect(log).toContain('Embers banked');
    // The reason gets the last word: an engine "Retreat:" line as the final entry would read as a
    // decision the player never made.
    expect(settled?.state.log.at(-1)?.text).toContain('The update ended this run in camp');

    const meta = await db.delveMeta.get('meta');
    // 34 from the active run and 12 from the pending one; the Daily banks nothing, and the
    // cleared run already banked its own.
    expect(meta?.value.embers).toBe(100 + 34 + 12);
    expect(meta?.value.runsRetreated).toBe(2);
    // The Daily is isolated from permanent progress, so its materials stay with it.
    expect(meta?.value.materials).toEqual({ ore: 4, herb: 2, echo: 0 });
    db.close();
  });

  it('settles a run that was waiting on a choice, and leaves a finished run alone', async () => {
    const factory = new IDBFactory();
    await writeV2Db(factory, 'v3-pending', v2Rows());
    const db = openDatabase({ name: 'v3-pending', indexedDB: factory });
    await db.open();

    const pending = await db.delveRuns.get('run-pending');
    expect(pending?.result).toBe('retreated');
    expect(pending?.state.pendingChoice).toBeNull();

    const cleared = await db.delveRuns.get('run-cleared');
    expect(cleared?.result).toBe('cleared');
    expect(cleared?.state.embersEarned).toBe(50);
    expect(cleared?.state.log).toEqual([]);
    db.close();
  });

  it('turns equipped Habit Cards into Skill Dust and grants a capsule per abandoned run', async () => {
    const factory = new IDBFactory();
    await writeV2Db(factory, 'v3-dust', v2Rows());
    const db = openDatabase({ name: 'v3-dust', indexedDB: factory });
    await db.open();

    const meta = await db.delveMeta.get('meta');
    expect(meta?.value.dust).toBe(15); // three cards, five dust each
    expect(meta?.value.cards).toEqual([]);
    // One capsule per non-Daily run that was taken away, at its Hollow's ceiling: Rootfall reaches
    // Rare, the second Hollow reaches Epic. The Daily cost no oil, so it grants nothing.
    expect(meta?.value.capsules).toEqual({ rare: 1, epic: 1 });
    expect(meta?.value.capsuleIndex).toBe(2);
    db.close();
  });

  it('gives every stored run the fields v3 assumes, and touches nothing else', async () => {
    const factory = new IDBFactory();
    await writeV2Db(factory, 'v3-shape', v2Rows());
    const db = openDatabase({ name: 'v3-shape', indexedDB: factory });
    await db.open();

    const runs = await db.delveRuns.toArray();
    expect(runs).toHaveLength(4);
    for (const run of runs) {
      expect(run.state.orders).toEqual([]);
      expect(run.state.floorRule).toBeNull();
      expect(run.state.skipOutstanding).toBe(false);
    }

    const meta = await db.delveMeta.get('meta');
    expect(meta?.value.skills).toEqual({});
    expect(meta?.value.knownSkills).toEqual([]);
    expect(meta?.value.equippedSkills).toEqual([]);
    expect(meta?.value.pitySinceEpic).toBe(0);
    expect(meta?.value.capsuleTagStreak).toBe(0);
    // The wallet and the budgeting rows are not the Delve's to rewrite.
    expect(meta?.oil).toBe(40);
    const txn = await db.transactions.get('txn-rent');
    expect(txn?.occurrenceKey).toBe(occurrenceKey('rent-monthly', '2026-10-01'));
    db.close();
  });

  it('runs once: reopening an upgraded book settles nothing twice', async () => {
    const factory = new IDBFactory();
    await writeV2Db(factory, 'v3-twice', v2Rows());

    const first = openDatabase({ name: 'v3-twice', indexedDB: factory });
    await first.open();
    first.close();
    const second = openDatabase({ name: 'v3-twice', indexedDB: factory });
    await second.open();

    const meta = await second.delveMeta.get('meta');
    expect(meta?.value.embers).toBe(100 + 34 + 12);
    expect(meta?.value.dust).toBe(15);
    expect(meta?.value.capsules).toEqual({ rare: 1, epic: 1 });
    await expect(second.delveRuns.count()).resolves.toBe(4);
    second.close();
  });

  it('carries a v1 book through both upgrades in one open', async () => {
    const factory = new IDBFactory();
    await writeLegacyDb(factory, 'v3-from-v1');
    const db = openDatabase({ name: 'v3-from-v1', indexedDB: factory });
    await db.open();

    expect(db.verno).toBe(SCHEMA_VERSION);
    const row = await db.delveMeta.get('meta');
    expect(row?.oil).toBe(0); // v2's backfill
    expect(row?.value.dust).toBe(0); // v3's defaults, on a book that never ran
    expect(row?.value.capsules).toEqual({});
    await expect(db.transactions.count()).resolves.toBe(3);
    db.close();
  });
});

describe('upgradeDelveRowsToV3, the same code a v2 backup file goes through', () => {
  const TODAY = '2026-10-27';

  it('is a pure pass over the rows it is given', () => {
    const rows = v2Rows();
    const before = JSON.stringify(rows);
    const out = upgradeDelveRowsToV3(rows, TODAY);

    expect(JSON.stringify(rows)).toBe(before); // input untouched
    expect(out.runs.find((r) => r.runId === 'run-active')?.result).toBe('retreated');
    expect(out.meta[0]?.value.dust).toBe(15);
  });

  it('settles nothing twice when a file is imported into a book that already moved', () => {
    const once = upgradeDelveRowsToV3(v2Rows(), TODAY);
    const twice = upgradeDelveRowsToV3(once, TODAY);
    expect(twice).toEqual(once);
  });

  it('fills what a stored run lacks and leaves what it already carries', () => {
    const rows = v2Rows();
    const live = rows.runs.find((r) => r.runId === 'run-active')!;
    live.state.floorRule = 'guard-reflects';
    live.state.skipOutstanding = true;

    const settled = upgradeDelveRowsToV3(rows, TODAY).runs.find((r) => r.runId === 'run-active')!;
    // The settlement rewrites the run's result and log; a rule it was told to keep survives it.
    expect(settled.result).toBe('retreated');
    expect(settled.state.floorRule).toBe('guard-reflects');
    expect(settled.state.skipOutstanding).toBe(true);
  });

  it('keeps the daily Embers cap honest about the date it is given', () => {
    const rows = upgradeDelveRowsToV3(v2Rows(), TODAY);
    const meta = rows.meta[0]!.value;
    expect(meta.embersDay).toBe(TODAY);
    expect(meta.embersToday).toBe(46);
  });
});
