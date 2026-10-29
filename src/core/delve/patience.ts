/**
 * The patience economy (DELVE_REDESIGN §9): skip a room's reward for a boosted pair, and let held
 * Glint earn interest at each floor's end.
 *
 * Both mechanisms price the same currency on purpose. "The next two rewards" is defined as the next
 * two **Glint rewards** — the treasure cache's Glint and a positive event payout — because Glint is
 * what interest compounds and what a shop prices. Boons, healing, materials and Embers keep their
 * own currencies and are never multiplied by a fraction; that keeps the terms printable and stops a
 * skip from quietly inflating progression.
 *
 * Everything here is pure arithmetic so the ledger the player reads and the number the engine pays
 * are the same call. Log lines stay in the engine; this module only answers "how much" and "what is
 * still owed".
 */

import type { RunState } from './types';

/** What a skipped reward pays on the next two Glint rewards. */
export const SKIP_MULTIPLIER = 1.8;
/** How many Glint rewards a single skip boosts. */
export const SKIP_REWARDS = 2;
/** Floor-end interest on held Glint, in percent. */
export const INTEREST_PERCENT = 8;
/** The most interest a single floor can pay. */
export const INTEREST_CAP = 40;

/** Glint rewards still carrying the boost. Absent on a run stored before the economy existed. */
export function skipRewardsLeft(run: RunState): number {
  return Math.max(0, Math.min(SKIP_REWARDS, run.skipRewardsLeft ?? 0));
}

/** True while a skip is outstanding. */
export function skipActive(run: RunState): boolean {
  return skipRewardsLeft(run) > 0;
}

/** Start a skip. Only legal when none is outstanding; the caller refuses otherwise. */
export function beginSkip(run: RunState): RunState {
  return { ...run, skipOutstanding: true, skipRewardsLeft: SKIP_REWARDS };
}

/**
 * Pay one Glint reward, applying the skip's multiplier when one is outstanding. Returns the run with
 * its Skip ledger decremented and the amount the player actually receives.
 */
export function payGlintReward(
  run: RunState,
  base: number,
): { run: RunState; amount: number; boosted: boolean } {
  if (base <= 0) return { run, amount: base, boosted: false };
  const left = skipRewardsLeft(run);
  if (left <= 0) return { run, amount: base, boosted: false };
  const remaining = left - 1;
  return {
    run: {
      ...run,
      skipRewardsLeft: remaining,
      skipOutstanding: remaining > 0,
    },
    amount: Math.round(base * SKIP_MULTIPLIER),
    boosted: true,
  };
}

/** Interest on Glint held when a floor ends: 8%, capped at 40 Glint. */
export function interestOn(held: number): number {
  if (held <= 0) return 0;
  return Math.min(INTEREST_CAP, Math.round((held * INTEREST_PERCENT) / 100));
}

export interface PatienceLedger {
  skipLeft: number;
  /** The skip's state and terms, in the player's words. */
  skipLine: string;
  /** What the held Glint will pay when this floor ends. */
  interestNext: number;
  interestLine: string;
}

/** The one ledger both mechanics print, so their terms are visible before either is chosen. */
export function patienceLedger(run: RunState): PatienceLedger {
  const left = skipRewardsLeft(run);
  const interestNext = interestOn(run.glint);
  return {
    skipLeft: left,
    skipLine:
      left > 0
        ? `Skip: ${left} more Glint reward${left === 1 ? ' pays' : 's pay'} ×${SKIP_MULTIPLIER}.`
        : `Skip: decline a Treasure or Rest reward for ×${SKIP_MULTIPLIER} on the next ${SKIP_REWARDS} Glint rewards.`,
    interestNext,
    interestLine: `Interest: ${INTEREST_PERCENT}% of ${run.glint} held Glint = +${interestNext} at this floor's end (cap ${INTEREST_CAP}).`,
  };
}
