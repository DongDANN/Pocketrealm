/**
 * Gate 2c — JSON export and import (SPEC 10). An export is one readable file with a schema version,
 * the app version and every table; an import is validated with zod, previewed, and then applied
 * inside a single Dexie transaction after an automatic backup of whatever was there before.
 *
 * What zod validates: the fields storage and queries actually depend on — primary keys, indexes,
 * enums, and the rule that money is integer minor units. A float amount is refused rather than
 * rounded, because a file that drifted from the schema is a corrupted file, not a formatting choice.
 * Deep engine state (`RunState`, `DelveMeta`) is validated on the fields the persistence layer
 * branches on; its internal determinism is covered by the golden-run and fuzz suites in core.
 *
 * `backups` is excluded from both sides on purpose: a snapshot must not carry its own history, and
 * importing can never delete the safety copy the import itself just made.
 */

import { z } from 'zod';
import type { IndexableType, Table } from 'dexie';
import type { LocalDate } from '../core/types';
import { SCHEMA_VERSION, type PocketDb, type TableName } from './db';

export const EXPORT_APP = 'pocketrealm' as const;

const EXPORTED: readonly TableName[] = [
  'settings',
  'envelopes',
  'transactions',
  'goals',
  'recurrings',
  'rewards',
  'companions',
  'achievements',
  'purchases',
  'delveRuns',
  'delveMeta',
  'questProgress',
  'periodCloses',
];

/** The tables an export can carry, in schema order. `backups` is deliberately absent. */
export const EXPORTED_TABLES = EXPORTED;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const int = z.number().int();
const runResult = z.enum(['active', 'cleared', 'retreated', 'fainted']);

const settingsRow = z.looseObject({
  key: z.string().min(1),
  value: z.looseObject({
    currency: z.string().min(1),
    locale: z.string().min(1),
    periodStartDay: int.min(1).max(28),
    theme: z.enum(['system', 'light', 'dark']),
    reducedMotion: z.enum(['system', 'on', 'off']),
    sound: z.boolean(),
    restTokensPerMonth: int.min(0),
    schemaVersion: int.min(1),
  }),
});

const envelopeRow = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  colorKey: z.string(),
  monthlyAllowance: int,
  rollover: z.enum(['none', 'carry', 'sweep-to-goal']),
  archived: z.boolean(),
  sortOrder: int,
});

const transactionRow = z.looseObject({
  id: z.string().min(1),
  kind: z.enum(['expense', 'income', 'transfer']),
  /** Minor units: ₱12.50 is 1250, never 12.5. */
  amount: int.min(0),
  date,
  createdAt: int,
  updatedAt: int,
  envelopeId: z.string().optional(),
  toEnvelopeId: z.string().optional(),
  goalId: z.string().optional(),
  note: z.string().optional(),
  deletedAt: int.optional(),
  recurringId: z.string().optional(),
  occurrenceKey: z.string().optional(),
});

const goalRow = z.looseObject({
  id: z.string().min(1),
  name: z.string().min(1),
  target: int.min(0),
  saved: int,
  icon: z.string(),
  archived: z.boolean(),
  dueDate: date.optional(),
});

const recurringRow = z.looseObject({
  id: z.string().min(1),
  cadence: z.enum(['weekly', 'biweekly', 'monthly']),
  startDate: date,
  endDate: date.optional(),
  lastGenerated: date.optional(),
  template: z.looseObject({
    kind: z.enum(['expense', 'income', 'transfer']),
    amount: int.min(0),
  }),
});

const rewardRow = z.looseObject({
  // No key means no idempotence, which is the one thing the ledger cannot do without.
  key: z.string().min(1),
  type: z.string().min(1),
  xp: int.min(0),
  sparks: int.min(0),
  oil: int.min(0).optional(),
  at: date,
});

const companionRow = z.looseObject({
  id: z.string().min(1),
  speciesKey: z.string(),
  name: z.string(),
  cosmetics: z.array(z.string()),
  equipped: z.record(z.string(), z.string()),
});

const achievementRow = z.looseObject({
  id: z.string().min(1),
  unlockedAt: int.optional(),
});

const purchaseRow = z.looseObject({
  seq: int.optional(),
  cosmeticId: z.string().min(1),
  cost: int.min(0),
  at: int,
});

const delveRunRow = z.looseObject({
  runId: z.string().min(1),
  startedAt: int,
  updatedAt: int,
  hollowId: int.min(1),
  result: runResult,
  stepIndex: int.min(0),
  daily: z.boolean(),
  state: z.looseObject({
    runId: z.string().min(1),
    stepIndex: int.min(0),
    floor: int.min(0),
    result: runResult,
  }),
});

const delveMetaRow = z.looseObject({
  key: z.string().min(1),
  oil: int.min(0),
  updatedAt: int,
  value: z.looseObject({
    embers: int.min(0),
    runsStarted: int.min(0),
    runsCleared: int.min(0),
    embersToday: int.min(0),
  }),
});

const questProgressRow = z.looseObject({
  questId: z.string().min(1),
  periodId: z.string().min(1),
  progress: int.min(0),
  completedAt: int.optional(),
  claimedAt: int.optional(),
});

const periodCloseRow = z.looseObject({
  periodId: z.string().min(1),
  start: date,
  end: date,
  totalSaved: int,
  activeDays: int.min(0),
  perEnvelope: z.array(
    z.looseObject({
      envelopeId: z.string().min(1),
      name: z.string(),
      allowance: int,
      carryIn: int,
      spent: int,
      result: int,
      rollover: z.enum(['none', 'carry', 'sweep-to-goal']),
      swept: int,
    }),
  ),
});

const TABLE_SCHEMAS: Partial<Record<TableName, z.ZodType>> = {
  settings: z.array(settingsRow),
  envelopes: z.array(envelopeRow),
  transactions: z.array(transactionRow),
  goals: z.array(goalRow),
  recurrings: z.array(recurringRow),
  rewards: z.array(rewardRow),
  companions: z.array(companionRow),
  achievements: z.array(achievementRow),
  purchases: z.array(purchaseRow),
  delveRuns: z.array(delveRunRow),
  delveMeta: z.array(delveMetaRow),
  questProgress: z.array(questProgressRow),
  periodCloses: z.array(periodCloseRow),
};

const exportFileSchema = z.looseObject({
  app: z.literal(EXPORT_APP),
  schemaVersion: int.min(1),
  appVersion: z.string(),
  exportedAt: int,
  tables: z.record(z.string(), z.array(z.unknown())),
});

/** A payload, with every table it carries validated into typed rows. */
export interface ExportPayload {
  app: typeof EXPORT_APP;
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface ImportPreview {
  schemaVersion: number;
  appVersion: string;
  exportedAt: number;
  counts: Partial<Record<TableName, number>>;
  /** Span of the transaction dates in the file, so the preview can say "Oct 2026 entries". */
  dateRange: { from?: LocalDate; to?: LocalDate };
}

export interface ImportProblem {
  /** Where the file broke, e.g. `tables.transactions[1].amount`. */
  path: string;
  message: string;
}

export type InspectOutcome =
  | { ok: true; payload: ExportPayload; preview: ImportPreview }
  | { ok: false; problems: ImportProblem[] };

export interface ImportOptions {
  mode: 'merge' | 'replace';
  /** Epoch ms stamped on the backup row; injected, never read from the clock here. */
  now: number;
  /** The running build, recorded in the backup so a future you knows what wrote it. */
  appVersion?: string;
}

export type ImportOutcome =
  | {
      ok: true;
      mode: 'merge' | 'replace';
      rowsWritten: number;
      rowsSkipped: number;
      backupId: number;
    }
  | { ok: false; problems: ImportProblem[] };

function problemPath(
  tables: string,
  name: string,
  issuePath: readonly (string | number | symbol)[],
) {
  const rest = issuePath.map((part) =>
    typeof part === 'number' ? `[${part}]` : `.${String(part)}`,
  );
  return `${tables}.${name}${rest.join('')}`.replace(/\.(\[\d+\])/g, '$1');
}

function tableProblems(name: string, rows: unknown[], schema: z.ZodType): ImportProblem[] {
  const result = schema.safeParse(rows);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    path: problemPath('tables', name, issue.path),
    message: issue.message,
  }));
}

/**
 * Parse and validate a file without touching a database. Returns per-row problems instead of one
 * opaque error, because "your file is invalid" is not something a person can act on.
 */
export function inspectImport(text: string): InspectOutcome {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      problems: [{ path: 'file', message: error instanceof Error ? error.message : 'not JSON' }],
    };
  }

  const file = exportFileSchema.safeParse(raw);
  if (!file.success) {
    return {
      ok: false,
      problems: file.error.issues.map((issue) => ({
        path: issue.path.length === 0 ? 'file' : issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }

  const problems: ImportProblem[] = [];
  const data = file.data;
  if (data.app !== EXPORT_APP) problems.push({ path: 'app', message: `not a ${EXPORT_APP} file` });
  if (data.schemaVersion > SCHEMA_VERSION) {
    problems.push({
      path: 'schemaVersion',
      message: `file is schema v${data.schemaVersion}, this build is v${SCHEMA_VERSION}`,
    });
  }

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!(EXPORTED_TABLES as readonly string[]).includes(name)) {
      problems.push({ path: `tables.${name}`, message: 'unknown table' });
      continue;
    }
    const schema = TABLE_SCHEMAS[name as TableName];
    if (!schema) continue;
    const tableProblemsFor = tableProblems(name, rows, schema);
    if (tableProblemsFor.length > 0) {
      problems.push(...tableProblemsFor);
      continue;
    }
    tables[name] = rows as Record<string, unknown>[];
  }

  if (problems.length > 0) return { ok: false, problems };

  const counts: Partial<Record<TableName, number>> = {};
  for (const [name, rows] of Object.entries(tables)) counts[name as TableName] = rows.length;

  const dates = (tables.transactions ?? [])
    .map((row) => row.date)
    .filter((d): d is string => typeof d === 'string')
    .sort();
  const dateRange =
    dates.length > 0
      ? { from: dates[0] as LocalDate, to: dates[dates.length - 1] as LocalDate }
      : {};

  return {
    ok: true,
    payload: { ...data, tables },
    preview: {
      schemaVersion: data.schemaVersion,
      appVersion: data.appVersion,
      exportedAt: data.exportedAt,
      counts,
      dateRange,
    },
  };
}

async function readTables(db: PocketDb): Promise<Record<string, unknown[]>> {
  const tables: Record<string, unknown[]> = {};
  for (const name of EXPORTED_TABLES) tables[name] = await db.table(name).toArray();
  return tables;
}

/** The whole database as a readable JSON file. */
export async function exportDatabase(
  db: PocketDb,
  options: { now: number; appVersion: string },
): Promise<string> {
  const envelope = {
    app: EXPORT_APP,
    schemaVersion: SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: options.now,
    tables: await readTables(db),
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Apply a file. Validation happens first, so a rejected file never opens a transaction; the backup
 * and every write then share one transaction, so a failure rolls the import back completely.
 */
export async function importDatabase(
  db: PocketDb,
  text: string,
  options: ImportOptions,
): Promise<ImportOutcome> {
  const inspected = inspectImport(text);
  if (!inspected.ok) return { ok: false, problems: inspected.problems };
  const { payload } = inspected;
  const merge = options.mode === 'merge';

  return db.transaction(
    'rw',
    [db.backups, ...EXPORTED_TABLES.map((name) => db.table(name))],
    async () => {
      const snapshot = {
        app: EXPORT_APP,
        schemaVersion: SCHEMA_VERSION,
        appVersion: options.appVersion ?? 'unknown',
        exportedAt: options.now,
        tables: await readTables(db),
      };
      const backupId = await db.backups.add({
        at: options.now,
        schemaVersion: SCHEMA_VERSION,
        reason: 'pre-import',
        json: JSON.stringify(snapshot),
      });

      let rowsWritten = 0;
      let rowsSkipped = 0;
      for (const name of EXPORTED_TABLES) {
        const rows = payload.tables[name];
        if (!rows) continue; // A file may carry a subset; the rest of the database is left alone.
        const table = db.table(name);
        if (!merge) await table.clear();
        for (const row of rows) {
          if (merge) {
            const key = primaryKeyOf(table, row);
            if (key !== undefined && (await table.get(key))) {
              rowsSkipped += 1;
              continue;
            }
          }
          await table.put(row);
          rowsWritten += 1;
        }
      }
      return { ok: true as const, mode: options.mode, rowsWritten, rowsSkipped, backupId };
    },
  );
}

/** The stored row's primary key, compound keys included. */
function primaryKeyOf(table: Table, row: Record<string, unknown>): IndexableType | undefined {
  const keyPath = table.schema.primKey.keyPath;
  if (Array.isArray(keyPath)) {
    const parts = keyPath.map((key) => row[key]);
    return parts.every((part) => part === undefined) ? undefined : (parts as IndexableType);
  }
  if (!keyPath) return undefined;
  return row[keyPath] as IndexableType | undefined;
}
