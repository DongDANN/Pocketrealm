import {
  builtinDecider,
  emptyMeta,
  newRun,
  resolveChoice,
  stepRun,
  type BudgetSignals,
  type CombatPause,
  type DelveMeta,
  type FloorRuleId,
  type HollowId,
  type RoomKind,
  type RunState,
  type StepContext,
  type StepOutcome,
} from '../src/core/delve';

export const TODAY = '2026-10-25';
export const TOMORROW = '2026-10-26';
export const NOW = 1_766_000_000_000;

export const NO_SIGNALS: BudgetSignals = {
  checkedInToday: false,
  envelopesWithinAllowance: 0,
  contributedToGoalLast7d: false,
  reviewedLast7d: false,
};

/**
 * The floor rule a combat, menu or readout suite should stand on. Every floor carries a rule (§8 E.1)
 * and the draw is seeded, so a suite that lets its own opening floor decide would also be a suite about
 * initiative, energy costs or element signs — and would move whenever the pool moves. `no-ward-boons`
 * touches only the boon pool a fight room never offers, so the numbers it leaves are the plain ones.
 */
export const NEUTRAL_RULE: FloorRuleId = 'no-ward-boons';

export function mkCtx(meta: DelveMeta, over: Partial<StepContext> = {}): StepContext {
  return {
    now: NOW,
    signals: { ...NO_SIGNALS },
    meta,
    today: TODAY,
    ...over,
  };
}

/**
 * The choice a headless suite makes: the first option the room lists, except the shop's free exit and
 * a rest. The engine asks; the suite answers, exactly as a player would.
 */
export function answerChoice(run: RunState, ctx: StepContext): StepOutcome {
  const choice = run.pendingChoice;
  if (!choice) return { run, meta: ctx.meta, ledger: [], ended: false };
  const picked =
    choice.kind === 'shop'
      ? (choice.options.find((o) => o.id === 'leave') ?? choice.options[0]!)
      : choice.kind === 'rest'
        ? (choice.options.find((o) => o.id === 'rest') ?? choice.options[0]!)
        : choice.options[0]!;
  return resolveChoice(run, ctx, picked.id);
}

/**
 * A run being hand-played by a headless suite: the state, the money, the ledger so far, and the room
 * currently waiting for an order (rebuilt from the run's stored orders by the step that paused it).
 */
export interface PlayState {
  run: RunState;
  meta: DelveMeta;
  pause: CombatPause | null;
  ledger: StepOutcome['ledger'];
  signals: BudgetSignals;
}

export function startRun(
  seed: number,
  hollow: HollowId = 1,
  level = 4,
  signals: BudgetSignals = NO_SIGNALS,
): PlayState {
  const meta = emptyMeta();
  return { run: newRun(seed, hollow, level, meta), meta, pause: null, ledger: [], signals };
}

/** One move: answer a pending choice, give the waiting room one order, or enter the next room. */
export function playOne(state: PlayState): PlayState {
  const ctx = mkCtx(state.meta, { signals: state.signals });
  const ordersBefore = state.run.orders.length;
  const out = state.run.pendingChoice
    ? answerChoice(state.run, ctx)
    : stepRun(state.run, state.pause ? { ...ctx, order: builtinDecider(state.pause.state) } : ctx);
  // The order was priced from the pause the engine just handed back, so a refusal is an engine bug.
  // Say so here rather than let the caller replay the same room until its guard runs out.
  if (
    state.pause &&
    !state.run.pendingChoice &&
    out.pause &&
    out.run.orders.length === ordersBefore
  )
    throw new Error(
      `the engine refused the built-in decider's order at round ${state.pause.state.round}`,
    );
  return {
    run: out.run,
    meta: out.meta,
    pause: out.pause ?? null,
    ledger: [...state.ledger, ...out.ledger],
    signals: state.signals,
  };
}

function signature(run: RunState): string {
  return `${run.result}:${run.stepIndex}:${run.orders.length}:${run.pendingChoice?.kind ?? ''}`;
}

/** Play a run to its end the way a patient player would, one move at a time. */
export function playToEnd(
  seed: number,
  hollow: HollowId = 1,
  level = 4,
  signals: BudgetSignals = NO_SIGNALS,
): PlayState {
  let state = startRun(seed, hollow, level, signals);
  let guard = 0;
  let stall = 0;
  while (state.run.result === 'active' && guard < 2000) {
    guard += 1;
    const before = signature(state.run);
    const next = playOne(state);
    // A pause that took no order yet is what the next move answers; a move that changes nothing at
    // all is the run refusing to play, so report where it stopped rather than return half a run.
    stall = signature(next.run) === before ? stall + 1 : 0;
    if (stall > 40)
      throw new Error(
        `the run stalled at step ${next.run.stepIndex}: ` +
          `choice=${next.run.pendingChoice?.kind ?? '-'} ` +
          `options=${(next.run.pendingChoice?.options ?? []).map((o) => o.id).join(',')} ` +
          `floor=${next.run.floor} row=${next.run.row} hp=${next.run.unit.hp}/${next.run.unit.maxHp}`,
      );
    state = next;
  }
  return state;
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
