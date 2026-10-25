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
import { grantMany } from './ledger';
import { listAchievements, unlockAchievement, type WriteContext } from './repos';

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
