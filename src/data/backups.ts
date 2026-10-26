/** Manual backups and the last-backup date Settings shows. IDs stay numbers, like pre-import backups. */

import { dateOf, daysBetween } from '../core/dates';
import type { LocalDate } from '../core/types';
import type { BackupReason, BackupRow, PocketDb } from './db';
import { SCHEMA_VERSION } from './db';

export const BACKUP_REMINDER_DAYS = 7;
export const BACKUP_REMINDER_MIN_ENTRIES = 5;

export interface BackupReminder {
  due: boolean;
  /** Whole days since the newest backup; null when the book has never been exported. */
  ageDays: number | null;
  copy: string;
}

/** One rule for Settings and the Today nudge, so the two can never disagree about "due". */
export function backupReminder(input: {
  entries: number;
  lastBackupAt?: number;
  today: LocalDate;
}): BackupReminder {
  const ageDays =
    input.lastBackupAt === undefined ? null : daysBetween(dateOf(input.lastBackupAt), input.today);
  return {
    due:
      input.entries >= BACKUP_REMINDER_MIN_ENTRIES &&
      (ageDays === null || ageDays >= BACKUP_REMINDER_DAYS),
    ageDays,
    copy:
      input.lastBackupAt === undefined
        ? 'No backup has been made yet.'
        : `Last backup ${dateOf(input.lastBackupAt)}${
            ageDays !== null && ageDays > 0 ? ` (${ageDays} days ago)` : ' (today)'
          }.`,
  };
}

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
