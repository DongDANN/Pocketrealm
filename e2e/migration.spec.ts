/**
 * Gate 7b-1 — the v3 migration over a real saved book (DELVE_REDESIGN §10, §15.4).
 *
 * The unit fixture replays the same upgrade on fake-indexeddb. This one boots the built app over
 * Chromium's own IndexedDB, which is the only place that can prove the two things that put live
 * saves at risk: a version bump that declares no stores still opens, and a book whose run was left
 * mid-Hollow comes out of the upgrade transaction settled and readable instead of wedged.
 */

import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { dateOf } from '../src/core/dates';
import { occurrenceKey } from '../src/core/recurring';
import { envelopesFromTemplate } from '../src/core/templates';
import {
  emptyMeta,
  newRun,
  stepRun,
  type BudgetSignals,
  type DelveMeta,
  type RunState,
  type StepContext,
} from '../src/core/delve';
import type { Companion, Envelope, Transaction } from '../src/core/types';
import { DB_NAME, SCHEMA_VERSION, type DelveMetaRow, type DelveRunRow } from '../src/data/db';
import { CARD_DUST_VALUE, LEGACY_STORES, V2_STORES } from '../src/data/migrations';
import { defaultSettings } from '../src/data/seed';
import { allText, pinClockAndIds } from './helpers';

/** Pinned so the seeded dates, the browser clock and the upgrade's `today()` are one day. */
const AT = '2026-10-25T09:00:00';
const NOW = Date.parse(AT);
const TODAY = dateOf(NOW);

/** A primary or index key path: Dexie writes a compound key as `[a+b]`. */
function keyPathOf(token: string): string | string[] {
  if (token.startsWith('[')) {
    const close = token.indexOf(']');
    if (close < 0) throw new Error(`cannot read the Dexie token "${token}"`);
    return token.slice(1, close).split('+');
  }
  if (/[*?.[\]&+]/.test(token)) throw new Error(`the e2e seed cannot express "${token}"`);
  return token;
}

interface SeedIndex {
  name: string;
  keyPath: string | string[];
  unique: boolean;
}

/**
 * Reads a Dexie store spec ("++seq, cosmeticId") as plain IndexedDB. The seed has to build the old
 * database without Dexie, so this is the one place the schema is expressed twice — and it is derived
 * from the exported specs, never retyped, so it cannot drift from what the app declares.
 */
function storeOf(
  name: string,
  spec: string,
): { name: string; keyPath: string | string[]; auto: boolean; indexes: SeedIndex[] } {
  const [head, ...rest] = spec.split(',').map((token) => token.trim());
  const auto = head!.startsWith('++');
  const keyPath = keyPathOf(auto ? head!.slice(2) : head!);
  const indexes = rest.map((token) => {
    const unique = token.startsWith('&');
    const bare = unique ? token.slice(1) : token;
    return { name: bare, keyPath: keyPathOf(bare), unique };
  });
  return { name, keyPath, auto, indexes };
}

const V2_SCHEMA = Object.entries({ ...LEGACY_STORES, ...V2_STORES }).map(([name, spec]) =>
  storeOf(name, spec),
);

const SIGNALS: BudgetSignals = {
  checkedInToday: true,
  envelopesWithinAllowance: 4,
  contributedToGoalLast7d: true,
  reviewedLast7d: true,
};

/** The eight fields v3 adds to the meta row; a v2 save has none of them, not even as undefined. */
const V3_META_KEYS = [
  'skills',
  'knownSkills',
  'equippedSkills',
  'dust',
  'capsules',
  'capsuleIndex',
  'pitySinceEpic',
  'capsuleTagStreak',
] as const;

type PreV3Meta = Omit<DelveMeta, (typeof V3_META_KEYS)[number]>;

/** The keys v3 adds to a stored run; a v2 run row has none of them either. */
const V3_RUN_KEYS = ['orders', 'floorRule', 'skipOutstanding'];

/**
 * Removes what a version had not written yet. The seeded rows must be genuinely old-shaped, because
 * a key stored as `undefined` is not the same thing to the migration as a key that is absent — and
 * the cast is the point of the exercise: the stored bytes predate the type that reads them.
 */
function asV2<T>(value: object, keys: string[]): T {
  const bare = { ...value } as Record<string, unknown>;
  for (const key of keys) delete bare[key];
  return bare as T;
}

/** The meta an actual pre-turn-loop save holds, banked on a day that is not today so the cap cannot bite. */
function v2Meta(): PreV3Meta {
  return {
    ...asV2<PreV3Meta>(emptyMeta(), [...V3_META_KEYS]),
    embers: 10,
    embersDay: dateOf(NOW - 86_400_000),
    embersToday: 0,
    cards: ['rainy-day', 'shield-up', 'mark-hunter'],
    runsStarted: 3,
    runsRetreated: 1,
    maxSeenAt: NOW - 3_600_000,
    lastStepAt: NOW - 3_600_000,
  };
}

/** Steps a real run until it is standing mid-Hollow with something earned, exactly as v2 left it. */
function activeRun(meta: DelveMeta): { state: RunState; meta: DelveMeta } {
  const ctx: StepContext = {
    now: NOW,
    oil: 200,
    oilCapacity: 200,
    signals: SIGNALS,
    meta,
    policy: { mode: 'autopilot', tagPriority: ['guard'], retreatHpPercent: 30, route: 'balanced' },
    today: TODAY,
  };
  let run = newRun(4242, 1, 5, meta);
  let value = meta;
  for (let i = 0; i < 6 && run.result === 'active'; i += 1) {
    const out = stepRun(run, { ...ctx, meta: value });
    run = out.run;
    value = out.meta;
  }
  return { state: asV2<RunState>(run, V3_RUN_KEYS), meta: value };
}

interface Book {
  metaBefore: PreV3Meta;
  active: DelveRunRow;
  cleared: DelveRunRow;
  envelopes: Envelope[];
  transaction: Transaction;
}

function buildBook(): Book {
  const stored = v2Meta();
  // The engine only ever sees the current shape, so the run is stepped on a meta that has it; the
  // row is then written back without those keys, which is what the version that saved it stored.
  const { state, meta: steppedMeta } = activeRun({ ...emptyMeta(), ...stored });
  const metaBefore = asV2<PreV3Meta>(steppedMeta, [...V3_META_KEYS]);
  const envelopes = envelopesFromTemplate('essentials', 2_500_000, () => randomUUID());
  const active: DelveRunRow = {
    runId: state.runId,
    startedAt: NOW - 900_000,
    updatedAt: NOW - 60_000,
    hollowId: state.hollowId,
    result: state.result,
    stepIndex: state.stepIndex,
    daily: false,
    state,
  };
  const cleared: DelveRunRow = {
    runId: 'run-long-ago',
    startedAt: NOW - 86_400_000,
    updatedAt: NOW - 43_200_000,
    hollowId: 1,
    result: 'cleared',
    stepIndex: 24,
    daily: false,
    state: { ...state, runId: 'run-long-ago', result: 'cleared', embersEarned: 0 },
  };
  const transaction: Transaction = {
    id: 'txn-seeded',
    date: TODAY,
    kind: 'expense',
    amount: 12_500,
    note: 'Groceries',
    envelopeId: envelopes[0]!.id,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 86_400_000,
    recurringId: 'rec-groceries',
    occurrenceKey: occurrenceKey('rec-groceries', TODAY),
  };
  return { metaBefore, active, cleared, envelopes, transaction };
}

/** Writes the old book with raw IndexedDB, before the app has ever opened the database. */
async function seedV2Book(page: Page, book: Book): Promise<void> {
  await page.evaluate(
    async ({ dbName, schema, rows }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        // Dexie stores its schema version multiplied by ten, so 20 is what a v2 book really holds.
        // Seeding a plain 2 would make Dexie replay every version it knows instead of only v3.
        const request = indexedDB.open(dbName, 20);
        request.onupgradeneeded = () => {
          const target = request.result;
          for (const store of schema) {
            const created = target.createObjectStore(store.name, {
              keyPath: store.keyPath,
              autoIncrement: store.auto,
            });
            for (const index of store.indexes) {
              created.createIndex(index.name, index.keyPath, { unique: index.unique });
            }
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('the seed connection was blocked'));
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(Object.keys(rows), 'readwrite');
        for (const [name, list] of Object.entries(rows)) {
          for (const row of list as Record<string, unknown>[]) tx.objectStore(name).put(row);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    {
      dbName: DB_NAME,
      schema: V2_SCHEMA,
      rows: {
        settings: [{ key: 'book', value: defaultSettings(), updatedAt: NOW }],
        envelopes: book.envelopes,
        companions: [
          {
            id: 'cmp-seeded',
            speciesKey: 'mossling',
            name: 'Toto',
            cosmetics: [],
            equipped: {},
          } as Companion,
        ],
        transactions: [book.transaction],
        delveMeta: [
          { key: 'meta', value: book.metaBefore, oil: 12, updatedAt: NOW } as DelveMetaRow,
        ],
        delveRuns: [book.active, book.cleared],
      },
    },
  );
}

/** Reads the book back through raw IndexedDB, so the assertions are about storage, not the app's own view. */
async function readBook(
  page: Page,
): Promise<{ version: number; rows: Record<string, Record<string, unknown>[]> }> {
  return page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const names = Array.from(db.objectStoreNames);
    const rows = await new Promise<Record<string, Record<string, unknown>[]>>((resolve, reject) => {
      const tx = db.transaction(names, 'readonly');
      const out: Record<string, Record<string, unknown>[]> = {};
      let pending = names.length;
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          out[name] = request.result as Record<string, unknown>[];
          if (--pending === 0) resolve(out);
        };
        request.onerror = () => reject(request.error);
      }
    });
    const version = db.version;
    db.close();
    return { version, rows };
  }, DB_NAME);
}

test('a saved v2 book is settled by the update, in the browser that saved it', async ({ page }) => {
  test.setTimeout(120_000);
  await pinClockAndIds(page, AT);
  const book = buildBook();
  expect(book.active.result).toBe('active');
  expect(book.active.state.embersEarned).toBeGreaterThan(0);

  // A static file on the same origin: the app never boots, so the database is still absent.
  await page.goto('/icons/icon-192.png');
  await seedV2Book(page, book);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();

  const { version, rows } = await readBook(page);
  const runs = rows.delveRuns as unknown as DelveRunRow[];
  const settled = runs.find((row) => row.runId === book.active.runId)!;
  const meta = (rows.delveMeta as unknown as DelveMetaRow[]).find(
    (row) => row.key === 'meta',
  )!.value;

  expect(version, 'the app itself carried the book to v3').toBe(SCHEMA_VERSION * 10);
  expect(settled.result).toBe('retreated');
  expect(settled.state.orders).toEqual([]);
  expect(settled.state.floorRule).toBeNull();
  expect(settled.state.skipOutstanding).toBe(false);
  expect(settled.state.log.at(-1)?.text).toContain('The update ended this run in camp');
  expect(meta.cards).toEqual([]);
  expect(meta.dust).toBe(book.metaBefore.cards.length * CARD_DUST_VALUE);
  expect(meta.capsules).toEqual({ rare: 1 });
  expect(meta.capsuleIndex).toBe(1);
  expect(meta.embers).toBe(book.metaBefore.embers + book.active.state.embersEarned);
  expect(meta.runsRetreated).toBe(book.metaBefore.runsRetreated + 1);

  const untouched = runs.find((row) => row.runId === 'run-long-ago')!;
  expect(untouched.state.result).toBe('cleared');
  expect(rows.transactions).toEqual([book.transaction]);
  expect(rows.settings).toHaveLength(1);

  // Run history is where the settlement shows itself to the player: the run the update ended reads
  // as a retreat, and nothing is left marked as still in progress.
  await page.goto('/delve/history');
  await expect(page.locator('.codex-row')).toHaveCount(2);
  const lines = await allText(page, '.codex-row');
  expect(lines.join(' ')).toContain('Retreated');
  expect(lines.join(' ')).not.toContain('Still delving');

  expect(errors).toEqual([]);
});
