import type { AchievementState, BudgetFacts } from './types';

/**
 * Achievements: ~20 meaningful, testable unlocks. No hidden grinds. Each has a clear condition
 * evaluated against BudgetFacts (a snapshot of persisted budgeting behaviour) — amounts are
 * never part of an unlock condition except the emergency-fund rule, which uses a multiple of
 * monthly spending rather than a specific figure.
 */

export interface Achievement {
  id: string;
  name: string;
  copy: string;
  xp: number;
  sparks: number;
  check: (facts: BudgetFacts) => boolean;
}

const goals = (facts: BudgetFacts, count: number) => facts.goalReachedGoalIds.length >= count;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-entry',
    name: 'First entry',
    copy: 'Log your first transaction.',
    xp: 10,
    sparks: 2,
    check: (f) => f.txnCount > 0,
  },
  {
    id: 'streak-7',
    name: 'A week of light',
    copy: '7-day logging streak.',
    xp: 40,
    sparks: 8,
    check: (f) => f.longestStreak >= 7,
  },
  {
    id: 'streak-30',
    name: 'A month of light',
    copy: '30-day logging streak.',
    xp: 150,
    sparks: 25,
    check: (f) => f.longestStreak >= 30,
  },
  {
    id: 'first-review',
    name: 'The first ritual',
    copy: 'Complete your first weekly review.',
    xp: 30,
    sparks: 5,
    check: (f) => f.reviewCount > 0,
  },
  {
    id: 'reviews-4',
    name: 'Habitual keeper',
    copy: 'Complete 4 weekly reviews.',
    xp: 60,
    sparks: 10,
    check: (f) => f.reviewCount >= 4,
  },
  {
    id: 'first-goal',
    name: 'Funded',
    copy: 'Reach your first savings goal.',
    xp: 80,
    sparks: 15,
    check: (f) => goals(f, 1),
  },
  {
    id: 'three-goals',
    name: 'Hoard of plans',
    copy: 'Reach 3 savings goals.',
    xp: 150,
    sparks: 25,
    check: (f) => goals(f, 3),
  },
  {
    id: 'three-envelopes-closed',
    name: 'Three quiet guardians',
    copy: 'Close 3 envelopes within allowance in one period.',
    xp: 60,
    sparks: 10,
    check: (f) => f.envelopeStates.filter((e) => e.closedWithinAllowance).length >= 3,
  },
  {
    id: 'nospend-weekend',
    name: 'Quiet weekend',
    copy: 'Two no-spend days.',
    xp: 20,
    sparks: 4,
    check: (f) => f.nospendCount >= 2,
  },
  {
    id: 'level-10',
    name: 'Seasoned keeper',
    copy: 'Reach companion level 10.',
    xp: 0,
    sparks: 20,
    check: (f) => f.level >= 10,
  },
  {
    id: 'backup-created',
    name: 'Safe and sound',
    copy: 'Export a backup.',
    xp: 20,
    sparks: 5,
    check: (f) => f.backupCreated,
  },
  {
    id: 'installed',
    name: 'Home at last',
    copy: 'Install Pocketrealm to your home screen.',
    xp: 30,
    sparks: 10,
    check: (f) => f.installedToHomeScreen,
  },
  {
    id: 'used-offline',
    name: 'Lantern in the dark',
    copy: 'Log an entry while offline.',
    xp: 30,
    sparks: 10,
    check: (f) => f.usedOffline,
  },
  {
    id: 'notes-5',
    name: 'Marginalia',
    copy: 'Add notes to 5 entries.',
    xp: 20,
    sparks: 4,
    check: (f) => f.noteCount >= 5,
  },
  {
    id: 'checkin-7',
    name: 'Seven lamps',
    copy: 'Check in 7 times.',
    xp: 30,
    sparks: 6,
    check: (f) => f.checkinCount >= 7,
  },
  {
    id: 'transfers-3',
    name: 'Moving funds',
    copy: 'Move funds between envelopes 3 times.',
    xp: 20,
    sparks: 4,
    check: (f) => f.transferCount >= 3,
  },
  {
    id: 'goal-contributions-10',
    name: 'Steady saver',
    copy: 'Contribute to goals 10 times.',
    xp: 40,
    sparks: 8,
    check: (f) => f.goalContributions >= 10,
  },
  {
    id: 'envelope-first-archive',
    name: 'Spring cleaning',
    copy: 'Archive your first envelope.',
    xp: 10,
    sparks: 2,
    check: (f) => f.archivedEnvelopeCount >= 1,
  },
  {
    id: 'recurring-setup',
    name: 'Set it and forget it',
    copy: 'Create a recurring transaction.',
    xp: 20,
    sparks: 4,
    check: (f) => f.recurringCount >= 1,
  },
  {
    id: 'emergency-fund',
    name: 'One month of runway',
    copy: 'Save one month of average spending in a goal.',
    xp: 100,
    sparks: 20,
    check: (f) => f.emergencyFundRatio >= 1,
  },
  {
    id: 'log-100',
    name: 'A hundred entries',
    copy: 'Log 100 entries.',
    xp: 100,
    sparks: 20,
    check: (f) => f.txnCount >= 100,
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementById(id: string): Achievement | undefined {
  return BY_ID.get(id);
}

export function achievementRewardKey(id: string): string {
  return `ach:${id}`;
}

/**
 * Returns achievements whose conditions are met and which are not yet recorded as unlocked.
 */
export function newlyUnlocked(
  achievements: readonly Achievement[],
  facts: BudgetFacts,
  states: readonly AchievementState[],
): Achievement[] {
  const unlocked = new Set(states.filter((s) => s.unlockedAt !== undefined).map((s) => s.id));
  return achievements.filter((a) => !unlocked.has(a.id) && a.check(facts));
}
