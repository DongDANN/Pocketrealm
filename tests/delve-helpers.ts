import {
  emptyMeta,
  newRun,
  stepRun,
  type AutopilotPolicy,
  type BudgetSignals,
  type DelveMeta,
  type HollowId,
  type RoomKind,
  type RunState,
  type StepContext,
  type StepOutcome,
} from '../src/core/delve';

export const TODAY = '2026-10-25';
export const TOMORROW = '2026-10-26';
export const NOW = 1_766_000_000_000;

export const POLICY: AutopilotPolicy = {
  mode: 'autopilot',
  tagPriority: ['guard', 'vigor', 'fury', 'fortune', 'thrift'],
  retreatHpPercent: 30,
  route: 'balanced',
};

export const CAMP_POLICY: AutopilotPolicy = { ...POLICY, mode: 'camp' };

export const NO_SIGNALS: BudgetSignals = {
  checkedInToday: false,
  envelopesWithinAllowance: 0,
  contributedToGoalLast7d: false,
  reviewedLast7d: false,
};

export function mkCtx(meta: DelveMeta, over: Partial<StepContext> = {}): StepContext {
  return {
    now: NOW,
    oil: 200,
    oilCapacity: 200,
    signals: { ...NO_SIGNALS },
    meta,
    policy: { ...POLICY },
    today: TODAY,
    ...over,
  };
}

/** Step a run to its end with Autopilot; returns final state + ledger. */
export function playToEnd(seed: number, hollow: HollowId = 1, level = 4) {
  let meta = emptyMeta();
  let run = newRun(seed, hollow, level, meta);
  const ledger: StepOutcome['ledger'] = [];
  let guard = 0;
  while (run.result === 'active' && guard < 1000) {
    const out = stepRun(run, mkCtx(meta));
    if (out.run.stepIndex === run.stepIndex && out.run.result === run.result) break;
    run = out.run;
    meta = out.meta;
    ledger.push(...out.ledger);
    guard += 1;
  }
  return { run, meta, ledger };
}

/** A run whose floor plan is one single room of the given kind (deterministic). */
export function singleRowRun(kind: RoomKind, over: Partial<RunState> = {}): RunState {
  const base = newRun(11, 1, 3, emptyMeta());
  const plan = {
    floor: 1,
    rows: [
      [{ id: 'x0r0c0', kind, enemies: kind === 'skirmish' ? ['tollbug'] : [], optionSeed: 0 }],
    ],
  };
  return { ...base, floorPlan: plan, ...over };
}
