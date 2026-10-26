import { useCallback, useState } from 'react';
import { syncEarnedAchievements } from '../../data/achievementsStore';
import { recordBackup } from '../../data/backups';
import { APP_VERSION } from '../../version';
import { useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { announceAchievements } from '../lib/achievements';
import { say } from '../lib/toast';

function downloadJson(text: string, filename: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** The one export path, shared by Settings and the Today reminder. */
export function useBackupExport(): {
  exportBook: (reason: 'manual' | 'reminder') => Promise<boolean>;
  busy: boolean;
  error: string;
} {
  const { db, ctx } = useSession();
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const exportBook = useCallback(
    async (reason: 'manual' | 'reminder') => {
      if (busy) return false;
      setBusy(true);
      setError('');
      try {
        const now = ctx.clock.now();
        // The export schema and its validator are only needed on the day of a backup. Keeping that
        // chunk out of the first copy is worth one short wait behind the button.
        const { exportDatabase } = await import('../../data/exportImport');
        const text = await exportDatabase(db, { now, appVersion: APP_VERSION });
        downloadJson(text, `pocketrealm-${today}.json`);
        await recordBackup(db, text, { reason, now });
        say('A full backup file is in your downloads.', 'reward');
        try {
          announceAchievements(await syncEarnedAchievements(db, ctx, { backupCreated: true }));
        } catch {
          // The file is already safe; a badge failing to write must not read as a failed backup.
        }
        return true;
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, ctx, db, today],
  );

  return { exportBook, busy, error };
}
