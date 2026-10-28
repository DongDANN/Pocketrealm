/**
 * Gate 4 — the Delve controller. Core stays pure and the store only knows batches; this is the
 * layer that turns a screen action into one of those batches:
 *
 *  - the oil wallet is reconciled against the reward ledger by difference, so habits logged while
 *    the Delve was closed arrive exactly once and a replay can never mint a second drop;
 *  - a run starts at step zero, advances one room per call, and resolves a choice without moving
 *    the step index (the store has a guarded write for each case). A fight room pauses for the
 *    player's order and is rebuilt by replaying the orders stored with the run;
 *  - a Daily Challenge settles its Embers, Sparks and personal best in the same batch that ends it,
 *    and never touches permanent counters, materials, or Hollow clears.
 *
 * Every read here is local, every write is one transaction, and no function reads the wall clock.
 */

import { addDays } from '../core/dates';
import {
  buildById,
  buildUnlocked,
  buildingMilestones,
  buyForgeNode,
  buyTreeNode,
  craftConsumable,
  emptyMeta,
  equipConsumable,
  finishDailyRun,
  heatUnlocked,
  hollowUnlocked,
  newDailyRun,
  newRun,
  oilCapacity,
  respecBuild,
  resolveChoice,
  retreatRun,
  RUN_COST,
  stepRun,
  unequipConsumable,
  unlockBuilding,
  upgradeBuilding,
  type BudgetSignals,
  type BuildId,
  type CombatPause,
  type DelveMeta,
  type HollowId,
  type MilestoneInput,
  type RunResult,
  type RunState,
  type StepContext,
  type StepOutcome,
  type TurnOrder,
} from '../core/delve';
import { hashCombine } from '../core/rng';
import { levelForXp } from '../core/rewards';
import type { LocalDate } from '../core/types';
import type { PocketDb } from './db';
import {
  commitBatch,
  commitChoice,
  createRun,
  listDelveRuns,
  loadActiveRun,
  META_KEY,
  saveMetaWallet,
  type DelveBatch,
} from './delveStore';
import { loadFacts } from './factsStore';
import { ledgerEvents, ledgerTotals } from './ledger';
import { questSeed } from './onboard';
import { listGoals, listTransactions } from './repos';

export const DAILY_XP = 15;

/* --------------------------------------------------------------------------------------------
 * Meta normalization
 * ------------------------------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function uniqueText(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))];
}

function numberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = Math.max(0, Math.trunc(raw));
  }
  return out;
}

function hollowId(value: unknown): HollowId | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function hollowNumbers(value: unknown): Partial<Record<HollowId, number>> {
  const out: Partial<Record<HollowId, number>> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = hollowId(Number(key));
    if (id !== null) out[id] = count(raw);
  }
  return out;
}

function hollowDates(value: unknown): Partial<Record<HollowId, LocalDate>> {
  const out: Partial<Record<HollowId, LocalDate>> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    const id = hollowId(Number(key));
    if (id !== null && typeof raw === 'string' && raw !== '') out[id] = raw;
  }
  return out;
}

function buildStates(value: unknown): DelveMeta['builds'] {
  const out: DelveMeta['builds'] = {};
  for (const [id, state] of Object.entries(asRecord(value))) {
    if (id === '') continue;
    const raw = asRecord(state);
    out[id] = { tree: uniqueText(raw.tree), spent: count(raw.spent) };
  }
  return out;
}

function dailyState(value: unknown): DelveMeta['daily'] {
  const raw = asRecord(value);
  const out: DelveMeta['daily'] = { date: text(raw.date), played: raw.played === true };
  if (raw.settled === true) out.settled = true;
  return out;
}

/** Collected skills: level 1-5, and the two use counters that feed it. */
function skillStates(value: unknown): DelveMeta['skills'] {
  const out: DelveMeta['skills'] = {};
  for (const [id, state] of Object.entries(asRecord(value))) {
    if (id === '') continue;
    const raw = asRecord(state);
    out[id] = {
      level: Math.min(5, Math.max(1, count(raw.level) || 1)),
      uses: count(raw.uses),
      lifetime: count(raw.lifetime),
    };
  }
  return out;
}

/**
 * Fill a stored meta with the current shape. Rows written by an older Gate, or a hand-edited
 * backup, keep every field they have and gain the defaults they lack, so no screen has to guard
 * against a missing `materials` or `daily`.
 */
export function normalizeMeta(raw?: unknown): DelveMeta {
  if (typeof raw !== 'object' || raw === null) return emptyMeta();
  const m = asRecord(raw);
  const cleared = new Set<HollowId>();
  if (Array.isArray(m.clearedHollows)) {
    for (const item of m.clearedHollows) {
      const id = hollowId(item);
      if (id !== null) cleared.add(id);
    }
  }
  return {
    embers: count(m.embers),
    clearedHollows: [1, 2, 3].filter((id): id is HollowId => cleared.has(id as HollowId)),
    builds: buildStates(m.builds),
    knownWeaknesses: uniqueText(m.knownWeaknesses) as DelveMeta['knownWeaknesses'],
    bossKnowledge: uniqueText(m.bossKnowledge),
    bestFloor: hollowNumbers(m.bestFloor),
    forge: numberRecord(m.forge),
    runsStarted: count(m.runsStarted),
    runsCleared: count(m.runsCleared),
    runsFainted: count(m.runsFainted),
    runsRetreated: count(m.runsRetreated),
    lastClearDate: hollowDates(m.lastClearDate),
    embersDay: text(m.embersDay),
    embersToday: count(m.embersToday),
    materials: {
      ore: count(asRecord(m.materials).ore),
      herb: count(asRecord(m.materials).herb),
      echo: count(asRecord(m.materials).echo),
    },
    consumableStock: numberRecord(m.consumableStock),
    equippedConsumables: uniqueText(m.equippedConsumables).slice(0, 3),
    buildingLevels: numberRecord(m.buildingLevels),
    mastery: numberRecord(m.mastery),
    codex: uniqueText(m.codex),
    daily: dailyState(m.daily),
    dailyBest: count(m.dailyBest),
    maxSeenAt: count(m.maxSeenAt),
    lastStepAt: count(m.lastStepAt),
    skills: skillStates(m.skills),
    knownSkills: uniqueText(m.knownSkills),
    equippedSkills: uniqueText(m.equippedSkills).slice(0, 4),
    dust: count(m.dust),
    capsules: numberRecord(m.capsules),
    capsuleIndex: count(m.capsuleIndex),
    pitySinceEpic: count(m.pitySinceEpic),
    capsuleTagStreak: count(m.capsuleTagStreak),
  };
}

/* --------------------------------------------------------------------------------------------
 * Signals and the wallet
 * ------------------------------------------------------------------------------------------ */

/** The narrow budgeting view the Delve is allowed to read. It is never written back. */
export async function loadDelveSignals(db: PocketDb, today: LocalDate): Promise<BudgetSignals> {
  const weekStart = addDays(today, -6);
  const [facts, events, transactions] = await Promise.all([
    loadFacts(db, { today, window: { start: today, end: today } }),
    ledgerEvents(db, { from: weekStart, to: today }),
    listTransactions(db, { from: weekStart, to: today }),
  ]);
  return {
    checkedInToday: events.some((event) => event.at === today && event.type === 'checkin'),
    envelopesWithinAllowance: facts.envelopeStates.filter((state) => state.percentUsed <= 100)
      .length,
    contributedToGoalLast7d: transactions.some((transaction) => transaction.goalId !== undefined),
    reviewedLast7d: events.some((event) => event.type === 'review'),
  };
}

export interface DelveWallet {
  meta: DelveMeta;
  /** Absolute Lantern Oil, never negative and never above `capacity`. */
  oil: number;
  capacity: number;
  /** Ledger oil already folded into this wallet; the next sync pays only the difference. */
  oilGranted: number;
}

export interface DelveSync extends DelveWallet {
  signals: BudgetSignals;
}

function truncOil(oil: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(oil) ? oil : 0));
}

/**
 * Reconcile the wallet with the reward ledger. On a first visit the wallet starts at the oil the
 * ledger already holds (so today's trickle is spendable); on later visits only new grants are
 * added. The review buff is part of capacity, so losing it clamps the lamp rather than hiding oil.
 */
export async function syncDelveWallet(
  db: PocketDb,
  options: { today: LocalDate; now: number; signals?: BudgetSignals },
): Promise<DelveSync> {
  const signals = options.signals ?? (await loadDelveSignals(db, options.today));
  return db.transaction('rw', db.delveMeta, db.rewards, async () => {
    const row = await db.delveMeta.get(META_KEY);
    const meta = normalizeMeta(row?.value);
    const capacity = oilCapacity(meta, signals.reviewedLast7d);
    const events = await db.rewards.toArray();
    const ledgerOil = events.reduce((sum, event) => sum + (event.oil ?? 0), 0);

    if (!row) {
      const oil = Math.min(capacity, truncOil(ledgerOil));
      await db.delveMeta.put({
        key: META_KEY,
        value: meta,
        oil,
        oilGranted: ledgerOil,
        updatedAt: options.now,
      });
      return { meta, oil, capacity, oilGranted: ledgerOil, signals };
    }

    const oilGranted = Math.max(row.oilGranted ?? ledgerOil, ledgerOil);
    const delta = row.oilGranted === undefined ? 0 : Math.max(0, ledgerOil - row.oilGranted);
    const oil = Math.min(capacity, truncOil(row.oil + delta));
    if (oil !== row.oil || oilGranted !== row.oilGranted) {
      await db.delveMeta.put({
        key: META_KEY,
        value: meta,
        oil,
        oilGranted,
        updatedAt: options.now,
      });
    }
    return { meta, oil, capacity, oilGranted, signals };
  });
}

export interface DelveSnapshot extends DelveWallet {
  signals: BudgetSignals;
  active: RunState | null;
  activeStartedAt: number | null;
  companionLevel: number;
  today: LocalDate;
}

async function companionLevelOf(db: PocketDb): Promise<number> {
  const totals = await ledgerTotals(db);
  return levelForXp(totals.xp).level;
}

export async function loadDelveSnapshot(
  db: PocketDb,
  options: { today: LocalDate; now: number; signals?: BudgetSignals },
): Promise<DelveSnapshot> {
  const wallet = await syncDelveWallet(db, options);
  const [activeRow, level] = await Promise.all([loadActiveRun(db), companionLevelOf(db)]);
  return {
    meta: wallet.meta,
    oil: wallet.oil,
    capacity: wallet.capacity,
    oilGranted: wallet.oilGranted,
    signals: wallet.signals,
    active: activeRow?.state ?? null,
    activeStartedAt: activeRow?.startedAt ?? null,
    companionLevel: level,
    today: options.today,
  };
}

/* --------------------------------------------------------------------------------------------
 * Starting, stepping and ending runs
 * ------------------------------------------------------------------------------------------ */

export interface DelveActionOptions {
  today: LocalDate;
  now: number;
  signals?: BudgetSignals;
}

export interface DailyFinish {
  embers: number;
  sparks: number;
  floor: number;
  best: boolean;
}

export interface DelveRunResult {
  ok: boolean;
  reason?: string;
  wallet: DelveWallet;
  run: RunState | null;
  ended: boolean;
  daily?: DailyFinish;
  /** Reward rows the ledger actually accepted in this write. */
  granted: number;
  /** The room a hand-played run is standing in, waiting for its next order. */
  pause?: CombatPause;
}

function wallet(result: DelveSync, meta = result.meta, oil = result.oil): DelveWallet {
  return {
    meta,
    oil,
    capacity: result.capacity,
    oilGranted: result.oilGranted,
  };
}

function refusedReason(run: RunState): string {
  if (run.pendingTurn) return 'The room is waiting for your order.';
  if (run.pendingChoice !== null) return 'A choice is waiting.';
  return 'The run cannot move right now.';
}

function context(
  sync: DelveSync,
  options: { today: LocalDate; now: number; order?: TurnOrder },
): StepContext {
  return {
    now: options.now,
    signals: sync.signals,
    meta: sync.meta,
    today: options.today,
    ...(options.order !== undefined ? { order: options.order } : {}),
  };
}

function withClock(meta: DelveMeta, now: number): DelveMeta {
  return { ...meta, lastStepAt: now, maxSeenAt: Math.max(meta.maxSeenAt, now) };
}

function settleDaily(
  meta: DelveMeta,
  run: RunState,
  today: LocalDate,
): { meta: DelveMeta; ledger: StepOutcome['ledger']; daily?: DailyFinish } {
  const done = finishDailyRun(meta, run, today);
  if ('error' in done) return { meta, ledger: [] };
  const key = `delve:daily:${done.meta.daily.date || today}`;
  return {
    meta: done.meta,
    ledger: [{ key, type: 'delve:daily', xp: DAILY_XP, sparks: done.sparks }],
    daily: {
      embers: done.embers,
      sparks: done.sparks,
      floor: done.floor,
      best: done.best,
    },
  };
}

export interface StartDelveOptions extends DelveActionOptions {
  hollow: HollowId;
  buildId?: string;
  heat?: number;
}

/** Start a run at step zero. One active run at a time keeps resume and history unambiguous. */
export async function startDelve(
  db: PocketDb,
  options: StartDelveOptions,
): Promise<DelveRunResult> {
  const sync = await syncDelveWallet(db, options);
  const hollow = hollowId(options.hollow);
  if (hollow === null) {
    return {
      ok: false,
      reason: 'Unknown Hollow.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const active = await loadActiveRun(db);
  if (active) {
    return {
      ok: false,
      reason: 'Finish or retreat your current run first.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const level = await companionLevelOf(db);
  if (!hollowUnlocked(hollow, sync.meta, level)) {
    const need =
      hollow === 2 ? 'Clear Hollow 1 and reach level 3.' : 'Clear Hollow 2 and reach level 5.';
    return {
      ok: false,
      reason: `Hollow ${hollow} is still sealed. ${need}`,
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const heat = options.heat ?? 0;
  if (!Number.isInteger(heat) || heat < 0 || heat > 5) {
    return {
      ok: false,
      reason: 'Heat runs from 0 to 5.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  if (heat > 0 && !heatUnlocked(sync.meta, hollow)) {
    return {
      ok: false,
      reason: 'Clear this Hollow before raising its Heat.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const build = options.buildId ? buildById(options.buildId) : buildById('warden');
  if (!build) {
    return {
      ok: false,
      reason: 'Unknown build.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  if (!buildUnlocked(build.id, sync.meta, level)) {
    return {
      ok: false,
      reason: `${build.name} is not unlocked yet.`,
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  // Oil buys the run start, not the rooms (§6): the price is the Hollow's, paid once here.
  const cost = RUN_COST[hollow];
  if (sync.oil < cost) {
    return {
      ok: false,
      reason: `A run costs ${cost} oil. You have ${sync.oil}.`,
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }

  const seed = hashCombine(await questSeed(db), sync.meta.runsStarted + 1) >>> 0;
  const run = newRun(seed, hollow, level, sync.meta, build.id, heat);
  const meta = withClock({ ...sync.meta, runsStarted: sync.meta.runsStarted + 1 }, options.now);
  const commit = await createRun(db, {
    run,
    meta,
    oil: sync.oil - cost,
    oilCapacity: sync.capacity,
    oilGranted: sync.oilGranted,
    ledger: [],
    today: options.today,
    now: options.now,
  });
  if (!commit.applied) {
    return {
      ok: false,
      reason: 'A run is already stored.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  return {
    ok: true,
    wallet: wallet(sync, meta, sync.oil - cost),
    run,
    ended: false,
    granted: 0,
  };
}

/** The Daily Challenge costs no oil, uses a fixed loadout, and has one attempt per local day. */
export async function startDailyDelve(
  db: PocketDb,
  options: DelveActionOptions,
): Promise<DelveRunResult> {
  const sync = await syncDelveWallet(db, options);
  const active = await loadActiveRun(db);
  if (active) {
    return {
      ok: false,
      reason: 'Finish or retreat your current run first.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const daily = newDailyRun(options.today, sync.meta);
  if ('error' in daily) {
    return {
      ok: false,
      reason: daily.error,
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const run: RunState = {
    ...daily.run,
    runId: `daily-${options.today}-${sync.meta.runsStarted + 1}`,
  };
  const meta = withClock(daily.meta, options.now);
  const commit = await createRun(db, {
    run,
    meta,
    oil: sync.oil,
    oilCapacity: sync.capacity,
    oilGranted: sync.oilGranted,
    ledger: [],
    today: options.today,
    now: options.now,
  });
  if (!commit.applied) {
    return {
      ok: false,
      reason: 'The daily challenge is already stored.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  return { ok: true, wallet: wallet(sync, meta), run, ended: false, granted: 0 };
}

export interface StepDelveOptions extends DelveActionOptions {
  /** The order for the round a run is waiting on. Refused unless the room is open. */
  order?: TurnOrder;
}

/** Advance one room. The write is rejected if the same step is already stored. */
export async function stepDelve(db: PocketDb, options: StepDelveOptions): Promise<DelveRunResult> {
  const sync = await syncDelveWallet(db, options);
  const active = await loadActiveRun(db);
  if (!active) {
    return {
      ok: false,
      reason: 'No run is active.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const run = active.state;
  const waiting = run.pendingTurn === true;
  // An order only answers a room the run already waits in. Entering a room is its own call, so a
  // first order can never leave a half-entered room behind when it turns out to be unusable.
  if (options.order !== undefined && !waiting) {
    return {
      ok: false,
      reason: 'No room is waiting for an order.',
      wallet: sync,
      run,
      ended: false,
      granted: 0,
    };
  }
  const out = stepRun(run, context(sync, options));
  const moved = out.run.stepIndex > run.stepIndex;
  // Camp mode opens a fork before stepping into the room. That state must be stored, but it is
  // not a step: no oil, no step clock, and the guarded same-index write path.
  const openedChoice =
    !moved &&
    out.run.pendingChoice !== null &&
    run.pendingChoice === null &&
    out.run.result === run.result;
  // Answering a room: the step index stands still and either the trail grows or the room finishes.
  // A refused order changes nothing and must report why instead of being written.
  const tookOrder = out.pause !== undefined && out.pause.orders.length > run.orders.length;
  const finishedRoom = waiting && !moved && out.pause === undefined && out.run !== run;
  if (options.order !== undefined && waiting && !tookOrder && !finishedRoom) {
    return {
      ok: false,
      reason: 'That order cannot be used this round.',
      wallet: sync,
      run,
      ended: false,
      granted: 0,
      pause: out.pause,
    };
  }
  // Asking for a room a run already waits in only rebuilds the menu the pause left behind: the
  // fight is replayed from the stored orders, nothing moves and nothing is written.
  if (waiting && !moved && options.order === undefined && out.pause !== undefined) {
    return {
      ok: true,
      wallet: sync,
      run: out.run,
      ended: false,
      granted: 0,
      pause: out.pause,
    };
  }
  if (!moved && !openedChoice && !tookOrder && !finishedRoom) {
    return {
      ok: false,
      reason: refusedReason(run),
      wallet: sync,
      run,
      ended: run.result !== 'active',
      granted: 0,
    };
  }

  let meta: DelveMeta = moved
    ? withClock(out.meta, options.now)
    : { ...out.meta, maxSeenAt: Math.max(out.meta.maxSeenAt, options.now) };
  let ledger = out.ledger;
  let daily: DailyFinish | undefined;
  if (out.run.result !== 'active' && out.run.daily) {
    const settled = settleDaily(meta, out.run, options.today);
    meta = settled.meta;
    ledger = [...ledger, ...settled.ledger];
    daily = settled.daily;
  }
  const batch: DelveBatch = {
    run: out.run,
    meta,
    oil: sync.oil,
    oilCapacity: sync.capacity,
    oilGranted: sync.oilGranted,
    ledger,
    today: options.today,
    now: options.now,
  };
  const commit = moved ? await commitBatch(db, batch) : await commitChoice(db, batch);
  if (!commit.applied) {
    const fresh = await syncDelveWallet(db, options);
    return {
      ok: false,
      reason: moved ? 'That step was already stored.' : 'That choice is already open.',
      wallet: fresh,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  return {
    ok: true,
    wallet: wallet(sync, meta),
    run: out.run,
    ended: out.run.result !== 'active',
    daily,
    granted: commit.granted,
    ...(out.pause ? { pause: out.pause } : {}),
  };
}

export interface ChooseDelveOptions extends StepDelveOptions {
  optionId: string;
}

/** Resolve a pending choice. The step index stays put; the store checks it was actually waiting. */
export async function chooseDelve(
  db: PocketDb,
  options: ChooseDelveOptions,
): Promise<DelveRunResult> {
  const sync = await syncDelveWallet(db, options);
  const active = await loadActiveRun(db);
  if (!active) {
    return {
      ok: false,
      reason: 'No run is active.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const run = active.state;
  if (run.pendingChoice === null) {
    return {
      ok: false,
      reason: 'No choice is waiting.',
      wallet: sync,
      run,
      ended: run.result !== 'active',
      granted: 0,
    };
  }
  const out = resolveChoice(run, context(sync, options), options.optionId);
  const changed = out.run !== run || out.meta !== sync.meta;
  if (!changed) {
    return {
      ok: false,
      reason: 'That option is no longer available.',
      wallet: sync,
      run,
      ended: false,
      granted: 0,
    };
  }

  // The choice itself is not a step, but resolving it resumes the clock: time spent deciding must
  // not become idle progress the moment the answer is stored.
  let meta: DelveMeta = {
    ...out.meta,
    lastStepAt: options.now,
    maxSeenAt: Math.max(out.meta.maxSeenAt, options.now),
  };
  let ledger = out.ledger;
  let daily: DailyFinish | undefined;
  if (out.run.result !== 'active' && out.run.daily) {
    const settled = settleDaily(meta, out.run, options.today);
    meta = settled.meta;
    ledger = [...ledger, ...settled.ledger];
    daily = settled.daily;
  }
  const commit = await commitChoice(db, {
    run: out.run,
    meta,
    oil: sync.oil,
    oilCapacity: sync.capacity,
    oilGranted: sync.oilGranted,
    ledger,
    today: options.today,
    now: options.now,
  });
  if (!commit.applied) {
    const fresh = await syncDelveWallet(db, options);
    return {
      ok: false,
      reason: 'That choice was already resolved.',
      wallet: fresh,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  return {
    ok: true,
    wallet: wallet(sync, meta),
    run: out.run,
    ended: out.run.result !== 'active',
    daily,
    granted: commit.granted,
  };
}

/** End the active run deliberately. A standard and Daily retreat both land here. */
export async function retreatDelve(
  db: PocketDb,
  options: DelveActionOptions,
): Promise<DelveRunResult> {
  const sync = await syncDelveWallet(db, options);
  const active = await loadActiveRun(db);
  if (!active) {
    return {
      ok: false,
      reason: 'No run is active.',
      wallet: sync,
      run: null,
      ended: false,
      granted: 0,
    };
  }
  const run = active.state;
  const out = retreatRun(run, sync.meta, options.today);
  if (out.run === run) {
    return {
      ok: false,
      reason: 'The run has already ended.',
      wallet: sync,
      run,
      ended: run.result !== 'active',
      granted: 0,
    };
  }
  let meta: DelveMeta = { ...out.meta, maxSeenAt: Math.max(out.meta.maxSeenAt, options.now) };
  let ledger: StepOutcome['ledger'] = [];
  let daily: DailyFinish | undefined;
  if (out.run.daily) {
    const settled = settleDaily(meta, out.run, options.today);
    meta = settled.meta;
    ledger = settled.ledger;
    daily = settled.daily;
  }
  const commit = await commitChoice(db, {
    run: out.run,
    meta,
    oil: sync.oil,
    oilCapacity: sync.capacity,
    oilGranted: sync.oilGranted,
    ledger,
    today: options.today,
    now: options.now,
  });
  if (!commit.applied) {
    const fresh = await syncDelveWallet(db, options);
    return {
      ok: false,
      reason: 'The run has already ended.',
      wallet: fresh,
      run: null,
      ended: true,
      granted: 0,
    };
  }
  return {
    ok: true,
    wallet: wallet(sync, meta),
    run: out.run,
    ended: true,
    daily,
    granted: commit.granted,
  };
}

/* --------------------------------------------------------------------------------------------
 * Meta actions (no run state involved)
 * ------------------------------------------------------------------------------------------ */

export interface MetaActionResult {
  ok: boolean;
  reason?: string;
  wallet: DelveWallet;
}

async function mutateMeta(
  db: PocketDb,
  options: DelveActionOptions,
  change: (meta: DelveMeta) => { meta: DelveMeta; ok: boolean; reason?: string },
): Promise<MetaActionResult> {
  const sync = await syncDelveWallet(db, options);
  const out = change(sync.meta);
  if (!out.ok) return { ok: false, reason: out.reason, wallet: sync };
  const capacity = oilCapacity(out.meta, sync.signals.reviewedLast7d);
  const saved = await saveMetaWallet(db, {
    meta: out.meta,
    oil: Math.min(sync.oil, capacity),
    oilCapacity: capacity,
    oilGranted: sync.oilGranted,
    now: options.now,
  });
  return {
    ok: true,
    wallet: {
      meta: saved.meta,
      oil: saved.oil,
      capacity,
      oilGranted: saved.oilGranted ?? sync.oilGranted,
    },
  };
}

export interface ForgeActionOptions extends DelveActionOptions {
  nodeId: string;
}

export function purchaseForge(
  db: PocketDb,
  options: ForgeActionOptions,
): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = buyForgeNode(meta.forge, meta.embers, options.nodeId);
    if (!out.bought)
      return { ok: false, meta, reason: out.reason ?? 'That node is not available.' };
    return { ok: true, meta: { ...meta, forge: out.forge, embers: out.embers } };
  });
}

export interface TreeActionOptions extends DelveActionOptions {
  buildId: BuildId;
  nodeId: string;
}

export function purchaseTreeNode(
  db: PocketDb,
  options: TreeActionOptions,
): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = buyTreeNode(meta, options.buildId, options.nodeId);
    if (!out.bought)
      return { ok: false, meta, reason: out.reason ?? 'That talent is not available.' };
    return { ok: true, meta: out.meta };
  });
}

export interface RespecOptions extends DelveActionOptions {
  buildId: BuildId;
}

export function respecTree(db: PocketDb, options: RespecOptions): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => ({
    ok: true,
    meta: respecBuild(meta, options.buildId),
  }));
}

export interface CraftOptions extends DelveActionOptions {
  consumableId: string;
}

export function craftAtWorkshop(db: PocketDb, options: CraftOptions): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = craftConsumable(meta, options.consumableId);
    return { ok: out.ok, meta: out.meta, reason: out.reason };
  });
}

export interface EquipOptions extends DelveActionOptions {
  consumableId: string;
}

export function equipConsumableAction(
  db: PocketDb,
  options: EquipOptions,
): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = equipConsumable(meta, options.consumableId);
    return { ok: out.ok, meta: out.meta, reason: out.reason };
  });
}

export function unequipConsumableAction(
  db: PocketDb,
  options: EquipOptions,
): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = unequipConsumable(meta, options.consumableId);
    return { ok: out.ok, meta: out.meta, reason: out.reason };
  });
}

export interface BuildingActionOptions extends DelveActionOptions {
  buildingId: string;
}

export async function unlockRealmBuilding(
  db: PocketDb,
  options: BuildingActionOptions,
): Promise<MetaActionResult> {
  const milestoneState = await loadBuildingMilestones(db);
  return mutateMeta(db, options, (meta) => {
    const out = unlockBuilding(meta, options.buildingId, milestoneState.milestones);
    return { ok: out.ok, meta: out.meta, reason: out.reason };
  });
}

export function upgradeRealmBuilding(
  db: PocketDb,
  options: BuildingActionOptions,
): Promise<MetaActionResult> {
  return mutateMeta(db, options, (meta) => {
    const out = upgradeBuilding(meta, options.buildingId);
    return { ok: out.ok, meta: out.meta, reason: out.reason };
  });
}

export interface BuildingMilestoneState extends MilestoneInput {
  /** One boolean per building id, ready for the Realm screen. */
  milestones: Record<string, boolean>;
}

/** The real budgeting milestones that unlock Realm buildings. Never derived from underspending. */
export async function loadBuildingMilestones(db: PocketDb): Promise<BuildingMilestoneState> {
  const [goals, transactions, reviews, totals] = await Promise.all([
    listGoals(db, { includeArchived: true }),
    listTransactions(db),
    ledgerEvents(db, { type: 'review' }),
    ledgerTotals(db),
  ]);
  const loggedDays = new Set(transactions.map((transaction) => transaction.date));
  const input: MilestoneInput = {
    savingsGoalReached: goals.some((goal) => goal.target > 0 && goal.saved >= goal.target),
    weeklyReviewDone: reviews.length > 0,
    companionLevel: levelForXp(totals.xp).level,
    totalLoggedDays: loggedDays.size,
  };
  return { ...input, milestones: buildingMilestones(input) };
}

/* --------------------------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------------------------ */

export interface DelveHistoryEntry {
  runId: string;
  hollowId: HollowId;
  result: RunResult;
  daily: boolean;
  floor: number;
  row: number;
  stepIndex: number;
  heat: number;
  startedAt: number;
  updatedAt: number;
  embersEarned: number;
  rooms: number;
}

/** Newest first and already flattened, so the history screen never holds full run states. */
export async function listDelveHistory(db: PocketDb, limit = 20): Promise<DelveHistoryEntry[]> {
  const rows = await listDelveRuns(db);
  return rows.slice(0, Math.max(0, Math.trunc(limit))).map((row) => ({
    runId: row.runId,
    hollowId: (row.hollowId === 2 || row.hollowId === 3 ? row.hollowId : 1) as HollowId,
    result: row.result,
    daily: row.daily,
    floor: row.state.floor,
    row: row.state.row,
    stepIndex: row.stepIndex,
    heat: row.state.heat,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
    embersEarned: row.state.embersEarned,
    rooms: row.state.roomsVisited.length,
  }));
}
