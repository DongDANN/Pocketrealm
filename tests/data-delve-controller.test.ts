/**
 * Gate 4a — the Delve controller. These tests drive the public data API, not the engine helpers:
 * they prove that a screen action becomes exactly one guarded write, that Lantern Oil buys a run
 * start and nothing inside it, that a Daily Challenge never contaminates permanent progress, and
 * that a hand-played room is answered with an order instead of simulated on a timer.
 */

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { NO_SIGNALS, NOW, TODAY } from './delve-helpers';
import {
  HEAT_MAX,
  FREE_SKILL_IDS,
  builtinDecider,
  emptyMeta,
  newRun,
  skillById,
  type CombatPause,
  type DelveMeta,
  type HollowId,
  type RunState,
} from '../src/core/delve';
import { LEVELS } from '../src/core/rewards';
import type { RewardEvent } from '../src/core/types';
import type { PocketDb } from '../src/data/db';
import {
  chooseDelve,
  clearRealmPassive,
  craftCapsuleAction,
  dismissCapsuleRevealAction,
  equipRealmPassive,
  equipRealmSkill,
  forgetRealmSkill,
  learnRealmSkill,
  levelUpRealmSkill,
  listDelveHistory,
  loadBuildingMilestones,
  loadDelveSnapshot,
  loadDelveSignals,
  normalizeMeta,
  unequipRealmSkill,
  openCapsuleAction,
  purchaseForge,
  retreatDelve,
  startDailyDelve,
  startDelve,
  stepDelve,
  syncDelveWallet,
  unlockRealmBuilding,
} from '../src/data/delve';
import { META_KEY, createRun, loadActiveRun, loadMeta, loadRun } from '../src/data/delveStore';
import { dbOn } from './data-harness';

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

/** Play the active run to its end through the public API, answering rooms like a player. */
async function playToEnd(): Promise<void> {
  let pause: CombatPause | undefined;
  for (let i = 0; i < 600; i++) {
    const active = await loadActiveRun(db);
    if (!active) return;
    if (active.state.pendingChoice) {
      const out = await chooseDelve(db, {
        ...OPTIONS,
        optionId: active.state.pendingChoice.options[0]!.id,
      });
      expect(out.ok, out.reason).toBe(true);
      pause = undefined;
      continue;
    }
    const out = await stepDelve(
      db,
      pause && active.state.pendingTurn
        ? { ...OPTIONS, order: builtinDecider(pause.state) }
        : OPTIONS,
    );
    expect(out.ok, out.reason).toBe(true);
    pause = out.pause;
  }
  throw new Error('the run never settled');
}

describe('normalizeMeta', () => {
  it('fills the current shape and drops malformed fields', () => {
    expect(normalizeMeta(null)).toEqual(emptyMeta());
    const meta = normalizeMeta({
      embers: 12.9,
      clearedHollows: [2, 2, 9, 'x'],
      materials: { ore: 3, herb: -4 },
      daily: { date: '2026-10-25', played: true, settled: true },
      forge: { atk: 2.8, bad: 'x' },
      lastStepAt: -5,
    });
    expect(meta.embers).toBe(12);
    expect(meta.clearedHollows).toEqual([2]);
    expect('cards' in meta).toBe(false);
    expect(meta.materials).toEqual({ ore: 3, herb: 0, echo: 0 });
    expect(meta.daily).toEqual({ date: '2026-10-25', played: true, settled: true });
    expect(meta.forge).toEqual({ atk: 2 });
    expect(meta.lastStepAt).toBe(0);
    expect(meta.builds).toEqual({});
    expect(meta.dailyBest).toBe(0);
  });

  it('keeps the provenance ledger and clamps it like every other count', () => {
    expect(normalizeMeta({ materials: { ore: 3 } }).materialsFrom).toBeUndefined();
    const meta = normalizeMeta({
      materials: { ore: 3, herb: 1, echo: 0 },
      materialsFrom: {
        1: { ore: 2, herb: 1 },
        2: { ore: 1, herb: -2 },
        9: { ore: 5 },
        x: { ore: 7 },
      },
    });
    expect(meta.materialsFrom).toEqual({
      1: { ore: 2, herb: 1, echo: 0 },
      2: { ore: 1, herb: 0, echo: 0 },
    });
  });

  it('drops a reveal the catalogue could not show and re-derives its tier', () => {
    const stored = { index: 3, ceiling: 'epic', skillId: 'skill-cold-bar', rarity: 'common' };
    expect(normalizeMeta({ capsuleReveal: stored }).capsuleReveal).toEqual({
      index: 3,
      ceiling: 'epic',
      skillId: 'skill-cold-bar',
      rarity: 'rare',
      duplicate: false,
    });
    // A ceiling that is not a capsule make, and a skill this build does not ship, are both discarded:
    // printing either would name a thing the Codex cannot show.
    expect(
      normalizeMeta({ capsuleReveal: { ...stored, ceiling: 'gold' } }).capsuleReveal,
    ).toBeNull();
    expect(
      normalizeMeta({ capsuleReveal: { ...stored, skillId: 'skill-not-a-skill' } }).capsuleReveal,
    ).toBeNull();
    expect(normalizeMeta({ capsuleReveal: null }).capsuleReveal).toBeNull();
    expect(normalizeMeta({}).capsuleReveal).toBeUndefined();
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

  it('charges the Hollow price once, at the start, and refuses a lamp that cannot pay', async () => {
    await addCompanion();
    await addReward({ xp: 4000, type: 'milestone' });
    await putMeta({ ...emptyMeta(), clearedHollows: [1, 2] as HollowId[] }, 99, 0);
    let oil = 99;
    for (const [hollow, cost] of [
      [1, 20],
      [2, 24],
      [3, 28],
    ] as const) {
      const started = await startDelve(db, { ...OPTIONS, hollow });
      expect(started.ok).toBe(true);
      expect(started.wallet.oil).toBe(oil - cost);
      expect((await loadMeta(db))?.oil).toBe(oil - cost);
      oil -= cost;
      await retreatDelve(db, OPTIONS);
    }
    // 99 - 20 - 24 - 28 leaves 27, one short of another deepest-Hollow run.
    const short = await startDelve(db, { ...OPTIONS, hollow: 3 });
    expect(short.ok).toBe(false);
    expect(short.reason).toContain('costs 28 oil');
    expect(await loadActiveRun(db)).toBeUndefined();
  });

  it('steps a paid run for free and persists the advance', async () => {
    const started = await startReadyRun();
    expect(started.wallet.oil).toBe(40);
    const before = started.wallet.oil;
    const tick = await stepDelve(db, { ...OPTIONS });
    expect(tick.ok).toBe(true);
    expect(tick.run?.stepIndex).toBe(1);
    expect(tick.wallet.oil).toBe(before);

    const stored = await loadRun(db, started.run!.runId);
    expect(stored?.stepIndex).toBe(1);
    expect(stored?.state.log.some((entry) => entry.type === 'room')).toBe(true);
    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(before);
    expect(wallet?.meta.lastStepAt).toBe(NOW);
  });

  it('keeps stepping a run whose lamp ran dry after the start', async () => {
    const started = await startReadyRun(20);
    expect(started.wallet.oil).toBe(0);
    const tick = await stepDelve(db, { ...OPTIONS });
    expect(tick.ok).toBe(true);
    expect(tick.run?.stepIndex).toBe(1);
    expect((await loadMeta(db))?.oil).toBe(0);
  });

  it('banks a retreat, closes the run, and keeps it in history', async () => {
    const started = await startReadyRun();
    await stepDelve(db, { ...OPTIONS });
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
  it('stores a camp fork at step zero without spending or the step clock', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW - 300_000, maxSeenAt: NOW };
    const run = forkRun();
    await putRun(run, meta, 10);
    const tick = await stepDelve(db, { ...OPTIONS });
    expect(tick.ok).toBe(true);
    expect(tick.run?.stepIndex).toBe(0);
    expect(tick.run?.pendingChoice?.kind).toBe('fork');

    const stored = await loadActiveRun(db);
    expect(stored?.state.pendingChoice?.kind).toBe('fork');
    const wallet = await loadMeta(db);
    expect(wallet?.oil).toBe(10);
    expect(wallet?.meta.lastStepAt).toBe(NOW - 300_000);
  });

  it('resolves a fork, then steps into the chosen room', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    const run = forkRun();
    await putRun(run, meta, 10);
    await stepDelve(db, { ...OPTIONS });

    const chosen = await chooseDelve(db, {
      ...OPTIONS,
      optionId: 'r0c1',
    });
    expect(chosen.ok).toBe(true);
    expect(chosen.run?.pendingChoice).toBeNull();
    expect(chosen.run?.path[0]).toBe(1);
    expect((await loadActiveRun(db))?.state.pendingChoice).toBeNull();

    const stepped = await stepDelve(db, { ...OPTIONS });
    expect(stepped.ok).toBe(true);
    expect(stepped.run?.stepIndex).toBe(1);
    expect(stepped.run?.pendingChoice?.kind).toBe('rest');
    expect((await loadActiveRun(db))?.state.pendingChoice?.kind).toBe('rest');
  });

  it('rejects an option that is no longer offered', async () => {
    const meta = { ...emptyMeta(), lastStepAt: NOW, maxSeenAt: NOW };
    await putRun(forkRun(), meta, 10);
    await stepDelve(db, { ...OPTIONS });
    const bad = await chooseDelve(db, {
      ...OPTIONS,
      optionId: 'not-a-room',
    });
    expect(bad.ok).toBe(false);
    expect((await loadActiveRun(db))?.state.pendingChoice?.kind).toBe('fork');
  });
});

describe('Daily Challenge', () => {
  it('steps for free, settles exactly once, and never marks permanent progress', async () => {
    await addCompanion();
    const started = await startDailyDelve(db, OPTIONS);
    expect(started.ok).toBe(true);
    expect(started.run?.daily).toBe(true);
    expect(started.run?.companionLevel).toBe(12);

    const first = await stepDelve(db, { ...OPTIONS });
    expect(first.ok).toBe(true);

    await playToEnd();

    const wallet = (await loadMeta(db))!;
    expect(wallet.meta.daily.settled).toBe(true);
    expect(wallet.meta.dailyBest).toBeGreaterThanOrEqual(1);
    expect(wallet.meta.runsCleared).toBe(0);
    expect(wallet.meta.runsFainted).toBe(0);
    expect(wallet.meta.runsRetreated).toBe(0);
    expect(wallet.meta.clearedHollows).toEqual([]);
    expect(wallet.meta.materials).toEqual({ ore: 0, herb: 0, echo: 0 });

    const events = await db.rewards.toArray();
    expect(events.filter((event) => event.type === 'delve:daily')).toHaveLength(1);
    expect(events.some((event) => event.type === 'delve:floor')).toBe(false);
    expect(events.some((event) => event.type === 'delve:clear')).toBe(false);
    expect(await loadActiveRun(db)).toBeUndefined();

    const again = await stepDelve(db, { ...OPTIONS });
    expect(again.ok).toBe(false);
    expect(
      (await db.rewards.toArray()).filter((event) => event.type === 'delve:daily'),
    ).toHaveLength(1);
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

describe('capsules', () => {
  it('banks a finished run under the Hollow it walked, and that Hollow sets the capsule make', async () => {
    await addCompanion();
    const walked = {
      ...forkRun(),
      hollowId: 2 as HollowId,
      materials: { ore: 2, herb: 1, echo: 0 },
    };
    await putRun(walked, emptyMeta());
    const retreated = await retreatDelve(db, OPTIONS);
    expect(retreated.ok).toBe(true);

    const stored = await loadMeta(db);
    expect(stored?.meta.materials).toEqual({ ore: 2, herb: 1, echo: 0 });
    expect(stored?.meta.materialsFrom).toEqual({
      1: { ore: 0, herb: 0, echo: 0 },
      2: { ore: 2, herb: 1, echo: 0 },
      3: { ore: 0, herb: 0, echo: 0 },
    });

    const crafted = await craftCapsuleAction(db, OPTIONS);
    expect(crafted.ok, crafted.reason).toBe(true);
    expect(crafted.wallet.meta.capsules).toEqual({ epic: 1 });
    expect(crafted.wallet.meta.materials).toEqual({ ore: 0, herb: 0, echo: 0 });
  });

  it('grants the prize in the same write that prints the reveal, and reloads it unchanged', async () => {
    await addCompanion();
    await putMeta(
      { ...emptyMeta(), capsules: { epic: 2 }, materials: { ore: 9, herb: 9, echo: 0 } },
      50,
      0,
    );

    const out = await openCapsuleAction(db, { ...OPTIONS, ceiling: 'epic' });
    expect(out.ok, out.reason).toBe(true);
    const reveal = out.wallet.meta.capsuleReveal!;
    expect(reveal.rarity).not.toBe('common');
    expect(reveal.ceiling).toBe('epic');
    expect(skillById(reveal.skillId)).toBeDefined();
    expect(out.wallet.meta.skills[reveal.skillId]).toBeDefined();
    expect(out.wallet.meta.capsules).toEqual({ epic: 1 });
    expect(out.wallet.meta.capsuleIndex).toBe(1);

    // Reopening the app after the draw reads the same prize back out of the row it was written to.
    const stored = await loadMeta(db);
    expect(stored?.meta.capsuleReveal).toEqual(reveal);
    expect(Object.keys(stored?.meta.skills ?? {})).toContain(reveal.skillId);

    // Acknowledging clears the print but never the collection, and the next open is a new capsule.
    const dismissed = await dismissCapsuleRevealAction(db, OPTIONS);
    expect(dismissed.wallet.meta.capsuleReveal).toBeNull();
    expect(dismissed.wallet.meta.skills[reveal.skillId]).toBeDefined();

    const next = await openCapsuleAction(db, { ...OPTIONS, ceiling: 'epic' });
    expect(next.wallet.meta.capsuleReveal!.index).toBe(1);
    expect(next.wallet.meta.capsules).toEqual({ epic: 0 });
  });

  it('draws the same capsule twice for the same book, so a reload cannot reroll a prize', async () => {
    await addCompanion();
    const start = { ...emptyMeta(), capsules: { mythic: 1 } };
    await putMeta(start, 50, 0);
    const first = await openCapsuleAction(db, { ...OPTIONS, ceiling: 'mythic' });
    expect(first.ok).toBe(true);

    // The book is wound back to exactly the state before the open: the draw is keyed on the book seed
    // and the capsule number alone, so it lands on the same skill rather than a new roll.
    await putMeta(start, 50, 0);
    const again = await openCapsuleAction(db, { ...OPTIONS, ceiling: 'mythic' });
    expect(again.wallet.meta.capsuleReveal).toEqual(first.wallet.meta.capsuleReveal);
  });

  it('refuses to open a make the player is not holding and to craft without the price', async () => {
    await addCompanion();
    await putMeta({ ...emptyMeta(), embers: 400 }, 50, 0);
    const noCapsule = await openCapsuleAction(db, { ...OPTIONS, ceiling: 'rare' });
    expect(noCapsule.ok).toBe(false);
    expect((await loadMeta(db))?.meta.capsuleReveal ?? null).toBeNull();

    const noMaterials = await craftCapsuleAction(db, OPTIONS);
    expect(noMaterials.ok).toBe(false);
    expect(noMaterials.reason).toContain('2 Ore');
    expect((await loadMeta(db))?.meta.capsules).toEqual({});
    expect((await loadMeta(db))?.meta.embers).toBe(400);
  });
});

describe('Skill Dust and the level ladder', () => {
  const BASTION = 'warden-bastion';

  function book(level: number, dust: number): DelveMeta {
    return {
      ...emptyMeta(),
      dust,
      skills: { [BASTION]: { level, uses: 0, lifetime: 0 } },
    };
  }

  it('buys LV2 for 5 Dust and writes the rung to the book', async () => {
    await addCompanion();
    await putMeta(book(1, 20), 50, 0);
    const out = await levelUpRealmSkill(db, { ...OPTIONS, skillId: BASTION });
    expect(out.ok, out.reason).toBe(true);
    expect(out.wallet.meta.skills[BASTION]!.level).toBe(2);
    expect(out.wallet.meta.dust).toBe(15);

    const stored = await loadMeta(db);
    expect(stored?.meta.skills[BASTION]!.level).toBe(2);
    expect(stored?.meta.dust).toBe(15);
  });

  it('refuses a rung the book cannot pay for and writes nothing', async () => {
    await addCompanion();
    await putMeta(book(1, 4), 50, 0);
    const out = await levelUpRealmSkill(db, { ...OPTIONS, skillId: BASTION });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('LV2 costs 5 Skill Dust');
    expect(out.reason).toContain('has 4');

    const stored = await loadMeta(db);
    expect(stored?.meta.skills[BASTION]!.level).toBe(1);
    expect(stored?.meta.dust).toBe(4);
  });

  it('refuses to level a skill this player has never held', async () => {
    await addCompanion();
    await putMeta({ ...emptyMeta(), dust: 90 }, 50, 0);
    const out = await levelUpRealmSkill(db, { ...OPTIONS, skillId: BASTION });
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('does not hold');
    expect((await loadMeta(db))?.meta.dust).toBe(90);
  });
});

describe('the moveset and the know cap', () => {
  const CINDER = 'skill-cinder-cut';
  const CELLAR = 'skill-deep-cellar';
  const WARDEN_ACTIVES = ['warden-bastion', 'warden-shieldbash'];

  /** A book that has already been handed this capsule prize, at the level the test needs. */
  function book(ids: string[]): DelveMeta {
    return {
      ...emptyMeta(),
      knownSkills: ids,
      skills: { [CELLAR]: { level: 1, uses: 0, lifetime: 0 } },
    };
  }

  it('writes a learned skill and an equipped slot to the book, and reads them back', async () => {
    await addCompanion();
    await putMeta(book([]), 50, 0);
    const learned = await learnRealmSkill(db, { ...OPTIONS, skillId: CINDER });
    expect(learned.ok, learned.reason).toBe(true);
    expect(learned.wallet.meta.knownSkills).toEqual([CINDER]);

    const equipped = await equipRealmSkill(db, { ...OPTIONS, skillId: CINDER, buildId: 'warden' });
    expect(equipped.ok, equipped.reason).toBe(true);
    expect(equipped.wallet.meta.equippedSkills).toEqual([...WARDEN_ACTIVES, CINDER]);

    const passive = await equipRealmPassive(db, { ...OPTIONS, skillId: CELLAR, buildId: 'warden' });
    expect(passive.ok, passive.reason).toBe(false);
    expect(passive.reason).toContain('not known yet');

    const cellar = await learnRealmSkill(db, { ...OPTIONS, skillId: CELLAR });
    expect(cellar.ok, cellar.reason).toBe(true);
    const swapped = await equipRealmPassive(db, { ...OPTIONS, skillId: CELLAR, buildId: 'warden' });
    expect(swapped.ok, swapped.reason).toBe(true);
    expect(swapped.wallet.meta.equippedPassive).toBe(CELLAR);

    const stored = await loadMeta(db);
    expect(stored?.meta.knownSkills).toEqual([CINDER, CELLAR]);
    expect(stored?.meta.equippedSkills).toEqual([...WARDEN_ACTIVES, CINDER]);
    expect(stored?.meta.equippedPassive).toBe(CELLAR);

    const cleared = await clearRealmPassive(db, OPTIONS);
    expect(cleared.ok).toBe(true);
    expect((await loadMeta(db))?.meta.equippedPassive).toBeUndefined();
  });

  it('drops a learned skill back to the shelf without spending anything', async () => {
    await addCompanion();
    await putMeta(book([CINDER]), 50, 0);
    const before = (await loadMeta(db))!.meta;
    const out = await forgetRealmSkill(db, { ...OPTIONS, skillId: CINDER });
    expect(out.ok, out.reason).toBe(true);
    expect(out.wallet.meta.knownSkills).toEqual([]);
    expect(out.wallet.meta.dust).toBe(before.dust);
    expect(out.wallet.meta.capsuleIndex).toBe(before.capsuleIndex);
  });

  it('charges the know cap from the ledger level, not from a number the screen chose', async () => {
    await addCompanion();
    await putMeta(book([]), 50, 0);
    for (const id of FREE_SKILL_IDS.slice(0, 6)) {
      const out = await learnRealmSkill(db, { ...OPTIONS, skillId: id });
      expect(out.ok, `${id}: ${out.reason}`).toBe(true);
    }
    const seventh = await learnRealmSkill(db, { ...OPTIONS, skillId: FREE_SKILL_IDS[6]! });
    expect(seventh.ok).toBe(false);
    expect(seventh.reason).toContain('knows 6 skills');
  });

  it('refuses every moveset change while a run is in progress and writes nothing', async () => {
    const started = await startReadyRun();
    expect(started.ok, started.reason).toBe(true);
    const before = (await loadMeta(db))!.meta;

    const attempts = await Promise.all([
      learnRealmSkill(db, { ...OPTIONS, skillId: CINDER }),
      forgetRealmSkill(db, { ...OPTIONS, skillId: CINDER }),
      equipRealmSkill(db, { ...OPTIONS, skillId: CINDER, buildId: 'warden' }),
      unequipRealmSkill(db, { ...OPTIONS, skillId: CINDER, buildId: 'warden' }),
      equipRealmPassive(db, { ...OPTIONS, skillId: CELLAR, buildId: 'warden' }),
      clearRealmPassive(db, OPTIONS),
    ]);
    for (const out of attempts) {
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('Finish or retreat your current run before changing the moveset.');
    }
    const stored = await loadMeta(db);
    expect(stored?.meta.knownSkills).toEqual(before.knownSkills);
    expect(stored?.meta.equippedSkills).toEqual(before.equippedSkills);
    expect(stored?.meta.equippedPassive).toBeUndefined();
  });

  it('lets the same change through once the run is over, for nothing', async () => {
    const started = await startReadyRun();
    expect(started.ok).toBe(true);
    const blocked = await learnRealmSkill(db, { ...OPTIONS, skillId: CINDER });
    expect(blocked.ok).toBe(false);

    const retreat = await retreatDelve(db, OPTIONS);
    expect(retreat.ok).toBe(true);
    const after = await learnRealmSkill(db, { ...OPTIONS, skillId: CINDER });
    expect(after.ok, after.reason).toBe(true);
    expect(after.wallet.meta.knownSkills).toContain(CINDER);
  });

  it('starts a run that carries the equipped list, so the fight cannot read a newer book', async () => {
    await addCompanion();
    await addReward({ xp: 4000, type: 'milestone' });
    await putMeta(book([]), 60, 0);
    await learnRealmSkill(db, { ...OPTIONS, skillId: CINDER });
    const equipped = await equipRealmSkill(db, { ...OPTIONS, skillId: CINDER, buildId: 'warden' });
    expect(equipped.ok).toBe(true);

    const started = await startDelve(db, { ...OPTIONS, hollow: 1 });
    expect(started.ok, started.reason).toBe(true);
    expect(started.run).not.toBeNull();
    if (!started.run) return;
    expect(started.run.moveset).toEqual([...WARDEN_ACTIVES, CINDER]);
    expect(started.run.passiveId).toBeUndefined();
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
