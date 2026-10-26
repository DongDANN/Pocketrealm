import { syncEarnedAchievements } from '../../data/achievementsStore';
import type { PocketDb } from '../../data/db';
import type { WriteContext } from '../../data/repos';
import { announceAchievements } from './achievements';

/**
 * Called right after a new entry is safely on disk while the browser reports no network. The entry
 * is what earns "Lantern in the dark"; opening the app offline is not enough.
 */
export async function payOfflineEntry(db: PocketDb, ctx: WriteContext): Promise<void> {
  if (navigator.onLine) return;
  try {
    announceAchievements(await syncEarnedAchievements(db, ctx, { usedOffline: true }));
  } catch {
    // The entry is already saved; a badge failing to write must not turn a save into an error.
  }
}
