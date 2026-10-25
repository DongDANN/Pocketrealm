import { addDays, addMonths, compareDates, daysBetween } from './dates';
import type { Envelope, LocalDate, PeriodSummary, Transaction } from './types';

/**
 * A budget period runs from the start day of one month to the day before the next start day.
 * Period id is its start date, which is unique and stable for any start day.
 */
export interface Period {
  id: string;
  start: LocalDate;
  /** Inclusive. */
  end: LocalDate;
  startDay: number;
}

/** Period containing `date`, given a start day clamped to 1-28 (months can be shorter). */
export function periodOf(date: LocalDate, startDay = 1): Period {
  const clamped = Math.min(Math.max(Math.trunc(startDay), 1), 28);
  const [y, m] = date.split('-').map(Number) as [number, number];
  const day = Number(date.slice(8, 10));
  const thisStart = `${y}-${String(m).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
  const inCurrent = day >= clamped;
  const startDate = inCurrent ? thisStart : addMonths(thisStart, -1);
  const end = addDays(addMonths(startDate, 1), -1);
  return { id: startDate, start: startDate, end, startDay: clamped };
}

/** Days left in the period including today; at least 1 while the period is current. */
export function daysLeftInclusive(period: Period, today: LocalDate): number {
  if (compareDates(today, period.start) < 0) return daysBetween(period.start, period.end) + 1;
  if (compareDates(today, period.end) > 0) return 1;
  return daysBetween(today, period.end) + 1;
}

/** Is the period already over? */
export function periodEnded(period: Period, today: LocalDate): boolean {
  return compareDates(today, period.end) > 0;
}

export interface CloseResult {
  summary: PeriodSummary;
  /** Envelope changes to persist: next-period carry values and goal sweeps. */
  carries: ReadonlyMap<string, number>;
  sweeps: readonly { envelopeId: string; goalId: string; amount: number }[];
}

/**
 * Pure period-close plan. Computes per-envelope results from transactions; the caller persists it
 * keyed by periodId, which makes closing safe to run twice.
 */
export function closePlan(
  period: Period,
  envelopes: readonly Envelope[],
  txns: readonly Transaction[],
  carryIns: ReadonlyMap<string, number> = new Map(),
): CloseResult {
  const active = txns.filter(
    (t) => t.date >= period.start && t.date <= period.end && t.deletedAt === undefined,
  );
  // Net out of each envelope: expenses and transfer-outs add, transfer-ins subtract.
  const netSpent = new Map<string, number>();
  for (const t of active) {
    if (t.kind === 'expense' && t.envelopeId) {
      netSpent.set(t.envelopeId, (netSpent.get(t.envelopeId) ?? 0) + t.amount);
    } else if (t.kind === 'transfer' && t.envelopeId && t.toEnvelopeId) {
      netSpent.set(t.envelopeId, (netSpent.get(t.envelopeId) ?? 0) + t.amount);
      netSpent.set(t.toEnvelopeId, (netSpent.get(t.toEnvelopeId) ?? 0) - t.amount);
    }
  }

  const carries = new Map<string, number>();
  const sweeps: { envelopeId: string; goalId: string; amount: number }[] = [];
  let totalSaved = 0;
  let best: PeriodSummary['perEnvelope'][number] | undefined;
  let worst: PeriodSummary['perEnvelope'][number] | undefined;

  const perEnvelope = envelopes
    .filter((e) => !e.archived)
    .map((env) => {
      const spent = netSpent.get(env.id) ?? 0;
      const carryIn = carryIns.get(env.id) ?? 0;
      const result = env.monthlyAllowance + carryIn - spent;
      if (env.rollover === 'carry') carries.set(env.id, result);
      let swept = 0;
      let sweptToGoalId: string | undefined;
      if (env.rollover === 'sweep-to-goal' && result > 0 && env.sweepGoalId) {
        swept = result;
        sweptToGoalId = env.sweepGoalId;
        sweeps.push({ envelopeId: env.id, goalId: env.sweepGoalId, amount: swept });
      }
      const row = {
        envelopeId: env.id,
        name: env.name,
        allowance: env.monthlyAllowance,
        carryIn,
        spent,
        result,
        rollover: env.rollover,
        sweptToGoalId,
        swept,
      };
      if (swept === 0) totalSaved += Math.max(0, result);
      if (!best || row.result > best.result) best = row;
      if (!worst || row.result < worst.result) worst = row;
      return row;
    });

  const activeDays = new Set(active.map((t) => t.date)).size;
  return {
    summary: {
      periodId: period.id,
      start: period.start,
      end: period.end,
      perEnvelope,
      totalSaved,
      bestEnvelopeId: best?.envelopeId,
      worstEnvelopeId: worst?.envelopeId,
      activeDays,
    },
    carries,
    sweeps,
  };
}
