import { achievementRewardKey } from './achievements';
import { questRewardKey } from './quests';
import type { GrantSpec } from './rewards';
import type { LocalDate, Minor, Transaction } from './types';

/**
 * The reward table from SPEC 6.1 and 6.9, expressed as builders so a screen cannot invent a grant.
 * Every spec carries a deterministic key and none of them take an amount: what you earned never
 * depends on how much you spent. Daily caps are enforced by `grant`, not here.
 */

export function logReward(txId: string, at: LocalDate): GrantSpec[] {
  return [{ key: `log:${txId}`, type: 'log', xp: 5, sparks: 1, oil: 4, at }];
}

export function checkinReward(at: LocalDate): GrantSpec[] {
  return [{ key: `checkin:${at}`, type: 'checkin', xp: 10, sparks: 2, oil: 10, at }];
}

export function nospendReward(at: LocalDate): GrantSpec[] {
  return [{ key: `nospend:${at}`, type: 'nospend', xp: 10, sparks: 2, oil: 10, at }];
}

export function reviewReward(weekId: string, at: LocalDate): GrantSpec[] {
  return [
    { key: `review:${weekId}`, type: 'review', xp: 60, sparks: 10, oil: 30, at, meta: { weekId } },
  ];
}

/** Oil-free on purpose: an envelope is paid for being *used*, so nothing here buys oil with abstinence. */
export function envOkReward(periodId: string, envelopeId: string, at: LocalDate): GrantSpec[] {
  return [{ key: `envok:${periodId}:${envelopeId}`, type: 'envok', xp: 40, sparks: 8, at }];
}

/**
 * SPEC 6.1: an envelope pays `envok` only when it closes inside its allowance *and* carries at least
 * five logged entries — being ignored is not the same skill as being budgeted.
 */
export const ENV_OK_MIN_ENTRIES = 5;

export function envOkEligible(remaining: Minor, entriesLogged: number): boolean {
  return remaining >= 0 && entriesLogged >= ENV_OK_MIN_ENTRIES;
}

export function goalContributionReward(txId: string, at: LocalDate): GrantSpec[] {
  return [{ key: `goal:${txId}`, type: 'goal', xp: 15, sparks: 3, oil: 15, at }];
}

export function goalReachedReward(goalId: string, at: LocalDate): GrantSpec[] {
  return [{ key: `goalDone:${goalId}`, type: 'goalDone', xp: 150, sparks: 30, at }];
}

export function questReward(
  quest: { id: string; xp: number; sparks: number },
  periodId: string,
  at: LocalDate,
): GrantSpec[] {
  return [
    {
      key: questRewardKey(quest.id, periodId),
      type: 'quest',
      xp: quest.xp,
      sparks: quest.sparks,
      at,
    },
  ];
}

export function achievementReward(
  achievement: { id: string; xp: number; sparks: number },
  at: LocalDate,
): GrantSpec[] {
  return [
    {
      key: achievementRewardKey(achievement.id),
      type: 'achievement',
      xp: achievement.xp,
      sparks: achievement.sparks,
      at,
    },
  ];
}

/**
 * A no-spend day is only true if nothing was spent that day (SPEC 6.1). Income and transfers do not
 * break it; a soft-deleted expense does not count.
 */
export function canDeclareNoSpend(transactions: readonly Transaction[], date: LocalDate): boolean {
  return !transactions.some(
    (t) => t.date === date && t.kind === 'expense' && t.deletedAt === undefined,
  );
}
