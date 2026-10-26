/**
 * Gate 3b — achievements on disk. The unlock conditions are pure core logic over BudgetFacts, so this
 * module only compares the badges already earned against the facts and writes the difference. It runs
 * on every open, which is what pays an achievement earned on a day the app was never opened — and the
 * `ach:<id>` key plus the stored unlock row is what makes sure it pays exactly once.
 */

import { ACHIEVEMENTS, newlyUnlocked, type Achievement } from '../core/achievements';
import { achievementReward } from '../core/habits';
import type { BudgetFacts } from '../core/types';
import type { PocketDb } from './db';
import { loadFacts } from './factsStore';
import { grantMany } from './ledger';
import { listAchievements, unlockAchievement, type WriteContext } from './repos';

const ALL_TIME_START = '0000-01-01';

/**
 * Pays the badges that a just-finished action earned, without waiting for the next app open. Used
 * where the app knows something true about *this moment* that the rows cannot say: an entry written
 * offline, a backup file exported, or a launch from the home screen.
 */
export async function syncEarnedAchievements(
  db: PocketDb,
  ctx: WriteContext,
  flags: {
    backupCreated?: boolean;
    installedToHomeScreen?: boolean;
    usedOffline?: boolean;
  } = {},
): Promise<Achievement[]> {
  const today = ctx.clock.today();
  const facts = await loadFacts(db, {
    today,
    window: { start: ALL_TIME_START, end: today },
    flags,
  });
  return syncAchievements(db, ctx, facts);
}

/** The achievements this call earned, oldest definition order. Empty when nothing new was met. */
export async function syncAchievements(
  db: PocketDb,
  ctx: WriteContext,
  facts: BudgetFacts,
): Promise<Achievement[]> {
  const already = await listAchievements(db);
  const earned = newlyUnlocked(ACHIEVEMENTS, facts, already);

  return db.transaction('rw', db.achievements, db.rewards, async () => {
    for (const achievement of earned) await unlockAchievement(db, achievement.id, ctx.clock);
    await grantMany(
      db,
      earned.flatMap((achievement) => achievementReward(achievement, ctx.clock.today())),
    );
    return earned;
  });
}
