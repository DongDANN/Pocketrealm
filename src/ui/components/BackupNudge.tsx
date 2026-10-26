import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import { backupReminder, latestBackup } from '../../data/backups';
import { useAllTransactions, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { useBackupExport } from '../hooks/useBackupExport';
import { PixelButton } from './PixelButton';
import { PixelPanel } from './PixelPanel';
import { PixelText } from './PixelText';

/**
 * The visible half of the backup reminder. Settings holds the long explanation; this is the nudge
 * that appears after real activity, at the place where the user already is.
 */
export function BackupNudge() {
  const { db } = useSession();
  const today = useToday();
  const transactions = useAllTransactions();
  const backup = useLiveQuery(() => latestBackup(db), [db], null);
  const { exportBook, busy, error } = useBackupExport();

  // `null` is the live query's loading value; a book with no backup resolves to undefined.
  if (transactions === undefined || backup === null) return null;
  const reminder = backupReminder({
    entries: transactions.length,
    ...(backup ? { lastBackupAt: backup.at } : {}),
    today,
  });
  if (!reminder.due) return null;

  return (
    <PixelPanel className="remind-panel backup-nudge" aria-labelledby="backup-nudge-title">
      <h2 id="backup-nudge-title" className="panel-title">
        <PixelText text="A backup would be kind" color={C.paper0} pixelScale={3} wrap={24} />
      </h2>
      <p>
        <PixelText
          text={`${reminder.copy} This book lives only on this device; an export file is the strong guarantee.`}
          color={C.paper3}
          pixelScale={2}
          wrap={42}
        />
      </p>
      {error !== '' && (
        <p role="alert">
          <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
        </p>
      )}
      <div className="settings-actions">
        <PixelButton disabled={busy} onClick={() => void exportBook('reminder')}>
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={20} height={20} alt="" />
          <PixelText text="Export a backup now" color={C.ink900} pixelScale={2} />
        </PixelButton>
        <Link className="text-link" to="/settings">
          <PixelText text="Backup and restore →" color={C.amber2} pixelScale={2} />
        </Link>
      </div>
    </PixelPanel>
  );
}
