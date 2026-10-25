import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementById, newlyUnlocked } from '../src/core/achievements';
import type { BudgetFacts } from '../src/core/types';

function facts(partial: Partial<BudgetFacts> = {}): BudgetFacts {
  return {
    activeDates: [],
    txnCount: 0,
    noteCount: 0,
    goalContributions: 0,
    nospendCount: 0,
    checkinCount: 0,
    reviewCount: 0,
    transferCount: 0,
    recurringCount: 0,
    archivedEnvelopeCount: 0,
    streak: 0,
    longestStreak: 0,
    emergencyFundRatio: 0,
    envelopeStates: [],
    goalReachedGoalIds: [],
    level: 1,
    backupCreated: false,
    installedToHomeScreen: false,
    usedOffline: false,
    weekEnvelopeUnder80: false,
    ...partial,
  };
}

describe('achievements', () => {
  it('has about 20 unique, resolvable achievements', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(18);
    expect(ACHIEVEMENTS.length).toBeLessThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(achievementById(a.id)).toBe(a);
  });

  it('unlocks first-entry on the first transaction', () => {
    expect(achievementById('first-entry')!.check(facts({ txnCount: 1 }))).toBe(true);
    expect(achievementById('first-entry')!.check(facts({ txnCount: 0 }))).toBe(false);
  });

  it('streak achievements use the longest streak', () => {
    expect(achievementById('streak-7')!.check(facts({ longestStreak: 7 }))).toBe(true);
    expect(achievementById('streak-7')!.check(facts({ longestStreak: 6 }))).toBe(false);
    expect(achievementById('streak-30')!.check(facts({ longestStreak: 30 }))).toBe(true);
  });

  it('review, goal, and envelope achievements read their facts', () => {
    expect(achievementById('first-review')!.check(facts({ reviewCount: 1 }))).toBe(true);
    expect(achievementById('reviews-4')!.check(facts({ reviewCount: 4 }))).toBe(true);
    expect(achievementById('reviews-4')!.check(facts({ reviewCount: 3 }))).toBe(false);
    expect(achievementById('first-goal')!.check(facts({ goalReachedGoalIds: ['g1'] }))).toBe(true);
    expect(
      achievementById('three-envelopes-closed')!.check(
        facts({
          envelopeStates: [
            { envelopeId: 'a', percentUsed: 10, entriesLogged: 5, closedWithinAllowance: true },
            { envelopeId: 'b', percentUsed: 20, entriesLogged: 5, closedWithinAllowance: true },
            { envelopeId: 'c', percentUsed: 30, entriesLogged: 5, closedWithinAllowance: true },
          ],
        }),
      ),
    ).toBe(true);
    expect(achievementById('three-envelopes-closed')!.check(facts({ envelopeStates: [] }))).toBe(
      false,
    );
  });

  it('flags and counts unlock correctly', () => {
    expect(achievementById('backup-created')!.check(facts({ backupCreated: true }))).toBe(true);
    expect(achievementById('installed')!.check(facts({ installedToHomeScreen: true }))).toBe(true);
    expect(achievementById('used-offline')!.check(facts({ usedOffline: true }))).toBe(true);
    expect(achievementById('transfers-3')!.check(facts({ transferCount: 3 }))).toBe(true);
    expect(achievementById('goal-contributions-10')!.check(facts({ goalContributions: 10 }))).toBe(
      true,
    );
    expect(
      achievementById('envelope-first-archive')!.check(facts({ archivedEnvelopeCount: 1 })),
    ).toBe(true);
    expect(achievementById('recurring-setup')!.check(facts({ recurringCount: 1 }))).toBe(true);
    expect(achievementById('log-100')!.check(facts({ txnCount: 100 }))).toBe(true);
    expect(achievementById('nospend-weekend')!.check(facts({ nospendCount: 2 }))).toBe(true);
    expect(achievementById('notes-5')!.check(facts({ noteCount: 5 }))).toBe(true);
    expect(achievementById('checkin-7')!.check(facts({ checkinCount: 7 }))).toBe(true);
  });

  it('level-10 gives no XP (no farming loop) but unlocks at 10', () => {
    const a = achievementById('level-10')!;
    expect(a.xp).toBe(0);
    expect(a.check(facts({ level: 10 }))).toBe(true);
    expect(a.check(facts({ level: 9 }))).toBe(false);
  });

  it('emergency fund unlocks at one month of average spending, without a fixed figure', () => {
    const a = achievementById('emergency-fund')!;
    expect(a.check(facts({ emergencyFundRatio: 1 }))).toBe(true);
    expect(a.check(facts({ emergencyFundRatio: 0.99 }))).toBe(false);
  });

  it('newlyUnlocked returns only new unlocks and ignores already-unlocked', () => {
    const hit = facts({ txnCount: 5 });
    const fresh = newlyUnlocked(ACHIEVEMENTS, hit, []);
    expect(fresh.map((a) => a.id)).toContain('first-entry');
    const again = newlyUnlocked(ACHIEVEMENTS, hit, [{ id: 'first-entry', unlockedAt: 1 }]);
    expect(again.map((a) => a.id)).not.toContain('first-entry');
  });

  it('no achievement references money amounts in its copy', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.copy.toLowerCase()).not.toMatch(/₱|\$|peso|dollar/);
    }
  });
});
