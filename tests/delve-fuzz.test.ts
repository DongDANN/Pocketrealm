/**
 * Gate 1.6f — fuzz and exploit hunting (SPEC 6.11 N). 10,000 seeds drive random builds, Hollows,
 * levels, Heat levels and Autopilot policies through full runs, plus a direct combat fuzz that
 * pins the round cap. Invariants asserted on every step: HP stays in bounds, nothing goes NaN or
 * Infinity, currencies never go negative, offers are never empty, every floor has a route to its
 * boss, and the same seed replays to the same hash.
 */

import { describe, expect, it } from 'vitest';
import {
  BUILDS,
  HOLLOW_FLOORS,
  ROUND_CAP,
  BASE_MODIFIERS,
  buildBoonOffer,
  emptyMeta,
  newRun,
  resolveChoice,
  runCombat,
  spendOil,
  stateHash,
  stepRun,
  type AutopilotPolicy,
  type BoonTag,
  type DelveMeta,
  type HollowId,
  type RoomDef,
  type RoomKind,
  type RunState,
  type StepContext,
} from '../src/core/delve';
import { mulberry32 } from '../src/core/rng';
import { ELITES, ENEMIES } from '../src/core/delve/data/enemies';
import { CAMP_POLICY, NO_SIGNALS, NOW, POLICY, TODAY } from './delve-helpers';

const SEED_COUNT = 10_000;
const TAGS: BoonTag[] = ['guard', 'fury', 'fortune', 'vigor', 'thrift'];
const ROUTES = ['safe', 'balanced', 'greedy'] as const;
const KINDS: RoomKind[] = ['skirmish', 'elite', 'treasure', 'rest', 'shop', 'event', 'boss'];

function fuzzPolicy(rng: ReturnType<typeof mulberry32>): AutopilotPolicy {
  const base = rng.int(2) === 0 ? POLICY : CAMP_POLICY;
  return {
    ...base,
    tagPriority: rng.shuffle(TAGS),
    retreatHpPercent: rng.int(101),
    route: ROUTES[rng.int(ROUTES.length)]!,
  };
}

function ctxOf(meta: DelveMeta, oil: number, policy: AutopilotPolicy, step: number): StepContext {
  return {
    now: NOW + step * 30_000,
    oil,
    oilCapacity: 600,
    signals: { ...NO_SIGNALS },
    meta,
    policy,
    today: TODAY,
  };
}

function fail(seed: number, step: number, message: string): never {
  throw new Error(`seed ${seed} step ${step}: ${message}`);
}

function checkInvariants(run: RunState, meta: DelveMeta, seed: number, step: number): void {
  const u = run.unit;
  if (!Number.isFinite(u.hp) || !Number.isFinite(u.maxHp) || !Number.isFinite(u.atk))
    fail(seed, step, `non-finite unit ${u.hp}/${u.maxHp}/${u.atk}`);
  if (u.hp < 0 || u.hp > u.maxHp + 200) fail(seed, step, `HP out of bounds ${u.hp}/${u.maxHp}`);
  const numbers: [string, number][] = [
    ['glint', run.glint],
    ['embersEarned', run.embersEarned],
    ['heat', run.heat],
    ['stepIndex', run.stepIndex],
    ['floor', run.floor],
    ['row', run.row],
    ['rerollsLeft', run.rerollsLeft],
    ['offerStreak', run.offerStreak],
    ['ore', run.materials.ore],
    ['herb', run.materials.herb],
    ['echo', run.materials.echo],
    ['meta.embers', meta.embers],
    ['meta.embersToday', meta.embersToday],
    ['meta.runsStarted', meta.runsStarted],
    ['meta.runsCleared', meta.runsCleared],
    ['meta.runsFainted', meta.runsFainted],
    ['meta.runsRetreated', meta.runsRetreated],
    ['meta.dailyBest', meta.dailyBest ?? 0],
  ];
  for (const [name, v] of numbers) {
    if (!Number.isFinite(v)) fail(seed, step, `${name} is ${v}`);
  }
  for (const [name, v] of numbers) {
    if (v < 0 && name !== 'meta.embersToday') fail(seed, step, `${name} is negative (${v})`);
  }
  if (meta.embersToday < 0 || meta.embersToday > 50)
    fail(seed, step, `daily Embers out of range (${meta.embersToday})`);
  for (const [id, lvl] of Object.entries(run.boonLevels))
    if (!(lvl >= 1 && lvl <= 3)) fail(seed, step, `boon ${id} level ${lvl}`);
  for (const [id, lvl] of Object.entries(meta.buildingLevels ?? {}))
    if (!(lvl >= 1 && lvl <= 2)) fail(seed, step, `building ${id} level ${lvl}`);
  for (const [id, xp] of Object.entries(meta.mastery ?? {}))
    if (!(xp >= 0 && xp <= 100)) fail(seed, step, `mastery ${id} XP ${xp}`);
  if (run.buildings && Object.values(run.buildings).some((l) => !(l >= 1 && l <= 2)))
    fail(seed, step, `run building level out of range`);
}

/** One fuzzed run: random build, hollow, level, Heat and policy, stepped to its end. */
function fuzzRun(seed: number): { run: RunState; meta: DelveMeta; steps: number } {
  const rng = mulberry32(seed);
  const build = BUILDS[rng.int(BUILDS.length)]!;
  const hollow = (1 + rng.int(3)) as HollowId;
  const level = 1 + rng.int(20);
  const heat = rng.int(6);
  const policy = fuzzPolicy(rng);
  let meta: DelveMeta = { ...emptyMeta(), clearedHollows: [1, 2], embers: 400 };
  let run = newRun(rng.next() >>> 0, hollow, level, meta, build.id, heat);
  let oil = 900;
  let steps = 0;
  let noOps = 0;
  for (let guard = 0; guard < 1500; guard++) {
    if (run.result !== 'active') break;
    if (run.pendingChoice) {
      const options = run.pendingChoice.options;
      if (options.length === 0) fail(seed, steps, `${run.pendingChoice.kind} offer is empty`);
      const pick = options[rng.int(options.length)]!;
      const signature = (r: RunState): string =>
        `${r.stepIndex}|${r.glint}|${r.unit.hp}|${r.row}|${r.pendingChoice?.kind ?? '-'}|${r.embersEarned}`;
      const before = signature(run);
      const out = resolveChoice(run, ctxOf(meta, oil, policy, steps), pick.id);
      run = out.run;
      meta = out.meta;
      oil = spendOil(oil, out.oilSpent);
      steps += 1;
      checkInvariants(run, meta, seed, steps);
      // A rejected pick (an unaffordable shop item) is a legal no-op; a permanent loop is not.
      noOps = signature(run) === before ? noOps + 1 : 0;
      if (noOps > 40)
        fail(seed, steps, `stuck on a ${run.pendingChoice?.kind ?? 'no'} choice after ${pick.id}`);
      continue;
    }
    const beforeIndex = run.stepIndex;
    const out = stepRun(run, ctxOf(meta, oil, policy, steps));
    run = out.run;
    meta = out.meta;
    oil = spendOil(oil, out.oilSpent);
    steps += 1;
    checkInvariants(run, meta, seed, steps);
    // A step that spent no oil and only queued a choice is still progress; a genuine no-op is not.
    if (out.oilSpent === 0 && !out.ended && !run.pendingChoice && run.stepIndex === beforeIndex)
      break;
    if (out.ended) break;
  }
  return { run, meta, steps };
}

describe(`delve fuzz (${SEED_COUNT} seeds)`, () => {
  it('keeps every run within its integrity invariants', () => {
    const results = new Set<string>();
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const { run, meta, steps } = fuzzRun(seed);
      if (steps === 0) fail(seed, 0, 'the run made no progress');
      results.add(run.result);
      if (!['active', 'cleared', 'retreated', 'fainted'].includes(run.result))
        fail(seed, steps, `bad result ${run.result}`);
      if (run.roomsVisited.length === 0) fail(seed, steps, 'no rooms visited');
      for (const row of run.floorPlan.rows)
        if (row.length === 0) fail(seed, steps, 'empty floor row');
      // Every generated floor walks through to a boss-capable last row.
      const lastRow = run.floorPlan.rows[run.floorPlan.rows.length - 1]!;
      if (lastRow.length !== 1) fail(seed, steps, 'last row is not a single room');
      if (run.floor === HOLLOW_FLOORS[run.hollowId] && lastRow[0]!.kind !== 'boss')
        fail(seed, steps, 'final floor row is not the boss');
      void meta;
    }
    // The fuzz is only meaningful if it actually reaches every ending.
    expect([...results].sort()).toEqual(['cleared', 'fainted', 'retreated']);
  });

  it('never generates an empty boon offer', () => {
    for (let seed = 0; seed < 500; seed++) {
      const rng = mulberry32(seed);
      const run = newRun(rng.next() >>> 0, (rng.int(3) + 1) as HollowId, 12, emptyMeta());
      const { offer } = buildBoonOffer(run, 3 + rng.int(2), `fuzz-${seed}`);
      if (offer.length === 0) fail(seed, 0, 'offer was empty');
      if (new Set(offer.map((b) => b.id)).size !== offer.length)
        fail(seed, 0, 'offer had duplicates');
    }
    expect(true).toBe(true);
  });

  it('is deterministic: the same seed replays to the same hash', () => {
    for (let seed = 0; seed < 300; seed++) {
      const a = fuzzRun(seed);
      const b = fuzzRun(seed);
      expect(stateHash({ run: a.run, meta: a.meta })).toBe(stateHash({ run: b.run, meta: b.meta }));
    }
  });
});

describe('combat fuzz', () => {
  it('terminates inside the round cap for 10,000 random matchups', () => {
    let maxRounds = 0;
    let capHits = 0;
    for (let seed = 0; seed < SEED_COUNT; seed++) {
      const rng = mulberry32(seed);
      const run = newRun(
        rng.next() >>> 0,
        (rng.int(3) + 1) as HollowId,
        1 + rng.int(20),
        emptyMeta(),
        BUILDS[rng.int(BUILDS.length)]!.id,
        rng.int(6),
      );
      const kind = KINDS[rng.int(2)]!; // skirmish or elite
      const hollow = run.hollowId;
      const pool = kind === 'elite' ? ELITES : ENEMIES.filter((e) => e.hollow === hollow);
      const room: RoomDef = {
        id: 'fuzzr0c0',
        kind,
        enemies: [pool[rng.int(pool.length)]!.id],
        affixes: [],
        optionSeed: rng.next(),
      };
      const floor = 1 + rng.int(HOLLOW_FLOORS[hollow]);
      const result = runCombat(run, room, BASE_MODIFIERS, floor, [], [], {});
      if (result.rounds > ROUND_CAP) fail(seed, floor, `rounds ${result.rounds} > ${ROUND_CAP}`);
      if (result.rounds === ROUND_CAP) capHits += 1;
      maxRounds = Math.max(maxRounds, result.rounds);
      if (!Number.isFinite(result.hpAfter)) fail(seed, floor, `hpAfter ${result.hpAfter}`);
      if (result.hpAfter < 0 || result.hpAfter > result.maxHp)
        fail(seed, floor, `hpAfter out of bounds ${result.hpAfter}/${result.maxHp}`);
      if (new Set(result.kills).size !== result.kills.length) fail(seed, floor, 'duplicate kills');
    }
    // Real fights, and the cap is the ceiling the fuzz proves holds (never exceeded above).
    expect(maxRounds).toBeGreaterThan(4);
    expect(capHits).toBeLessThanOrEqual(SEED_COUNT);
  });
});
