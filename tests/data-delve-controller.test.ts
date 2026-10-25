/**
 * Gate 4a — the Delve controller. These tests drive the public data API, not the engine helpers:
 * they prove that a screen action becomes exactly one guarded write, that Lantern Oil is paid from
 * the ledger once, that a Daily Challenge never contaminates permanent progress, and that catch-up
 * survives a camp fork, a dry lamp, a pending choice and a backwards clock.
 */

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { CAMP_POLICY, NO_SIGNALS, NOW, POLICY, TODAY } from './delve-helpers';
import {
  HEAT_MAX,
  STEP_MS,
  emptyMeta,
  newRun,
  runCatchUpJob,
  type DelveMeta,
  type HollowId,
  type RunState,
} from '../src/core/delve';
import { LEVELS } from '../src/core/rewards';
import type { RewardEvent } from '../src/core/types';
import type { PocketDb } from '../src/data/db';
import type { CatchUpRunner } from '../src/data/delveWorker';
import {
  applyCatchUp,
  chooseDelve,
  listDelveHistory,
  loadBuildingMilestones,
  loadDelveSnapshot,
  loadDelveSignals,
  normalizeMeta,
  purchaseForge,
  retreatDelve,
  setHabitCards,
  startDailyDelve,
  startDelve,
  stepDelve,
  syncDelveWallet,
  unlockRealmBuilding,
} from '../src/data/delve';
import { META_KEY, createRun, loadActiveRun, loadMeta, loadRun } from '../src/data/delveStore';
import { dbOn } from './data-harness';

const inProcess: CatchUpRunner = async (request) => runCatchUpJob(request);
const OPTIONS = { today: TODAY, now: NOW };

let db: PocketDb;
let sql = 0;
let rewardSeq = 0;

beforeEach(() => {
  sql += 1;
  db = dbOn(new IDBFactory(), `delve-controller-${sql}`);
});

async function addCompanion(): Promise<void> {
  await db.companions.put({
    id: 'companion-1',
    speciesKey: 'mossling',
    name: 'Pip',
    cosmetics: [],
    equipped: {},
  });
}

async function addReward(
  patch: Partial<RewardEvent> & { xp?: number; oil?: number },
): Promise<void> {
  rewardSeq += 1;
  const row: RewardEvent = {
    key: `test:${sql}:${rewardSeq}`,
    type: patch.type ?? 'log',
    xp: patch.xp ?? 0,
    sparks: patch.sparks ?? 0,
    ...(patch.oil !== undefined ? { oil: patch.oil } : {}),
    at: patch.at ?? TODAY,
  };
  await db.rewards.add(row);
}

async function startReadyRun(oil = 60): Promise<Awaited<ReturnType<typeof startDelve>>> {
  await addCompanion();
  await addReward({ xp: 4000, type: 'milestone' });
  await addReward({ oil, type: 'oil:log' });
  return startDelve(db, { ...OPTIONS, hollow: 1 });
}

function putMeta(meta: DelveMeta, oil = 50, oilGranted?: number): Promise<string> {
  return db.delveMeta.put({
    key: META_KEY,
    value: meta,
    oil,
    ...(oilGranted !== undefined ? { oilGranted } : {}),
    updatedAt: NOW,
  });
}

async function putRun(
  run: RunState,
  meta: DelveMeta,
  oil = 50,
  now = NOW,
  oilGranted = 0,
): Promise<void> {
  await createRun(db, {
    run,
    meta,
    oil,
    oilCapacity: 200,
    oilGranted,
    ledger: [],
    today: TODAY,
    now,
  });
}

function forkRun(level = 8): RunState {
  const base = newRun(11, 1, level, emptyMeta());
  return {
    ...base,
    floorPlan: {
      floor: 1,
      rows: [
        [
          { id: 'r0c0', kind: 'skirmish', enemies: ['tollbug'], optionSeed: 1 },
          { id: 'r0c1', kind: 'rest', enemies: [], optionSeed: 2 },
        ],
      ],
    },
    row: 0,
    path: [],
  };
}

describe('normalizeMeta', () => {
  it('fills the current shape and drops malformed fields', () => {
    expect(normalizeMeta(null)).toEqual(emptyMeta());
    const meta = normalizeMeta({
      embers: 12.9,
      clearedHollows: [2, 2, 9, 'x'],
      cards: ['a', 'a', 'b', 'c', 'd'],
      materials: { ore: 3, herb: -4 },
      daily: { date: '2026-10-25', played: true, settled: true },
      forge: { atk: 2.8, bad: 'x' },
      lastStepAt: -5,
    });
    expect(meta.embers).toBe(12);
    expect(meta.clearedHollows).toEqual([2]);
    expect(meta.cards).toEqual(['a', 'b', 'c']);
    expect(meta.materials).toEqual({ ore: 3, herb: 0, echo: 0 });
    expect(meta.daily).toEqual({ date: '2026-10-25', played: true, settled: true });
    expect(meta.forge).toEqual({ atk: 2 });
    expect(meta.lastStepAt).toBe(0);
    expect(meta.builds).toEqual({});
    expect(meta.dailyBest).toBe(0);
  });
});

describe('Lantern Oil wallet', () => {
  it('starts from the ledger, then pays only new grants once', async () => {
    await addReward({ oil: 30, type: 'oil:log' });
    const first = await syncDelveWallet(db, OPTIONS);
    expect(first.oil).toBe(30);
    expect(first.oilGranted).toBe(30);

    await addReward({ oil: 15, type: 'oil:checkin' });
    const second = await syncDelveWallet(db, OPTIONS);
    expect(second.oil).toBe(45);
    expect(second.oilGranted).toBe(45);

    const third = await syncDelveWallet(db, OPTIONS);
    expect(third.oil).toBe(45);
    expect(third.oilGranted).toBe(45);
  });

  it('adopts a legacy row without oilGranted, with no windfall', async () => {
    await putMeta(emptyMeta(), 5);
    await addReward({ oil: 30, type: 'oil:log' });
    const sync = await syncDelveWallet(db, OPTIONS);
    expect(sync.oil).toBe(5);
    expect(sync.oilGranted).toBe(30);
  });

  it('honors Forge capacity above the base storage cap', async () => {
    const meta = { ...emptyMeta(), forge: { oilcap: 1 } };
    await putMeta(meta, 210, 0);
    const sync = await syncDelveWallet(db, OPTIONS);
    expect(sync.capacity).toBe(220);
    expect(sync.oil).toBe(210);
  });

  it('clamps to capacity when the review buff expires', async () => {
    await addReward({ oil: 120, type: 'oil:log' });
    const reviewed = { ...OPTIONS, signals: { ...NO_SIGNALS, reviewedLast7d: true } };
    const withBuff = await syncDelveWallet(db, reviewed);
    expect(withBuff.capacity).toBe(225);
    expect(withBuff.oil).toBe(120);

    await db.delveMeta.update(META_KEY, { oil: 225 });
    const without = await syncDelveWallet(db, OPTIONS);
    expect(without.signals.reviewedLast7d).toBe(false);
    expect(without.capacity).toBe(200);
    expect(without.oil).toBe(200);
  });

  it('reports the narrow budget signals without writing money data', async () => {
    await addReward({ type: 'checkin' });
    await addReward({ type: 'review' });
    await db.transactions.add({
      id: 'tx-goal',
      kind: 'expense',
      amount: 100,
      goalId: 'goal-1',
      date: TODAY,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const signals = await loadDelveSignals(db, TODAY);
    expect(signals).toEqual({
      checkedInToday: true,
      envelopesWithinAllowance: 0,
      contributedToGoalLast7d: true,
      reviewedLast7d: true,
    });
  });
});

describe('starting and stepping', () => {
  it('starts at step zero, records the clock, and refuses a second run', async () => {
    const started = await startReadyRun();
    expect(started.ok).toBe(true);
    expect(started.run?.stepIndex).toBe(0);
    expect(started.run?.userSeed).toBeGreaterThan(0);

    const row = await loadActiveRun(db);
    expect(row?.runId).toBe(started.run?.runId);
    expect(row?.startedAt).toBe(NOW);
    const wallet = await loadMeta(db);
    expect(wallet?.meta.runsStarted).toBe(1);
    expect(wallet?.meta.lastStepAt).toBe(NOW);
    expect(wallet?.meta.maxSeenAt).toBe(NOW);

    const again = await startDelve(db, { ...OPTIONS, hollow: 1 });
    expect(again.ok).toBe(false);
    expect(again.reason).toContain('current run');
    await expect(db.delveRuns.count()).resolves.toBe(1);
  });

  it('locks Hollow 2 until Hollow 1 is cleared and level 3 is reached', async () => {
    await addCompanion();
    const locked = await startDelve(db, { ...OPTIONS, hollow: 2 });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain('sealed');

    const meta = { ...emptyMeta(), runsStarted: 0, clearedHollows: [1] as HollowId[] };
    await putMeta(meta);
    await addReward({ xp: 3000, type: 'milestone' });
    const opened = await startDelve(db, { ...OPTIONS, hollow: 2 });
    expect(opened.ok).toBe(true);
    expect(opened.run?.hollowId).toBe(2);
  });

  it('spends one oil per room and persists the advance', async () => {
    const started = await startReadyRun();
    const before = started.wallet.oil;
    const tick = await stepDelve(db, { ...OPTIONS, policy: POLICY });
    expect(tick.ok).toBe(true);
    expect(tick.run?.stepIndex).toBe(1);
    expect(tick.oilSpent).toBe(1);
    expect(tick.wallet.oil).toBe(before - 1);

    const stored = await loadRun(db, started.run!.runId);
    expect(stored?.stepIndex).toBe(1);
    expect(stored?.state.log.some((entry) => entry.type === 'room')).toBe(true);
    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(before - 1);
    expect(wallet?.meta.lastStepAt).toBe(NOW);
  });

  it('camps instead of stepping when the lantern is dry', async () => {
    const started = await startReadyRun(0);
    expect(started.ok).toBe(true);
    const tick = await stepDelve(db, { ...OPTIONS, policy: POLICY });
    expect(tick.ok).toBe(false);
    expect(tick.reason).toContain('lantern');
    expect((await loadActiveRun(db))?.stepIndex).toBe(0);
    expect((await loadMeta(db))?.oil).toBe(0);
  });

  it('banks a retreat, closes the run, and keeps it in history', async () => {
    const started = await startReadyRun();
    await stepDelve(db, { ...OPTIONS, policy: POLICY });
    const out = await retreatDelve(db, OPTIONS);
    expect(out.ok).toBe(true);
    expect(out.ended).toBe(true);
    expect(out.run?.result).toBe('retreated');
    expect(await loadActiveRun(db)).toBeUndefined();

    const wallet = await loadMeta(db);
    expect(wallet?.meta.runsRetreated).toBe(1);
    const history = await listDelveHistory(db);
    expect(history[0]).toMatchObject({
      runId: started.run!.runId,
      result: 'retreated',
      rooms: 1,
    });
  });

  it('stops an explicit retreat from claiming more than it should', async () => {
    await startReadyRun();
    await retreatDelve(db, OPTIONS);
    const second = await retreatDelve(db, OPTIONS);
    expect(second.ok).toBe(false);
    expect(await db.rewards.count()).toBe(2); // xp and oil only; retreat pays no ledger row
  });

  it('reports the active run, companion level and wallet in one snapshot', async () => {
    const started = await startReadyRun();
    const snapshot = await loadDelveSnapshot(db, OPTIONS);
    expect(snapshot.active?.runId).toBe(started.run?.runId);
    expect(snapshot.companionLevel).toBeGreaterThanOrEqual(3);
    expect(snapshot.oil).toBe(started.wallet.oil);
    expect(snapshot.today).toBe(TODAY);
  });
});

describe('choices and camp forks', () => {
  it('stores a camp fork at step zero without spending oil or the step clock', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 10 * STEP_MS, maxSeenAt: NOW };
    const run = forkRun();
    await putRun(run, meta, 10);
    const tick = await stepDelve(db, { ...OPTIONS, policy: CAMP_POLICY });
    expect(tick.ok).toBe(true);
    expect(tick.run?.stepIndex).toBe(0);
    expect(tick.run?.pendingChoice?.kind).toBe('fork');
    expect(tick.oilSpent).toBe(0);

    const stored = await loadActiveRun(db);
    expect(stored?.state.pendingChoice?.kind).toBe('fork');
    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(10);
    expect(wallet?.meta.lastStepAt).toBe(NOW - 10 * STEP_MS);
  });

  it('resolves a fork, then steps into the chosen room', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    const run = forkRun();
    await putRun(run, meta, 10);
    await stepDelve(db, { ...OPTIONS, policy: CAMP_POLICY });

    const chosen = await chooseDelve(db, {
      ...OPTIONS,
      policy: CAMP_POLICY,
      optionId: 'r0c1',
    });
    expect(chosen.ok).toBe(true);
    expect(chosen.run?.pendingChoice).toBeNull();
    expect(chosen.run?.path[0]).toBe(1);
    expect((await loadActiveRun(db))?.state.pendingChoice).toBeNull();

    const stepped = await stepDelve(db, { ...OPTIONS, policy: CAMP_POLICY });
    expect(stepped.ok).toBe(true);
    expect(stepped.run?.stepIndex).toBe(1);
    expect(stepped.run?.pendingChoice?.kind).toBe('rest');
    expect(stepped.oilSpent).toBe(1);
    expect((await loadActiveRun(db))?.state.pendingChoice?.kind).toBe('rest');
  });

  it('rejects an option that is no longer offered', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    await putRun(forkRun(), meta, 10);
    await stepDelve(db, { ...OPTIONS, policy: CAMP_POLICY });
    const bad = await chooseDelve(db, {
      ...OPTIONS,
      policy: CAMP_POLICY,
      optionId: 'not-a-room',
    });
    expect(bad.ok).toBe(false);
    expect((await loadActiveRun(db))?.state.pendingChoice?.kind).toBe('fork');
  });

  it('resumes the step clock at the answer, so deciding time is never simulated as idle progress', async () => {
    // The fork is offered with the clock already 30 steps old. The user takes the same 30 steps of
    // wall-clock to answer, and that wait must not become free progress once the answer lands.
    const waited = NOW + 30 * STEP_MS;
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    await putRun(forkRun(), meta, 60, NOW);
    await stepDelve(db, { ...OPTIONS, policy: CAMP_POLICY });

    const chosen = await chooseDelve(db, {
      ...OPTIONS,
      now: waited,
      policy: CAMP_POLICY,
      optionId: 'r0c1',
    });
    expect(chosen.ok).toBe(true);
    expect((await loadMeta(db))?.meta.lastStepAt).toBe(waited);

    const report = await applyCatchUp(
      db,
      { ...OPTIONS, now: waited, policy: CAMP_POLICY },
      inProcess,
    );
    expect(report.ran).toBe(false);
    expect(report.steps).toBe(0);
  });
});

describe('Daily Challenge', () => {
  it('steps for free, settles exactly once, and never marks permanent progress', async () => {
    await addCompanion();
    const started = await startDailyDelve(db, OPTIONS);
    expect(started.ok).toBe(true);
    expect(started.run?.daily).toBe(true);
    expect(started.run?.companionLevel).toBe(12);

    const first = await stepDelve(db, { ...OPTIONS, policy: POLICY });
    expect(first.ok).toBe(true);
    expect(first.oilSpent).toBe(0);

    const report = await applyCatchUp(
      db,
      { ...OPTIONS, now: NOW + 200 * STEP_MS, policy: POLICY },
      inProcess,
    );
    expect(report.ended).toBe(true);
    expect(report.daily).toBeDefined();
    expect(report.steps).toBeGreaterThan(0);

    const wallet = (await loadMeta(db))!;
    expect(wallet.meta.daily.settled).toBe(true);
    expect(wallet.meta.dailyBest).toBeGreaterThanOrEqual(1);
    expect(wallet.meta.runsCleared).toBe(0);
    expect(wallet.meta.runsFainted).toBe(0);
    expect(wallet.meta.runsRetreated).toBe(0);
    expect(wallet.meta.clearedHollows).toEqual([]);
    expect(wallet.meta.materials).toEqual({ ore: 0, herb: 0, echo: 0 });
    expect(wallet.meta.embers).toBe(report.daily!.embers);

    const events = await db.rewards.toArray();
    expect(events.filter((event) => event.type === 'delve:daily')).toHaveLength(1);
    expect(events.some((event) => event.type === 'delve:floor')).toBe(false);
    expect(events.some((event) => event.type === 'delve:clear')).toBe(false);
    expect(await loadActiveRun(db)).toBeUndefined();

    const again = await stepDelve(db, { ...OPTIONS, policy: POLICY });
    expect(again.ok).toBe(false);
    expect(
      (await db.rewards.toArray()).filter((event) => event.type === 'delve:daily'),
    ).toHaveLength(1);
  });
});

describe('catch-up', () => {
  it('applies elapsed steps, spends oil, and persists the clock', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 5 * STEP_MS, maxSeenAt: NOW };
    const run = newRun(21, 1, 20, meta);
    await putRun(run, meta, 50);

    const report = await applyCatchUp(db, { ...OPTIONS, policy: POLICY }, inProcess);
    expect(report.ran).toBe(true);
    expect(report.steps).toBe(5);
    expect(report.oilSpent).toBe(5);
    expect(report.oil).toBe(45);
    expect(report.pending).toBe(false);
    expect(report.log.length).toBeGreaterThan(0);

    const stored = await loadRun(db, run.runId);
    expect(stored?.stepIndex).toBe(5);
    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(45);
    expect(wallet?.meta.lastStepAt).toBe(NOW);

    // Nothing new has elapsed, so a second pass is a no-op.
    const idle = await applyCatchUp(db, { ...OPTIONS, policy: POLICY }, inProcess);
    expect(idle.ran).toBe(false);
    expect(idle.steps).toBe(0);
  });

  it('consumes elapsed time while dry, so it cannot bank forever', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 10 * STEP_MS, maxSeenAt: NOW };
    const run = newRun(22, 1, 20, meta);
    await putRun(run, meta, 0);

    const report = await applyCatchUp(db, { ...OPTIONS, policy: POLICY }, inProcess);
    expect(report.steps).toBe(0);
    expect(report.oil).toBe(0);
    expect((await loadRun(db, run.runId))?.stepIndex).toBe(0);
    expect((await loadMeta(db))?.meta.lastStepAt).toBe(NOW);
  });

  it('pauses time while a choice waits', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 10 * STEP_MS, maxSeenAt: NOW };
    const run = forkRun();
    const pending: RunState = {
      ...run,
      pendingChoice: { kind: 'fork', options: [], reason: 'Choose a route.', stepIndex: 0 },
    };
    await putRun(pending, meta, 10);
    const report = await applyCatchUp(db, { ...OPTIONS, policy: CAMP_POLICY }, inProcess);
    expect(report.steps).toBe(0);
    expect((await loadMeta(db))?.meta.lastStepAt).toBe(NOW - 10 * STEP_MS);
    expect((await loadActiveRun(db))?.state.pendingChoice?.kind).toBe('fork');
  });

  it('persists a camp fork opened by catch-up at the same step index', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 2 * STEP_MS, maxSeenAt: NOW };
    await putRun(forkRun(), meta, 10);

    const report = await applyCatchUp(db, { ...OPTIONS, policy: CAMP_POLICY }, inProcess);
    expect(report.ran).toBe(false);
    expect(report.steps).toBe(0);
    expect(report.pending).toBe(true);
    const stored = await loadActiveRun(db);
    expect(stored?.stepIndex).toBe(0);
    expect(stored?.state.pendingChoice?.kind).toBe('fork');
    expect((await loadMeta(db))?.meta.lastStepAt).toBe(NOW);
  });

  it('grants nothing for a backwards clock and never lowers maxSeenAt', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    const run = newRun(23, 1, 20, meta);
    await putRun(run, meta, 50);
    const report = await applyCatchUp(
      db,
      { ...OPTIONS, now: NOW - 5 * STEP_MS, policy: POLICY },
      inProcess,
    );
    expect(report.steps).toBe(0);
    expect((await loadRun(db, run.runId))?.stepIndex).toBe(0);
    const wallet = await loadMeta(db);
    expect(wallet?.meta.lastStepAt).toBe(NOW);
    expect(wallet?.meta.maxSeenAt).toBe(NOW);
  });

  it('does not let a pre-clock run claim a giant backlog on first open', async () => {
    const meta = { ...emptyMeta(), lastStepAt: 0, maxSeenAt: 0 };
    const run = newRun(24, 1, 20, meta);
    await putRun(run, meta, 50);
    const report = await applyCatchUp(db, { ...OPTIONS, policy: POLICY }, inProcess);
    expect(report.steps).toBe(0);
    expect((await loadMeta(db))?.meta.lastStepAt).toBe(NOW);
  });
});

describe('meta progression actions', () => {
  it('buys a Forge node, raising capacity and charging Embers', async () => {
    await putMeta({ ...emptyMeta(), embers: 100 }, 10, 0);
    const out = await purchaseForge(db, { ...OPTIONS, nodeId: 'oilcap' });
    expect(out.ok).toBe(true);
    expect(out.wallet.meta.embers).toBe(88);
    expect(out.wallet.meta.forge.oilcap).toBe(1);
    expect(out.wallet.capacity).toBe(220);

    const stored = await loadMeta(db);
    expect(stored?.meta.embers).toBe(88);
    expect(stored?.meta.forge.oilcap).toBe(1);
  });

  it('refuses a Forge node without enough Embers', async () => {
    await putMeta({ ...emptyMeta(), embers: 3 }, 10, 0);
    const out = await purchaseForge(db, { ...OPTIONS, nodeId: 'maxhp' });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('Embers');
    expect((await loadMeta(db))?.meta.embers).toBe(3);
  });

  it('equips only unlocked, unique Habit Cards', async () => {
    await addCompanion();
    await addReward({ xp: 1100, type: 'milestone' }); // level 5
    await putMeta(emptyMeta(), 10, 0);
    const out = await setHabitCards(db, {
      ...OPTIONS,
      cardIds: ['mark-hunter', 'finisher'],
    });
    expect(out.ok).toBe(true);
    expect(out.wallet.meta.cards).toEqual(['mark-hunter', 'finisher']);
    expect((await loadMeta(db))?.meta.cards).toEqual(['mark-hunter', 'finisher']);

    const duplicate = await setHabitCards(db, {
      ...OPTIONS,
      cardIds: ['mark-hunter', 'mark-hunter'],
    });
    expect(duplicate.ok).toBe(false);
    const locked = await setHabitCards(db, { ...OPTIONS, cardIds: ['ember-first'] });
    expect(locked.ok).toBe(false);
    const tooMany = await setHabitCards(db, {
      ...OPTIONS,
      cardIds: ['rainy-day', 'opening-move', 'steady-hand', 'finisher'],
    });
    expect(tooMany.ok).toBe(false);
  });

  it('unlocks Realm buildings only from real budgeting milestones', async () => {
    await addCompanion();
    await putMeta(emptyMeta(), 10, 0);
    const before = await loadBuildingMilestones(db);
    expect(before.milestones.treasury).toBe(false);
    expect(before.milestones.workshop).toBe(true);

    await db.goals.add({
      id: 'goal-1',
      name: 'Rainy day',
      target: 1000,
      saved: 1000,
      icon: 'jar',
      archived: false,
    });
    await addReward({ type: 'review' });
    for (let i = 0; i < 30; i++) {
      await db.transactions.add({
        id: `tx-${i}`,
        kind: 'expense',
        amount: 1,
        date: addDays(TODAY, -i),
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    await addReward({ xp: LEVELS[10]!, type: 'milestone' });

    const after = await loadBuildingMilestones(db);
    expect(after.milestones).toMatchObject({
      treasury: true,
      library: true,
      observatory: true,
      smithy: true,
      workshop: true,
    });

    const unlock = await unlockRealmBuilding(db, { ...OPTIONS, buildingId: 'treasury' });
    expect(unlock.ok).toBe(true);
    expect(unlock.wallet.meta.buildingLevels.treasury).toBe(1);
    const again = await unlockRealmBuilding(db, { ...OPTIONS, buildingId: 'treasury' });
    expect(again.ok).toBe(false);
    expect(again.reason).toContain('Already unlocked');
    expect((await loadMeta(db))?.meta.buildingLevels.treasury).toBe(1);
  });
});

describe('Heat', () => {
  it('only opens after a hollow clear and stays inside 0-5', async () => {
    await addCompanion();
    await addReward({ xp: 4000, type: 'milestone' });
    await addReward({ oil: 60, type: 'oil:log' });
    const locked = await startDelve(db, { ...OPTIONS, hollow: 1, heat: 1 });
    expect(locked.ok).toBe(false);
    expect(locked.reason).toContain('Heat');

    const silly = await startDelve(db, { ...OPTIONS, hollow: 1, heat: HEAT_MAX + 1 });
    expect(silly.ok).toBe(false);

    await putMeta({ ...emptyMeta(), clearedHollows: [1] }, 60, 0);
    const heat = await startDelve(db, { ...OPTIONS, hollow: 1, heat: 2 });
    expect(heat.ok).toBe(true);
    expect(heat.run?.heat).toBe(2);
  });
});
