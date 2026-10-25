import {
  envelopeStatus,
  guardianState,
  safeToSpendToday,
  spentInPeriod,
  spentToday,
  type EnvelopeStatus,
} from './budget';
import { moodCopy, moodFor, type Mood } from './companion';
import { daysLeftInclusive, periodOf, type Period } from './periods';
import { levelForXp, type LevelInfo } from './rewards';
import type { Companion, Envelope, LocalDate, Minor, Transaction } from './types';

/**
 * The Today screen's numbers, derived in one place so the screen only formats what it is handed.
 * Every figure comes from the budget core: nothing here can invent money or blame a person for
 * spending.
 */

/** Art-layer guardian state; the same four names as `art/ui`'s generator. */
export type GuardianArtState = 'calm' | 'alert' | 'strain' | 'over';

const GUARDIAN_COPY: Record<GuardianArtState, string> = {
  calm: 'Steady',
  alert: 'Watchful',
  strain: 'Braced',
  over: 'Overrun',
};

/** One word beside the guardian portrait, because the art alone must not carry the meaning. */
export function guardianArtCopy(state: GuardianArtState): string {
  return GUARDIAN_COPY[state];
}

export interface TodayRow {
  envelope: Envelope;
  status: EnvelopeStatus;
  guardian: ReturnType<typeof guardianState>;
  guardianArt: GuardianArtState;
}

export interface TodayBoard {
  today: LocalDate;
  period: Period;
  daysLeft: number;
  safeToSpend: Minor;
  spentToday: Minor;
  allowance: Minor;
  remaining: Minor;
  rows: readonly TodayRow[];
  mood: Mood;
  moodLine: string;
  streak: number;
  xp: LevelInfo;
  oil: number;
}

export interface TodayInput {
  today: LocalDate;
  startDay: number;
  envelopes: readonly Envelope[];
  transactions: readonly Transaction[];
  /** Carried from closed periods, keyed by envelope id. */
  carries: ReadonlyMap<string, Minor>;
  companion: Companion;
  /** Latest day with a logged entry; null when the book is still empty. */
  lastLogged: LocalDate | null;
  oil: number;
  xp: number;
  streak: number;
}

const ART_STATE: Record<ReturnType<typeof guardianState>, GuardianArtState> = {
  calm: 'calm',
  alert: 'alert',
  attention: 'strain',
  overspent: 'over',
};

export function todayBoard(input: TodayInput): TodayBoard {
  const period = periodOf(input.today, input.startDay);
  const rows = input.envelopes.map((envelope) => {
    const status = envelopeStatus(
      envelope,
      input.carries.get(envelope.id) ?? 0,
      spentInPeriod(envelope.id, input.transactions, period),
    );
    const guardian = guardianState(status.percentUsed);
    return { envelope, status, guardian, guardianArt: ART_STATE[guardian] };
  });

  let allowance = 0;
  let remaining = 0;
  for (const row of rows) {
    allowance += row.envelope.monthlyAllowance + row.status.carry;
    remaining += row.status.remaining;
  }

  const mood = moodFor(input.lastLogged, input.today);
  return {
    today: input.today,
    period,
    daysLeft: daysLeftInclusive(period, input.today),
    safeToSpend: safeToSpendToday(
      rows.map((row) => row.status),
      input.today,
      input.startDay,
    ),
    spentToday: spentToday(input.transactions, input.today),
    allowance,
    remaining,
    rows,
    mood,
    moodLine: moodCopy(mood, input.companion.name),
    streak: input.streak,
    xp: levelForXp(input.xp),
    oil: input.oil,
  };
}
