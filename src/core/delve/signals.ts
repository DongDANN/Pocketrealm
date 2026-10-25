/**
 * BudgetSignals: the narrow, read-only snapshot of budgeting behaviour that the Delve may read.
 * Buffs are small, capped at +15% total combat power, and are never penalties — missing a buff
 * is the baseline. Delve buffs never change budgeting math, rewards, or access; the check-in is
 * self-reported and the app does not try to verify it.
 */

import type { BudgetSignals, BuffSummary } from './types';

export const BUFF_POWER_CAP = 15;

export function computeBuffs(signals: BudgetSignals): BuffSummary {
  const reasons: string[] = [];
  const wardCount = signals.checkedInToday
    ? Math.min(3, Math.max(0, signals.envelopesWithinAllowance))
    : 0;
  const wardHp = wardCount * 8;
  if (wardCount > 0)
    reasons.push(
      `Ward: ${wardCount} envelope(s) within allowance and today's check-in done (+${wardHp} shield per room).`,
    );
  const luckBonus = signals.contributedToGoalLast7d ? 6 : 0;
  if (luckBonus > 0)
    reasons.push('Goal Banner: you contributed to a goal in the last 7 days (+6 LUCK).');
  const oilCapacityBonus = signals.reviewedLast7d ? 25 : 0;
  if (oilCapacityBonus > 0)
    reasons.push("Reviewer's Lantern: weekly review done (+25 Lantern Oil capacity).");
  const power = wardCount * 8 + (luckBonus > 0 ? 3 : 0);
  const totalPowerPercent = Math.min(BUFF_POWER_CAP, power);
  return { wardHp, luckBonus, oilCapacityBonus, totalPowerPercent, reasons };
}
