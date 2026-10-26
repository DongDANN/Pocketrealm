import { describe, expect, it } from 'vitest';
import {
  backupReminder,
  BACKUP_REMINDER_DAYS,
  BACKUP_REMINDER_MIN_ENTRIES,
} from '../src/data/backups';

const TODAY = '2026-10-26';
const at = (date: string) => new Date(`${date}T12:00:00`).getTime();

describe('backup reminder', () => {
  it('stays quiet until the book has real activity', () => {
    expect(backupReminder({ entries: BACKUP_REMINDER_MIN_ENTRIES - 1, today: TODAY }).due).toBe(
      false,
    );
  });

  it('is due when an active book has never been exported', () => {
    const reminder = backupReminder({ entries: BACKUP_REMINDER_MIN_ENTRIES, today: TODAY });
    expect(reminder.due).toBe(true);
    expect(reminder.ageDays).toBeNull();
    expect(reminder.copy).toContain('No backup has been made yet');
  });

  it('waits the full quiet window after a backup', () => {
    const recent = backupReminder({ entries: 20, lastBackupAt: at('2026-10-22'), today: TODAY });
    expect(recent.due).toBe(false);
    expect(recent.copy).toContain('4 days ago');

    const old = backupReminder({ entries: 20, lastBackupAt: at('2026-10-19'), today: TODAY });
    expect(old.due).toBe(true);
    expect(old.ageDays).toBe(BACKUP_REMINDER_DAYS);
  });

  it('calls a backup from today current', () => {
    const reminder = backupReminder({ entries: 20, lastBackupAt: at(TODAY), today: TODAY });
    expect(reminder.due).toBe(false);
    expect(reminder.copy).toContain('(today)');
  });

  it('treats the clock going backwards as no reason to nag', () => {
    const reminder = backupReminder({ entries: 20, lastBackupAt: at('2026-10-27'), today: TODAY });
    expect(reminder.ageDays).toBe(-1);
    expect(reminder.due).toBe(false);
  });
});
