/**
 * The Delve engine. Pure and deterministic: stepRun(run, ctx) advances the run by one room
 * (consuming 1 Lantern Oil), resolveChoice resolves a pending decision, and both return the
 * next state plus ledger hooks for the persistence layer. The clock is injected — the engine
 * never reads Date.now() or Math.random().
 */

import { OIL_STORAGE_CAP } from '../rewards';
import {
  autopilotBoon,
  autopilotEvent,
  autopilotFork,
  buildBoonOffer,
  offerRng,
} from './autopilot';
import { BASE_MODIFIERS, computeModifiers, companionBase, runCombat } from './combat';
import { affixById } from './data/affixes';
import { buildById, DEFAULT_BUILD } from './data/builds';
import { MAX_BOON_LEVEL, RELICS, type BoonLike } from './data/boons';
import { BOSSES } from './data/enemies';
import { eventsForHollow, type EventOutcome } from './data/events';
import { anyBoonById, fusionById, fusionRecipesFor, type FusionDef } from './data/fusions';
import { forgeTotals } from './forge';
import { generateFloor, HOLLOW_FLOORS } from './map';
import { computeBuffs } from './signals';
import { lookaheadRows, masteryMult } from './buildings';
import { gainMastery } from './mastery';
import { addMaterials, dropMaterials } from './workshop';
import type {
  ChoiceOption,
  DelveMeta,
  HollowId,
  RoomDef,
  RunLogEntry,
  RunState,
  StepContext,
  StepOutcome,
  TurnDecider,
  TurnOrder,
} from './types';

const CLEAR_BONUS: Record<HollowId, number> = { 1: 25, 2: 30, 3: 45 };
/** Hard boon slot cap; Gate 1.6 fusions free slots to make room. */
const BOON_CAP = 8;
/** The Lantern can only refine this many Embers per local day (anti-grind). */
const EMBER_DAILY_CAP = 50;
/** Heat caps at 5 (SPEC 6.11 F: Heat 1 to 5 at MVP). */
export const HEAT_MAX = 5;

/** Heat reward multiplier: about 1.1 per level (Embers and Sparks only). */
export function heatRewardMult(heat: number): number {
  return 1 + Math.max(0, Math.min(HEAT_MAX, Math.trunc(heat))) * 0.1;
}

/** Heat unlocks for a hollow once it has been cleared; never forced. */
export function heatUnlocked(meta: DelveMeta, hollow: HollowId): boolean {
  return meta.clearedHollows.includes(hollow);
}

/** Bank Embers into the meta, clamped by the daily refinement cap. */
export function bankEmbers(
  meta: DelveMeta,
  amount: number,
  today: string,
): { meta: DelveMeta; banked: number } {
  const m = meta.embersDay === today ? { ...meta } : { ...meta, embersDay: today, embersToday: 0 };
  const banked = Math.min(Math.max(0, Math.trunc(amount)), EMBER_DAILY_CAP - m.embersToday);
  m.embersToday += banked;
  m.embers += banked;
  return { meta: m, banked };
}

export function hollowUnlocked(hollow: HollowId, meta: DelveMeta, companionLevel: number): boolean {
  if (hollow === 1) return true;
  if (hollow === 2) return meta.clearedHollows.includes(1) && companionLevel >= 3;
  return meta.clearedHollows.includes(2) && companionLevel >= 5;
}

export function emptyMeta(): DelveMeta {
  return {
    embers: 0,
    clearedHollows: [],
    builds: {},
    knownWeaknesses: [],
    bossKnowledge: [],
    cards: [],
    bestFloor: {},
    forge: {},
    runsStarted: 0,
    runsCleared: 0,
    runsFainted: 0,
    runsRetreated: 0,
    lastClearDate: {},
    embersDay: '',
    embersToday: 0,
    materials: { ore: 0, herb: 0, echo: 0 },
    consumableStock: {},
    equippedConsumables: [],
    buildingLevels: {},
    mastery: {},
    codex: [],
    daily: { date: '', played: false },
    dailyBest: 0,
    maxSeenAt: 0,
    lastStepAt: 0,
    skills: {},
    knownSkills: [],
    equippedSkills: [],
    dust: 0,
    capsules: {},
    capsuleIndex: 0,
    pitySinceEpic: 0,
    capsuleTagStreak: 0,
  };
}

export function newRun(
  userSeed: number,
  hollowId: HollowId,
  companionLevel: number,
  meta: DelveMeta,
  buildId: string = DEFAULT_BUILD,
  heat = 0,
): RunState {
  const build = buildById(buildId) ?? buildById(DEFAULT_BUILD)!;
  const h = Math.max(0, Math.min(HEAT_MAX, Math.trunc(heat)));
  const base = companionBase(companionLevel);
  const plan = generateFloor(userSeed, hollowId, 1, h);
  const smithy = meta.buildingLevels?.['smithy'] ?? 0;
  const smithyAtk = smithy > 0 ? Math.round((base.atk + build.profile.atkAdd) * 0.03 * smithy) : 0;
  return {
    runId: `d${hollowId}-${userSeed.toString(16)}-${meta.runsStarted + 1}`,
    userSeed,
    hollowId,
    companionLevel,
    buildId: build.id,
    tree: meta.builds[build.id]?.tree ?? [],
    cards: (meta.cards ?? []).slice(0, 3),
    stepIndex: 0,
    floor: 1,
    row: 0,
    path: [],
    floorPlan: plan,
    unit: {
      id: 'companion',
      kind: 'companion',
      name: build.name,
      hp: base.hp + build.profile.hpAdd,
      maxHp: base.maxHp + build.profile.hpAdd,
      atk: base.atk + build.profile.atkAdd + smithyAtk,
      def: base.def + build.profile.defAdd,
      spd: base.spd + build.profile.spdAdd,
      luck: base.luck + build.profile.luckAdd,
    },
    boons: [],
    boonLevels: {},
    relics: [],
    glint: 0,
    embersEarned: 0,
    heat: h,
    rerollsLeft: forgeTotals(meta.forge).rerolls ?? 0,
    offerStreak: 0,
    relicFlags: {},
    consumables: (meta.equippedConsumables ?? []).slice(0, 3),
    consumablesUsed: {},
    materials: { ore: 0, herb: 0, echo: 0 },
    buildings: { ...(meta.buildingLevels ?? {}) },
    daily: false,
    result: 'active',
    pendingChoice: null,
    log: [],
    roomsVisited: [],
    orders: [],
    floorRule: null,
    skipOutstanding: false,
  };
}

interface EconomyMods {
  startGlint: number;
  shopDiscount: number;
  embersBonus: number;
}

export function economyMods(run: RunState, forge: Record<string, number>): EconomyMods {
  const mods: EconomyMods = {
    startGlint: (forge.startGlint ?? 0) + (run.buildings?.['treasury'] ?? 0) * 10,
    shopDiscount: 0,
    embersBonus: forge.embersBonus ?? 0,
  };
  const tags = new Map<string, number>();
  for (const id of run.boons) {
    const b = anyBoonById(id);
    if (!b) continue;
    const lvl = run.boonLevels[id] ?? 1;
    tags.set(b.tag, (tags.get(b.tag) ?? 0) + 1);
    const fx = b.fx;
    if (fx.kind === 'startGlint') mods.startGlint += fx.amount * lvl;
    else if (fx.kind === 'shopDiscount') mods.shopDiscount += fx.percent * lvl;
    else if (fx.kind === 'embersBonus') mods.embersBonus += fx.percent * lvl;
  }
  if ((tags.get('thrift') ?? 0) >= 3) mods.shopDiscount += 15;
  if ((tags.get('thrift') ?? 0) >= 5) mods.startGlint += 20;
  if ((tags.get('fortune') ?? 0) >= 5) mods.embersBonus += 10;
  if (run.relics.includes('relic-coupon')) mods.shopDiscount += 20;
  if (run.relics.includes('relic-fossil')) mods.embersBonus += 25;
  if (run.relics.includes('relic-piggybank')) mods.startGlint += 20;
  mods.shopDiscount = Math.min(60, mods.shopDiscount);
  mods.embersBonus = Math.min(50, mods.embersBonus);
  return mods;
}

function roomLabel(room: RoomDef): string {
  const names: Record<string, string> = {
    skirmish: 'Skirmish',
    elite: 'Elite',
    treasure: 'Treasure',
    rest: 'Rest',
    shop: 'Shop',
    event: 'Event',
    boss: 'Boss',
  };
  return names[room.kind] ?? room.kind;
}

function pushLog(
  run: RunState,
  type: RunLogEntry['type'],
  text: string,
  data?: Record<string, unknown>,
): RunState {
  return { ...run, log: [...run.log, { step: run.stepIndex, type, text, data }] };
}

function currentRoom(run: RunState): RoomDef {
  const rowDefs = run.floorPlan.rows[run.row] ?? [];
  if (rowDefs.length === 1) return rowDefs[0]!;
  return rowDefs[run.path[run.row] ?? 0]!;
}

/** Record the column picked for the current row; single-width rows keep a zero placeholder. */
function withPath(run: RunState, col: number): number[] {
  const p = run.path.slice(0, run.row);
  while (p.length < run.row) p.push(0);
  p.push(col);
  return p;
}

function needsFork(run: RunState): boolean {
  const rowDefs = run.floorPlan.rows[run.row] ?? [];
  return rowDefs.length > 1 && run.path[run.row] === undefined;
}

function forkOptions(row: readonly RoomDef[], lookahead?: string[]): ChoiceOption[] {
  return row.map((r) => {
    const parts: string[] = [];
    if (r.enemies.length > 0) parts.push(`Enemies: ${r.enemies.length}`);
    if (r.affixes && r.affixes.length > 0) {
      parts.push(r.affixes.map((id) => affixById(id)?.name ?? id).join(' + '));
    }
    if (lookahead) parts.push(`→ ${lookahead.join(' · ')}`);
    return {
      id: r.id,
      label: roomLabel(r),
      detail: parts.length > 0 ? parts.join(' · ') : undefined,
    };
  });
}

function floorStartGlint(run: RunState, forge: Record<string, number>): number {
  return economyMods(run, forge).startGlint;
}

function healHp(run: RunState, percent: number): RunState {
  const mods = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
  const maxHp = run.unit.maxHp + mods.maxHp;
  const heal = Math.round((maxHp * percent) / 100);
  return { ...run, unit: { ...run.unit, hp: Math.min(maxHp, run.unit.hp + heal) } };
}

function maxHpOf(run: RunState): number {
  return run.unit.maxHp + computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 }).maxHp;
}

/** Pick a boon (or fusion boon): first pick adds it at level 1; re-picks level it up to 3. */
function applyBoonPick(run: RunState, boon: BoonLike): RunState {
  const held = run.boons.includes(boon.id);
  const lvl = run.boonLevels[boon.id] ?? 0;
  let next: RunState;
  if (held) {
    if (lvl >= MAX_BOON_LEVEL) return run;
    next = {
      ...run,
      boonLevels: { ...run.boonLevels, [boon.id]: lvl + 1 },
    };
    next = pushLog(next, 'reward', `${boon.name} upgraded to level ${lvl + 1}.`);
  } else {
    next = {
      ...run,
      boons: [...run.boons, boon.id],
      boonLevels: { ...run.boonLevels, [boon.id]: 1 },
    };
  }
  const fx = boon.fx;
  if (fx.kind === 'healNow') next = healHp(next, fx.percent * (held ? lvl + 1 : 1));
  return next;
}

/** Choice label for a boon; held boons show the level they would reach. */
function boonOptionLabel(run: RunState, b: BoonLike): string {
  const held = run.boons.includes(b.id);
  const suffix = held ? ` (Lv${(run.boonLevels[b.id] ?? 0) + 1})` : '';
  return `${b.name}${suffix} (${b.rarity} ${b.tag})`;
}

/** Fuse option for a recipe the run currently qualifies for. */
function fuseOption(f: FusionDef): ChoiceOption {
  const [a, b] = f.from.map((id) => anyBoonById(id)?.name ?? id);
  return {
    id: `fuse:${f.id}`,
    label: `Fuse: ${f.name}`,
    detail: `${a} + ${b} → ${f.name}. ${f.effect}`,
  };
}

/** Consume two ingredients and grant the fused boon; null when the recipe does not apply. */
function applyFusion(run: RunState, recipeId: string): RunState | null {
  const recipe = fusionById(recipeId);
  if (!recipe) return null;
  const [a, b] = recipe.from;
  if (!run.boons.includes(a) || !run.boons.includes(b)) return null;
  const boonLevels = { ...run.boonLevels };
  delete boonLevels[a];
  delete boonLevels[b];
  const stripped: RunState = {
    ...run,
    boons: run.boons.filter((id) => id !== a && id !== b),
    boonLevels,
  };
  const next = applyBoonPick(stripped, recipe);
  const aName = anyBoonById(a)?.name ?? a;
  const bName = anyBoonById(b)?.name ?? b;
  return pushLog(next, 'choice', `Fused ${aName} + ${bName} → ${recipe.name}!`);
}

function grantBoonOffer(
  run: RunState,
  policy: StepContext['policy'],
): { run: RunState; pending: boolean } {
  if (run.boons.length >= BOON_CAP) {
    return { run: pushLog(run, 'info', 'Boon slots full; no offer.'), pending: false };
  }
  const { offer, offerStreak } = buildBoonOffer(
    run,
    3 + (run.relics.includes('relic-ledgerlace') ? 1 : 0),
  );
  const next = { ...run, offerStreak };
  if (policy.mode === 'camp') {
    return {
      run: {
        ...next,
        pendingChoice: {
          kind: 'boon',
          options: [
            ...offer.map((b) => ({
              id: b.id,
              label: boonOptionLabel(run, b),
              detail: b.effect,
            })),
            ...(run.rerollsLeft > 0
              ? [
                  {
                    id: 'reroll',
                    label: `Reroll offer (${run.rerollsLeft} left)`,
                    detail: 'Draw a fresh set of boons.',
                  },
                ]
              : []),
          ],
          reason: 'Choose a boon.',
          stepIndex: next.stepIndex,
        },
      },
      pending: true,
    };
  }
  const pick = autopilotBoon(policy, offer);
  return { run: pushLog(applyBoonPick(next, pick.boon), 'choice', pick.reason), pending: false };
}

interface AdvanceOutcome {
  run: RunState;
  meta: DelveMeta;
  ledger: StepOutcome['ledger'];
  ended: boolean;
}

/** Move to the next room/floor; handle floor rewards, clears, and run endings. */
function advanceAfterRoom(run: RunState, ctx: StepContext): AdvanceOutcome {
  let meta = { ...ctx.meta };
  const ledger: StepOutcome['ledger'] = [];
  let next = run;

  if (next.result !== 'active') return { run: next, meta, ledger, ended: true };

  const rows = next.floorPlan.rows.length;
  if (next.row + 1 < rows) {
    next = { ...next, row: next.row + 1 };
    return { run: next, meta, ledger, ended: false };
  }

  // Floor complete. Same-day re-clears of a hollow pay 25% (Ember fatigue).
  const floor = next.floor;
  const fatigue = meta.lastClearDate[next.hollowId] === ctx.today ? 0.25 : 1;
  const heatMult = heatRewardMult(next.heat);
  const reward = 4 + floor;
  const bonus = economyMods(next, forgeTotals(meta.forge)).embersBonus;
  const gained = Math.max(1, Math.round(((reward * (100 + bonus)) / 100) * fatigue * heatMult));
  next = { ...next, embersEarned: next.embersEarned + gained };
  // The Daily Challenge has its own settlement at the end; it never mines the main ledger.
  if (!next.daily) {
    ledger.push({
      key: `delve:floor:${next.runId}:${floor}`,
      type: 'delve:floor',
      xp: 10,
      sparks: Math.max(1, Math.round(heatMult)),
    });
  }
  next = pushLog(
    next,
    'reward',
    `Floor ${floor} complete: +${gained} Embers${fatigue < 1 ? ' (fatigued)' : ''}.`,
  );

  if (floor >= HOLLOW_FLOORS[next.hollowId]) {
    const clearBonus = Math.max(
      1,
      Math.round(((CLEAR_BONUS[next.hollowId] * (100 + bonus)) / 100) * fatigue * heatMult),
    );
    next = {
      ...next,
      embersEarned: next.embersEarned + clearBonus,
      result: 'cleared',
      pendingChoice: null,
    };
    if (next.daily) {
      next = pushLog(
        next,
        'end',
        `Daily Challenge cleared through floor ${floor}. Reward settles when the run is stored.`,
      );
      return { run: next, meta, ledger, ended: true };
    }
    const bankedAll = bankEmbers(meta, next.embersEarned, ctx.today);
    meta = settleRunEnd(bankedAll.meta, next);
    meta.clearedHollows = [...new Set([...meta.clearedHollows, next.hollowId])];
    meta.runsCleared += 1;
    meta.lastClearDate = { ...meta.lastClearDate, [next.hollowId]: ctx.today };
    ledger.push({
      key: `delve:clear:${next.runId}`,
      type: 'delve:clear',
      xp: 60,
      sparks: Math.max(1, Math.round(10 * heatMult)),
    });
    next = pushLog(
      next,
      'end',
      `Hollow ${next.hollowId} cleared! +${clearBonus} bonus Embers (${bankedAll.banked} banked today).`,
    );
    return { run: next, meta, ledger, ended: true };
  }

  const newFloor = floor + 1;
  const glintGain = floorStartGlint(next, forgeTotals(meta.forge));
  next = {
    ...next,
    floor: newFloor,
    row: 0,
    path: [],
    floorPlan: generateFloor(next.userSeed, next.hollowId, newFloor, next.heat),
    glint: next.glint + glintGain,
  };
  if (next.relics.includes('relic-trailmix')) next = healHp(next, 8);
  return { run: next, meta, ledger, ended: false };
}

/** Bank gathered materials and consume spent consumables when a run ends. */
function settleRunEnd(meta: DelveMeta, run: RunState): DelveMeta {
  let m = {
    ...meta,
    materials: addMaterials(meta.materials ?? { ore: 0, herb: 0, echo: 0 }, run.materials),
  };
  const used = run.consumablesUsed ?? {};
  const kept = (m.equippedConsumables ?? []).filter((id) => !used[id]);
  if (kept.length !== m.equippedConsumables.length) m = { ...m, equippedConsumables: kept };
  return m;
}

function endRun(
  run: RunState,
  meta: DelveMeta,
  result: 'retreated' | 'fainted',
  today: string,
): { run: RunState; meta: DelveMeta } {
  const next = { ...run, result, pendingChoice: null, orders: [] };
  // A finished run has no room to wait in, whether it ended between rooms or mid-fight.
  delete next.pendingTurn;
  // A Daily run is isolated from permanent progress: no Embers bank, no counters, no materials.
  if (next.daily) {
    const label = result === 'retreated' ? 'Retreat' : 'Faint';
    return {
      run: pushLog(next, 'end', `Daily Challenge ${label.toLowerCase()}: run over.`),
      meta,
    };
  }
  const settled = settleRunEnd(meta, next);
  if (result === 'retreated') {
    const { meta: m, banked } = bankEmbers(settled, next.embersEarned, today);
    m.runsRetreated += 1;
    return {
      run: pushLog(next, 'end', `Retreat: ${banked} of ${next.embersEarned} Embers banked.`),
      meta: m,
    };
  }
  const pct = run.relics.includes('relic-safebox') ? 70 : 60;
  const kept = Math.floor((next.embersEarned * pct) / 100);
  const { meta: m, banked } = bankEmbers(settled, kept, today);
  m.runsFainted += 1;
  return {
    run: pushLog(next, 'end', `Faint: ${banked} of ${kept} Embers banked (${pct}%).`),
    meta: m,
  };
}

/** Leave the Hollow on purpose: bank every Ember earned, keep the run in history. */
export function retreatRun(
  run: RunState,
  meta: DelveMeta,
  today: string,
): { run: RunState; meta: DelveMeta } {
  if (run.result !== 'active') return { run, meta };
  return endRun(
    pushLog(run, 'choice', 'Retreat sounded the lantern; the companion starts home.'),
    meta,
    'retreated',
    today,
  );
}

function shopItems(
  run: RunState,
  forge: Record<string, number>,
): { id: string; label: string; cost: number; detail: string }[] {
  const discount = economyMods(run, forge).shopDiscount;
  const heatPrice = run.heat >= 5 ? 1.25 : 1; // Heat 5: pricier shops
  const price = (base: number) =>
    Math.max(1, Math.round(((base * (100 - discount)) / 100) * heatPrice));
  return [
    { id: 'heal', label: 'Poultice (heal 30%)', cost: price(40), detail: 'Heal 30% HP' },
    { id: 'boon', label: 'Wandering boon', cost: price(80), detail: 'Gain a boon' },
    {
      id: 'maxhp',
      label: 'Heartroot (+10 max HP)',
      cost: price(30),
      detail: '+10 max HP this run',
    },
    { id: 'relic', label: 'Mystery relic', cost: price(120), detail: 'Gain a random relic' },
    { id: 'leave', label: 'Leave', cost: 0, detail: 'Nothing for now' },
  ];
}

function autopilotShop(
  run: RunState,
  forge: Record<string, number>,
): { itemId: string; reason: string } {
  const items = shopItems(run, forge);
  const hpRatio = Math.round((run.unit.hp / maxHpOf(run)) * 100);
  if (hpRatio < 70 && run.glint >= items[0]!.cost) {
    return { itemId: 'heal', reason: `Autopilot: HP at ${hpRatio}%, buying a Poultice.` };
  }
  if (run.glint >= items[1]!.cost) {
    return { itemId: 'boon', reason: 'Autopilot: spare Glint, buying a wandering boon.' };
  }
  return {
    itemId: 'leave',
    reason: 'Autopilot: nothing affordable worth buying; leaving the shop.',
  };
}

function autopilotRest(
  run: RunState,
  policy: StepContext['policy'],
): { choice: 'rest' | 'retreat' | 'fuse'; reason: string; recipeId?: string } {
  const eligible = fusionRecipesFor(run);
  if (policy.route === 'greedy' && eligible.length > 0) {
    const f = eligible[0]!;
    return {
      choice: 'fuse',
      recipeId: f.id,
      reason: `Autopilot: greedy route fuses ${f.name} instead of resting.`,
    };
  }
  const hpRatio = Math.round((run.unit.hp / maxHpOf(run)) * 100);
  // The last-row Rest on the floor before the boss floor is the last safe place to turn back.
  const nextIsBossFloor =
    run.floor === HOLLOW_FLOORS[run.hollowId] - 1 && run.row === run.floorPlan.rows.length - 1;
  const gate = policy.bossGate?.[run.hollowId];
  if (nextIsBossFloor && gate !== undefined && run.companionLevel < gate) {
    return {
      choice: 'retreat',
      reason: `Autopilot: level ${run.companionLevel} below the boss gate (${gate}), retreating to train.`,
    };
  }
  if (hpRatio <= policy.retreatHpPercent) {
    return {
      choice: 'retreat',
      reason: `Autopilot: HP at ${hpRatio}% (threshold ${policy.retreatHpPercent}%), retreating to bank Embers.`,
    };
  }
  return { choice: 'rest', reason: `Autopilot: HP at ${hpRatio}%, resting.` };
}

function isFightRoom(room: RoomDef): boolean {
  return room.kind === 'skirmish' || room.kind === 'elite' || room.kind === 'boss';
}

/**
 * Who answers for the companion on a hand-played step: the orders the run already carries are
 * replayed in the order they were given, then the player's new order is taken once, and after that
 * the room stops and asks again. `order` is absent when the caller only wants the room rebuilt, in
 * which case the fight pauses at the same round it was left in.
 */
function turnDecider(stored: readonly TurnOrder[], order: TurnOrder | undefined): TurnDecider {
  let taken = 0;
  return () => {
    if (taken < stored.length) return stored[taken++]!;
    const answer = taken === stored.length ? (order ?? null) : null;
    taken += 1;
    return answer;
  };
}

/**
 * One fight room, from the moment it is entered to the room after it. The run has already been
 * stepped into the room (step index, visited trail and room line are in place), so the same call
 * serves both a fresh entry and a replay of a room a stored run is waiting in — only `spent`
 * differs, because a resumed room was paid for when it was first entered.
 */
function fightRoom(
  run: RunState,
  room: RoomDef,
  ctx: StepContext,
  spent: number,
  ledger: StepOutcome['ledger'],
): StepOutcome {
  const buffs = computeBuffs(ctx.signals);
  const mods = computeModifiers(run, forgeTotals(ctx.meta.forge), buffs);
  // Sightings open codex entries before the fight resolves (win, lose, or escape).
  let stepMeta: DelveMeta = {
    ...ctx.meta,
    codex: [...new Set([...(ctx.meta.codex ?? []), ...room.enemies])],
  };
  const result = runCombat(
    run,
    room,
    mods,
    run.floor,
    stepMeta.knownWeaknesses ?? [],
    stepMeta.bossKnowledge ?? [],
    stepMeta.mastery ?? {},
    ctx.play ? turnDecider(run.orders, ctx.order) : undefined,
  );
  if (result.pause) {
    // The room stores its decisions, not their outcome: no fight line, no kill and no consumable
    // spend is merged, so the replay that finishes the room reports each of them exactly once. The
    // companion's HP is left at the value the fight started from — storing the partial number would
    // have the replay take every hit twice. The pause snapshot carries it for the readout.
    return {
      run: { ...run, orders: [...result.pause.orders], pendingTurn: true },
      meta: ctx.meta,
      ledger,
      oilSpent: spent,
      ended: false,
      pause: result.pause,
    };
  }
  let next: RunState = {
    ...run,
    orders: [],
    log: [...run.log, ...result.log],
    consumablesUsed: { ...run.consumablesUsed, ...result.consumablesUsed },
  };
  delete next.pendingTurn;
  if (result.fled) {
    next = { ...next, unit: { ...next.unit, hp: result.hpAfter } };
    next = pushLog(next, 'info', 'Smoke Scroll: you slip past the room at 1 HP.');
    const adv = advanceAfterRoom(next, { ...ctx, meta: stepMeta });
    return {
      run: adv.run,
      meta: adv.meta,
      ledger: [...ledger, ...adv.ledger],
      oilSpent: spent,
      ended: adv.ended,
    };
  }
  if (result.drawn) {
    stepMeta = gainMastery(stepMeta, result.kills, masteryMult(stepMeta));
    const ended = endRun(
      { ...next, unit: { ...next.unit, hp: result.hpAfter } },
      stepMeta,
      'retreated',
      ctx.today,
    );
    return { run: ended.run, meta: ended.meta, ledger, oilSpent: spent, ended: true };
  }
  if (!result.won) {
    // Boss Study: fainting to a boss permanently reveals its weakness and tells.
    let faintMeta = stepMeta;
    let faintRun = { ...next, unit: { ...next.unit, hp: 0 } };
    if (room.kind === 'boss' && room.enemies.length > 0) {
      const boss = BOSSES.find((b) => b.id === room.enemies[0]);
      if (boss) {
        faintMeta = {
          ...faintMeta,
          bossKnowledge: [...new Set([...faintMeta.bossKnowledge, boss.id])],
          knownWeaknesses: [...new Set([...faintMeta.knownWeaknesses, boss.weakness])],
        };
        faintRun = pushLog(
          faintRun,
          'info',
          `Boss Study: ${boss.name}'s weakness and tells revealed.`,
        );
      }
    }
    const ended = endRun(faintRun, faintMeta, 'fainted', ctx.today);
    return { run: ended.run, meta: ended.meta, ledger, oilSpent: spent, ended: true };
  }
  next = { ...next, unit: { ...next.unit, hp: result.hpAfter } };
  stepMeta = gainMastery(stepMeta, result.kills, masteryMult(stepMeta));
  // Won fights drop materials, deterministic per run and room.
  const drops = dropMaterials(next, room);
  if (drops.ore + drops.herb + drops.echo > 0) {
    next = { ...next, materials: addMaterials(next.materials, drops) };
    const parts = [
      drops.ore > 0 ? `${drops.ore} Ore` : '',
      drops.herb > 0 ? `${drops.herb} Herb` : '',
      drops.echo > 0 ? `${drops.echo} Echo` : '',
    ].filter(Boolean);
    next = pushLog(next, 'reward', `Materials: +${parts.join(', ')}.`);
  }
  // Rainy Day Fund: once per run, heal to 50% when HP is at or below 30%.
  if (
    next.relics.includes('relic-rainyday') &&
    !next.relicFlags['relic-rainyday'] &&
    result.hpAfter > 0 &&
    result.hpAfter <= Math.round(result.maxHp * 0.3)
  ) {
    const target = Math.round(result.maxHp * 0.5);
    next = pushLog(
      {
        ...next,
        unit: { ...next.unit, hp: target },
        relicFlags: { ...next.relicFlags, 'relic-rainyday': true },
      },
      'info',
      'Rainy Day Fund: healed to 50% HP.',
    );
  }
  if (room.kind === 'skirmish' || room.kind === 'elite') {
    // Boons after every elite/treasure, but only ~half of skirmishes (Ember economy guard).
    const offerChance = room.kind === 'skirmish' ? 35 : 80;
    if (offerRng(next, 'offer-chance').int(100) >= offerChance) {
      const adv = advanceAfterRoom(next, { ...ctx, meta: stepMeta });
      return {
        run: adv.run,
        meta: adv.meta,
        ledger: [...ledger, ...adv.ledger],
        oilSpent: spent,
        ended: adv.ended,
      };
    }
    const offer = grantBoonOffer(next, ctx.policy);
    if (offer.pending) {
      return { run: offer.run, meta: stepMeta, ledger, oilSpent: spent, ended: false };
    }
    next = offer.run;
  }
  // The tail deliberately keeps the caller's meta, exactly as the room used to: whether a win
  // banks its mastery is what the golden hashes pin, and 7b-3 is not the gate that changes it.
  const adv = advanceAfterRoom(next, ctx);
  return {
    run: adv.run,
    meta: adv.meta,
    ledger: [...ledger, ...adv.ledger],
    oilSpent: spent,
    ended: adv.ended,
  };
}

export function stepRun(run: RunState, ctx: StepContext): StepOutcome {
  const empty: StepOutcome = { run, meta: ctx.meta, ledger: [], oilSpent: 0, ended: false };
  if (run.result !== 'active' || run.pendingChoice !== null) return empty;
  // A room that is waiting for an order is already entered and paid for: the step replays the orders
  // the run carries, takes the new one, and leaves the room line and the step index exactly where
  // the pause put them. Without an order it only rebuilds the menu, which is how a reload resumes.
  if (run.pendingTurn) {
    if (!ctx.play) return empty;
    const room = currentRoom(run);
    if (!isFightRoom(room)) return empty;
    return fightRoom(run, room, ctx, 0, []);
  }
  if (ctx.oil < 1 && !run.daily) return empty;

  const forge = forgeTotals(ctx.meta.forge);
  const spent = run.daily ? 0 : 1;
  let next = run;
  const ledger: StepOutcome['ledger'] = [];

  // Row entry: resolve forks (inline under Autopilot, pending under camp).
  if (needsFork(next)) {
    const row = next.floorPlan.rows[next.row]!;
    if (ctx.policy.mode === 'camp') {
      const look = lookaheadRows(ctx.meta);
      const lookRow =
        look > 0 && next.row + 1 < next.floorPlan.rows.length
          ? next.floorPlan.rows[next.row + 1]
          : undefined;
      next = {
        ...next,
        pendingChoice: {
          kind: 'fork',
          options: forkOptions(
            row,
            lookRow?.map((r) => roomLabel(r)),
          ),
          reason: 'Choose a route.',
          stepIndex: next.stepIndex,
        },
      };
      return { run: next, meta: ctx.meta, ledger, oilSpent: 0, ended: false };
    }
    const pick = autopilotFork(next, ctx.policy, row);
    const col = row.findIndex((r) => r.id === pick.room.id);
    next = pushLog({ ...next, path: withPath(next, col) }, 'choice', pick.reason);
  }

  const room = currentRoom(next);
  next = {
    ...next,
    stepIndex: next.stepIndex + 1,
    roomsVisited: [...next.roomsVisited, room.id],
  };
  next = pushLog(next, 'room', `${roomLabel(room)} room: ${room.id}.`);

  if (isFightRoom(room)) {
    return fightRoom(next, room, ctx, spent, ledger);
  } else if (room.kind === 'treasure') {
    const gain = 25 * (next.relics.includes('relic-firstcoin') && next.row === 0 ? 2 : 1);
    next = { ...next, glint: next.glint + gain };
    next = pushLog(next, 'reward', `Treasure: +${gain} Glint.`);
    if (offerRng(next, 'treasure-offer').int(100) >= 60) {
      const adv = advanceAfterRoom(next, ctx);
      return {
        run: adv.run,
        meta: adv.meta,
        ledger: [...ledger, ...adv.ledger],
        oilSpent: spent,
        ended: adv.ended,
      };
    }
    const offer = grantBoonOffer(next, ctx.policy);
    if (offer.pending) {
      return { run: offer.run, meta: ctx.meta, ledger, oilSpent: spent, ended: false };
    }
    next = offer.run;
  } else if (room.kind === 'shop') {
    if (ctx.policy.mode === 'camp') {
      next = {
        ...next,
        pendingChoice: {
          kind: 'shop',
          options: shopItems(next, forge).map((i) => ({
            id: i.id,
            label: i.cost > 0 ? `${i.label} — ${i.cost}g` : i.label,
            detail: i.detail,
          })),
          reason: 'Browse the shop.',
          stepIndex: next.stepIndex,
        },
      };
      return { run: next, meta: ctx.meta, ledger, oilSpent: spent, ended: false };
    }
    const buy = autopilotShop(next, forge);
    const applied = applyShopPurchase(next, buy.itemId, forge);
    next = pushLog(applied.run, 'choice', buy.reason);
  } else if (room.kind === 'event') {
    const events = eventsForHollow(next.hollowId);
    const event = events[room.optionSeed % events.length]!;
    const safeFirst = next.relics.includes('relic-stamp');
    const options = safeFirst ? [...event.options].reverse() : [...event.options];
    const affordable = options.filter(
      (o) =>
        !(o.outcome.kind === 'glint' && o.outcome.amount < 0 && next.glint < -o.outcome.amount),
    );
    const fuses = fusionRecipesFor(next);
    if (ctx.policy.mode === 'camp') {
      next = {
        ...next,
        pendingChoice: {
          kind: 'event',
          options: [
            ...affordable.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
            ...fuses.map((f) => fuseOption(f)),
          ],
          reason: `${event.title} — ${event.text}`,
          stepIndex: next.stepIndex,
        },
      };
      return { run: next, meta: ctx.meta, ledger, oilSpent: spent, ended: false };
    }
    const pick = autopilotEvent(next, ctx.policy, {
      options: affordable.map((o) => ({ id: o.id, label: o.label, detail: o.detail })),
    });
    const option = event.options.find((o) => o.id === pick.optionId) ?? event.options[0]!;
    const applied = applyEventOutcome(next, option.outcome, ctx);
    next = pushLog(applied.run, 'choice', `${event.title} — ${pick.reason}`);
  } else if (room.kind === 'rest') {
    if (ctx.policy.mode === 'camp') {
      next = {
        ...next,
        pendingChoice: {
          kind: 'rest',
          options: [
            { id: 'rest', label: 'Rest and recover', detail: 'Heal 40% HP' },
            { id: 'retreat', label: 'Retreat to camp', detail: `Bank ${next.embersEarned} Embers` },
            ...fusionRecipesFor(next).map((f) => fuseOption(f)),
          ],
          reason: 'A safe room. Catch your breath, or head home.',
          stepIndex: next.stepIndex,
        },
      };
      return { run: next, meta: ctx.meta, ledger, oilSpent: spent, ended: false };
    }
    const rest = autopilotRest(next, ctx.policy);
    if (rest.choice === 'retreat') {
      const ended = endRun(pushLog(next, 'choice', rest.reason), ctx.meta, 'retreated', ctx.today);
      return { run: ended.run, meta: ended.meta, ledger, oilSpent: spent, ended: true };
    }
    if (rest.choice === 'fuse') {
      const fused = applyFusion(next, rest.recipeId!);
      next = fused ? pushLog(fused, 'info', rest.reason) : next;
    } else {
      const healPct = 40 + (next.relics.includes('relic-nightlight') ? 15 : 0);
      next = pushLog(healHp(next, healPct), 'choice', rest.reason);
    }
  }

  const adv = advanceAfterRoom(next, ctx);
  return {
    run: adv.run,
    meta: adv.meta,
    ledger: [...ledger, ...adv.ledger],
    oilSpent: spent,
    ended: adv.ended,
  };
}

function applyShopPurchase(
  run: RunState,
  itemId: string,
  forge: Record<string, number>,
): { run: RunState } {
  const items = shopItems(run, forge);
  const item = items.find((i) => i.id === itemId);
  if (!item || item.cost > run.glint) return { run };
  let next = { ...run, glint: run.glint - item.cost };
  if (itemId === 'heal') next = healHp(next, 30);
  else if (itemId === 'maxhp') {
    const maxHp = maxHpOf(next) + 10;
    next = {
      ...next,
      unit: { ...next.unit, maxHp: next.unit.maxHp + 10, hp: Math.min(maxHp, next.unit.hp + 10) },
    };
  } else if (itemId === 'boon') {
    if (next.boons.length >= BOON_CAP) return { run };
    const { offer } = buildBoonOffer(next, 1);
    const boon = offer[0];
    if (boon) next = applyBoonPick(next, boon);
  } else if (itemId === 'relic') {
    const pool = RELICS.filter((r) => !next.relics.includes(r.id));
    if (pool.length > 0) {
      const relic = pool[offerRng(next, 'shop-relic').int(pool.length)]!;
      next = { ...next, relics: [...next.relics, relic.id] };
      next = pushLog(next, 'reward', `Gained relic: ${relic.name}.`);
    }
  }
  return { run: next };
}

function applyEventOutcome(
  run: RunState,
  outcome: EventOutcome,
  ctx: StepContext,
): { run: RunState } {
  let next = run;
  if (outcome.kind === 'heal') next = healHp(next, outcome.percent);
  else if (outcome.kind === 'damage') {
    const hp = Math.max(0, next.unit.hp - outcome.amount);
    next = { ...next, unit: { ...next.unit, hp } };
  } else if (outcome.kind === 'glint')
    next = { ...next, glint: Math.max(0, next.glint + outcome.amount) };
  else if (outcome.kind === 'embers')
    next = { ...next, embersEarned: next.embersEarned + outcome.amount };
  else if (outcome.kind === 'boon') {
    const offer = grantBoonOffer(next, ctx.policy);
    return { run: offer.run };
  }
  return { run: next };
}

export function resolveChoice(run: RunState, ctx: StepContext, optionId: string): StepOutcome {
  const empty: StepOutcome = { run, meta: ctx.meta, ledger: [], oilSpent: 0, ended: false };
  const choice = run.pendingChoice;
  if (run.result !== 'active' || choice === null) return empty;
  const forge = forgeTotals(ctx.meta.forge);
  let next = run;
  const ledger: StepOutcome['ledger'] = [];

  switch (choice.kind) {
    case 'fork': {
      const row = next.floorPlan.rows[next.row]!;
      const col = row.findIndex((r) => r.id === optionId);
      if (col < 0) return empty;
      next = pushLog(
        { ...next, path: withPath(next, col), pendingChoice: null },
        'choice',
        `Chose the ${roomLabel(row[col]!)} room.`,
      );
      return { run: next, meta: ctx.meta, ledger, oilSpent: 0, ended: false };
    }
    case 'boon': {
      if (optionId === 'reroll') {
        if (next.rerollsLeft <= 0) return empty;
        const count = choice.options.filter((o) => o.id !== 'reroll').length;
        const { offer } = buildBoonOffer(
          next,
          count,
          `offer-${next.stepIndex}-reroll-${next.rerollsLeft}`,
        );
        const rerollsLeft = next.rerollsLeft - 1;
        next = {
          ...next,
          rerollsLeft,
          pendingChoice: {
            kind: 'boon',
            options: [
              ...offer.map((b) => ({
                id: b.id,
                label: boonOptionLabel(next, b),
                detail: b.effect,
              })),
              ...(rerollsLeft > 0
                ? [
                    {
                      id: 'reroll',
                      label: `Reroll offer (${rerollsLeft} left)`,
                      detail: 'Draw a fresh set of boons.',
                    },
                  ]
                : []),
            ],
            reason: 'Choose a boon.',
            stepIndex: next.stepIndex,
          },
        };
        return { run: next, meta: ctx.meta, ledger, oilSpent: 0, ended: false };
      }
      const boon = anyBoonById(optionId);
      if (!boon) return empty;
      next = pushLog(
        { ...applyBoonPick(next, boon), pendingChoice: null },
        'choice',
        `Chose boon: ${boon.name}.`,
      );
      break;
    }
    case 'shop': {
      const before = next.glint;
      const applied = applyShopPurchase(next, optionId, forge);
      if (applied.run.glint === before && optionId !== 'leave') return empty;
      next = pushLog({ ...applied.run, pendingChoice: null }, 'choice', `Shop: ${optionId}.`);
      break;
    }
    case 'event': {
      if (optionId.startsWith('fuse:')) {
        const fused = applyFusion(next, optionId.slice(5));
        if (!fused) return empty;
        next = { ...fused, pendingChoice: null };
        break;
      }
      const events = eventsForHollow(next.hollowId);
      const room = currentRoom(next);
      const event = events[room.optionSeed % events.length]!;
      const option = event.options.find((o) => o.id === optionId);
      if (!option) return empty;
      const applied = applyEventOutcome(next, option.outcome, ctx);
      // A boon outcome can raise a follow-up offer; other outcomes resolve cleanly.
      const nextPending = option.outcome.kind === 'boon' ? applied.run.pendingChoice : null;
      next = pushLog(
        { ...applied.run, pendingChoice: nextPending },
        'choice',
        `${event.title} — ${option.label}.`,
      );
      break;
    }
    case 'rest': {
      if (optionId === 'retreat') {
        const ended = endRun(next, ctx.meta, 'retreated', ctx.today);
        next = ended.run;
        return { run: next, meta: ended.meta, ledger, oilSpent: 0, ended: true };
      }
      if (optionId.startsWith('fuse:')) {
        const fused = applyFusion(next, optionId.slice(5));
        if (!fused) return empty;
        next = { ...fused, pendingChoice: null };
        break;
      }
      if (optionId !== 'rest') return empty;
      const healPct = 40 + (next.relics.includes('relic-nightlight') ? 15 : 0);
      next = pushLog(
        { ...healHp(next, healPct), pendingChoice: null },
        'choice',
        'Rested and recovered.',
      );
      break;
    }
  }

  if (next.pendingChoice !== null) {
    return { run: next, meta: ctx.meta, ledger, oilSpent: 0, ended: false };
  }
  const adv = advanceAfterRoom({ ...next, pendingChoice: null }, ctx);
  return {
    run: adv.run,
    meta: adv.meta,
    ledger: [...ledger, ...adv.ledger],
    oilSpent: 0,
    ended: adv.ended,
  };
}

/**
 * Oil bookkeeping. Grants come from the reward ledger (free trickle + habits); the Delve only
 * spends. Capacity is the storage cap plus Forge plus the Reviewer's Lantern buff.
 */
export function oilCapacity(meta: DelveMeta, reviewedLast7d: boolean): number {
  const forge = forgeTotals(meta.forge);
  return OIL_STORAGE_CAP + (forge.oilCapacity ?? 0) + (reviewedLast7d ? 25 : 0);
}

export function spendOil(oil: number, amount: number): number {
  return Math.max(0, oil - Math.max(0, Math.trunc(amount)));
}

export { BASE_MODIFIERS, computeModifiers, companionBase, runCombat };
export type { CombatModifiers } from './combat';
export type { StepOutcome };
export { BOSSES };
