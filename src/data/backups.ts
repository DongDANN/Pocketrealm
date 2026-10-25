/** Manual backups and the last-backup date Settings shows. IDs stay numbers, like pre-import backups. */

import type { BackupReason, BackupRow, PocketDb } from './db';
import { SCHEMA_VERSION } from './db';

export async function recordBackup(
  db: PocketDb,
  json: string,
  options: { reason: BackupReason; now: number },
): Promise<BackupRow> {
  const row: BackupRow = {
    at: options.now,
    schemaVersion: SCHEMA_VERSION,
    reason: options.reason,
    json,
  };
  const id = await db.backups.add(row);
  return { ...row, id };
}

export function latestBackup(db: PocketDb): Promise<BackupRow | undefined> {
  return db.backups.orderBy('at').reverse().first();
}
