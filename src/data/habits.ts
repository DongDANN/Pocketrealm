/**
 * Gate 3b — habit writes. The screen actions that earn a reward: log an entry, check in, declare a
 * no-spend day, complete the review, take the daily oil trickle, delete an entry. Each one is a single
 * transaction, so an entry and its reward always exist together and a goal balance never disagrees
 * with the contribution that moved it.
 *
 * Rewards are stamped with the day the *action* happened, not the date written on the entry: a
 * back-dated entry must not be able to fill a quiet day's caps.
 */

import { isoWeekId } from '../core/dates';
import {
  canDeclareNoSpend,
  checkinReward,
  goalContributionReward,
  goalReachedReward,
  logReward,
  nospendReward,
  reviewReward,
} from '../core/habits';
import { OIL_SOURCES, type GrantResult } from '../core/rewards';
import type { Goal, Transaction } from '../core/types';
import type { PocketDb } from './db';
import { grantMany } from './ledger';
import {
  deleteTransaction,
  writeTransaction,
  type NewTransaction,
  type WriteContext,
} from './repos';

export type LogOutcome =
  | {
      ok: true;
      transaction: Transaction;
      goal?: Goal;
      rewards: GrantResult[];
      grantedTypes: string[];
    }
  | { ok: false; reason: 'goal-missing'; goalId: string };

export async function logWithReward(
  db: PocketDb,
  input: NewTransaction,
  ctx: WriteContext,
): Promise<LogOutcome> {
  return db.transaction('rw', db.transactions, db.goals, db.rewards, async () => {
    const at = ctx.clock.today();
    let goal: Goal | undefined;
    if (input.goalId !== undefined) {
      const existing = await db.goals.get(input.goalId);
      // A contribution whose goal has vanished is refused whole: half a payment the user believes
      // went to their fund is worse than an error they can fix.
      if (!existing) return { ok: false, reason: 'goal-missing', goalId: input.goalId };
      goal = { ...existing, saved: existing.saved + input.amount };
      await db.goals.put(goal);
    }

    const transaction = await writeTransaction(db, input, ctx);
    const specs = [...logReward(transaction.id, at)];
    if (goal) {
      specs.push(...goalContributionReward(transaction.id, at));
      const before = goal.saved - input.amount;
      if (before < goal.target && goal.saved >= goal.target) {
        specs.push(...goalReachedReward(goal.id, at));
      }
    }

    const rewards = await grantMany(db, specs);
    return {
      ok: true,
      transaction,
      ...(goal ? { goal } : {}),
      rewards,
      grantedTypes: specs.filter((_, index) => rewards[index]?.granted).map((spec) => spec.type),
    };
  });
}

export async function checkIn(db: PocketDb, ctx: WriteContext): Promise<GrantResult> {
  const [result] = await grantMany(db, checkinReward(ctx.clock.today()));
  return result!;
}

/** Returns null when the day already has an expense — the declaration would be untrue. */
export async function declareNoSpend(db: PocketDb, ctx: WriteContext): Promise<GrantResult | null> {
  const today = ctx.clock.today();
  const rows = await db.transactions.where('date').equals(today).toArray();
  if (!canDeclareNoSpend(rows, today)) return null;
  const [result] = await grantMany(db, nospendReward(today));
  return result!;
}

export async function completeReview(
  db: PocketDb,
  ctx: WriteContext,
  weekId?: string,
): Promise<GrantResult> {
  const today = ctx.clock.today();
  const [result] = await grantMany(db, reviewReward(weekId ?? isoWeekId(today), today));
  return result!;
}

/** The free daily oil the SPEC grants for simply having the app open. Idempotent per date. */
export async function trickleOil(db: PocketDb, ctx: WriteContext): Promise<GrantResult> {
  const today = ctx.clock.today();
  const [result] = await grantMany(db, [
    {
      key: `${OIL_SOURCES.trickle.type}:${today}`,
      type: OIL_SOURCES.trickle.type,
      xp: 0,
      sparks: 0,
      oil: OIL_SOURCES.trickle.perDay,
      at: today,
    },
  ]);
  return result!;
}

export interface DeleteOutcome {
  transaction: Transaction;
  goal?: Goal;
}

/**
 * Undo for a delete: the row comes back and, if it was goal work, so does the contribution. The
 * ledger is left alone — the keys are spent, so a restore can never mint a second reward.
 */
export async function restoreLogged(
  db: PocketDb,
  id: string,
  ctx: WriteContext,
): Promise<DeleteOutcome | null> {
  return db.transaction('rw', db.transactions, db.goals, async () => {
    const current = await db.transactions.get(id);
    if (!current || current.deletedAt === undefined) return null;
    let goal: Goal | undefined;
    if (current.goalId !== undefined) {
      const existing = await db.goals.get(current.goalId);
      if (existing) {
        goal = { ...existing, saved: existing.saved + current.amount };
        await db.goals.put(goal);
      }
    }
    const transaction: Transaction = { ...current, updatedAt: ctx.clock.now() };
    delete transaction.deletedAt;
    await db.transactions.put(transaction);
    return { transaction, ...(goal ? { goal } : {}) };
  });
}

/**
 * Soft delete, plus the money a goal contribution moved. Rewards are never clawed back: SPEC 6.1
 * says nothing is lost, and the spent key simply stops the same entry from paying again.
 */
export async function deleteLogged(
  db: PocketDb,
  id: string,
  ctx: WriteContext,
): Promise<DeleteOutcome | null> {
  return db.transaction('rw', db.transactions, db.goals, async () => {
    const current = await db.transactions.get(id);
    if (!current || current.deletedAt !== undefined) return null;
    let goal: Goal | undefined;
    if (current.goalId !== undefined) {
      const existing = await db.goals.get(current.goalId);
      if (existing) {
        goal = { ...existing, saved: Math.max(0, existing.saved - current.amount) };
        await db.goals.put(goal);
      }
    }
    const transaction = await deleteTransaction(db, id, ctx.clock);
    if (!transaction) return null;
    return { transaction, ...(goal ? { goal } : {}) };
  });
}
