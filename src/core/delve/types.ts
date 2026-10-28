/**
 * Delve domain types. Pure data — no React, no DOM, no IndexedDB, no clock reads.
 * A run is a seeded sequence of rooms; each room step consumes 1 Lantern Oil and produces
 * deterministic events. Everything below survives JSON round-trips (no functions, no Maps).
 */

import type { LocalDate } from '../types';
import type { CombatPause } from './combat';
import type { SkillDef } from './data/builds';
import type { Element } from './data/elements';

export type HollowId = 1 | 2 | 3;
export type BoonTag = 'guard' | 'fury' | 'fortune' | 'vigor' | 'thrift';
/**
 * `mythic` is the top of the skill catalogue (DELVE_REDESIGN §7 D.1). Boons and relics stop at
 * `epic`, so nothing in the offer pool ever reads the fifth tier.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';

export type RoomKind = 'skirmish' | 'elite' | 'treasure' | 'rest' | 'shop' | 'event' | 'boss';

/** Run materials dropped by fights and spent at the Workshop. */
export interface Materials {
  ore: number;
  herb: number;
  echo: number;
}

/** A status effect instance (on the companion or an enemy). */
export interface StatusInstance {
  id: string;
  stacks: number;
  duration: number;
}

export interface RoomDef {
  id: string;
  kind: RoomKind;
  /** Enemies in this room (empty for non-combat rooms). */
  enemies: string[];
  /** Set once generated; elite affixes arrive in the advanced gate. */
  affixes?: string[];
  /** Deterministic choice id for event/shop rooms. */
  optionSeed: number;
}

export interface FloorPlan {
  floor: number;
  /** 3-5 rows; the last row is the boss room. */
  rows: RoomDef[][];
}

export interface CombatUnitState {
  id: string;
  kind: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
}

export interface BoonDef {
  id: string;
  name: string;
  tag: BoonTag;
  rarity: Rarity;
  /** Human-readable effect for logs and UI. */
  effect: string;
}

export interface RelicDef {
  id: string;
  name: string;
  rarity: Rarity;
  effect: string;
}

export type ChoiceKind = 'boon' | 'fork' | 'shop' | 'event' | 'rest';

export interface PendingChoice {
  kind: ChoiceKind;
  /** Options the player picks from. */
  options: ChoiceOption[];
  reason: string;
  stepIndex: number;
}

export interface ChoiceOption {
  id: string;
  label: string;
  detail?: string;
}

/**
 * One round of the player's input, as the turn loop stores it (DELVE_REDESIGN §4 A.2).
 *
 * It is a decision, not a result: a room is rebuilt by replaying its orders against the same seed,
 * which is what keeps a hand-played run as deterministic as an auto-resolved one.
 *
 * The four actions of §4 A.3 are one round each: a skill, a brace, an item, or the basic attack
 * (`skillId` null and `guard` false). An order that asks for two actions at once, or for something the
 * rules cannot deliver this round, is not silently substituted — the seam stops and asks again.
 */
export interface TurnOrder {
  /** The skill to fire; null is the basic attack. */
  skillId: string | null;
  /** Index into `TurnState.targets` — the living enemies, in the order the menu lists them. */
  targetIndex: number;
  /** True to brace this round, which costs the action: no swing, and incoming blows are halved. */
  guard: boolean;
  /**
   * An item spent instead of an attack. Nothing in the game can be activated mid-round yet — the
   * consumables in `workshop.ts` are run-scoped triggers — so an order that names one is refused
   * rather than guessed at, until the Item action has rules to price (§4 A.3).
   */
  consumableId?: string;
}

/** One living enemy, as the decider is allowed to see it. */
export interface TurnTarget {
  hp: number;
  maxHp: number;
  marked: boolean;
  weakness: Element;
}

/**
 * The round being decided, assembled by `runCombat` immediately before it asks for an order. This is
 * the whole menu: energy, cooldowns and the living targets are everything the rules let a round turn
 * on, so an option can be priced from it without peeking at anything else (§4 A.1).
 */
export interface TurnState {
  round: number;
  energy: number;
  hp: number;
  maxHp: number;
  cooldowns: Record<string, number>;
  actives: SkillDef[];
  /** Living enemies in the companion's priority order (first living first). */
  targets: TurnTarget[];
}

/**
 * Who acts on the companion's turn. `null` means "no order yet", which stops the room and hands the
 * round back to the player (§4 A.2). Headless suites supply a decider that always answers.
 */
export type TurnDecider = (state: TurnState) => TurnOrder | null;

export type RunResult = 'active' | 'cleared' | 'retreated' | 'fainted';

export interface RunLogEntry {
  step: number;
  type: 'room' | 'combat' | 'choice' | 'reward' | 'end' | 'info';
  text: string;
  data?: Record<string, unknown>;
}

export interface RunState {
  runId: string;
  userSeed: number;
  hollowId: HollowId;
  companionLevel: number;
  /** Selected build; the talent tree is snapshotted from meta at run start. */
  buildId: string;
  tree: string[];
  /** Absolute step index; every applied step increments it. */
  stepIndex: number;
  floor: number;
  /** Current row within the floor plan. */
  row: number;
  /** Chosen column per row (fork choices); filled as forks resolve. */
  path: number[];
  floorPlan: FloorPlan;
  unit: CombatUnitState;
  boons: string[];
  /** Level per held boon id (1-3); a held boon can be offered again to level up. */
  boonLevels: Record<string, number>;
  relics: string[];
  glint: number;
  /** Embers earned so far this run (banked on retreat / 60% on faint / clear bonus). */
  embersEarned: number;
  /** Heat level 0-5: optional difficulty, never forced, no effect on budgeting. */
  heat: number;
  /** Boon-offer rerolls remaining this run (granted by the Forge tree). */
  rerollsLeft: number;
  /** Consecutive boon offers that missed the top tag (bad-luck protection). */
  offerStreak: number;
  /** Once-per-run relic flags. */
  relicFlags: Record<string, boolean>;
  /** Consumables equipped for this run (snapshot of the meta loadout, max 3). */
  consumables: string[];
  /**
   * The four actives this run fights with, snapshotted from the book at run start (§7 D.2). Absent
   * reads as the build's own two, so a book that has never equipped anything stores exactly what it
   * stored before the collection existed — and a paused room replays against the list it started with
   * even if the book changes while it waits.
   */
  moveset?: string[];
  /** The passive snapshotted the same way; absent reads as the build's own. */
  passiveId?: string;
  /** Consumables already spent this run (each triggers at most once). */
  consumablesUsed: Record<string, boolean>;
  /** Materials gathered this run (banked into the meta when the run ends). */
  materials: Materials;
  /** Realm building levels snapshotted at run start (Treasury/Smithy read these). */
  buildings: Record<string, number>;
  /** True for the Daily Challenge: fixed loadout, no oil cost, one attempt per local day. */
  daily: boolean;
  result: RunResult;
  pendingChoice: PendingChoice | null;
  log: RunLogEntry[];
  /** Room ids visited (anti-scumming trail). */
  roomsVisited: string[];
  /**
   * The player's orders for the room they are standing in, replayed in order to rebuild it one
   * round at a time. Empty once the room resolves — the run log is the history from then on.
   */
  orders: TurnOrder[];
  /**
   * True while the room the run stands in is waiting for the player's next order. Absent on a run
   * between rooms, so a stored shape that is not mid-fight does not grow a key it has no use for.
   */
  pendingTurn?: boolean;
  /**
   * The id of the floor rule in force (`no-ward-boons`, `guard-reflects`, …), or null on a floor
   * with no rule. Announced the moment the floor begins, with the next floor's rule already
   * printed (§8 E.1). Declared with the v3 shape so a stored run always answers for it.
   */
  floorRule: string | null;
  /**
   * True while the player has declined a reward for the ×1.8 that follows it. Only one skip can be
   * outstanding at a time, which is what stops skipping from compounding into a required line (§9).
   */
  skipOutstanding: boolean;
}

export interface ForgeLevels {
  [nodeId: string]: number;
}

export interface DelveMeta {
  embers: number;
  /** Best floor reached per hollow (for unlock checks). */
  clearedHollows: HollowId[];
  /** Per-build talent state: bought node ids and total Embers spent (free respec). */
  builds: Record<string, { tree: string[]; spent: number }>;
  /** Elements whose weaknesses the codex has revealed (+25% damage applies). */
  knownWeaknesses: Element[];
  /** Bosses studied by fainting to them: their weakness and tells are permanently revealed. */
  bossKnowledge: string[];
  bestFloor: Partial<Record<HollowId, number>>;
  forge: ForgeLevels;
  runsStarted: number;
  runsCleared: number;
  runsFainted: number;
  runsRetreated: number;
  /** Last local date each hollow was cleared (Ember fatigue anti-grind). */
  lastClearDate: Partial<Record<HollowId, LocalDate>>;
  /** Daily Ember refinement cap bookkeeping (date + amount banked that day). */
  embersDay: LocalDate;
  embersToday: number;
  /** Materials gathered from finished runs, spent at the Workshop. */
  materials: Materials;
  /** Crafted-but-unequipped consumables. */
  consumableStock: Record<string, number>;
  /** Equipped consumables (run-start slots, max 3). */
  equippedConsumables: string[];
  /** Realm building levels (0 = locked, 1 = unlocked via a real budgeting milestone). */
  buildingLevels: Record<string, number>;
  /** Mastery XP per enemy species (10 XP per kill, level = XP/10, capped at 10). */
  mastery: Record<string, number>;
  /** Enemy species sighted at least once (codex progress). */
  codex: string[];
  /** Daily Challenge: the local date of the record and whether the attempt was used. */
  daily: { date: LocalDate; played: boolean; settled?: boolean };
  /** Deepest floor reached in any Daily Challenge (local personal best). */
  dailyBest: number;
  /** Clock defense: highest wall-clock ms ever seen. */
  maxSeenAt: number;
  /** When the last step was applied (ms). */
  lastStepAt: number;
  /**
   * Collected skills, keyed by id. `level` is the rung bought with Skill Dust (1-5, and the only thing
   * a level buys today is §7 D.6's flat +8% potency); `lifetime` is every swing that landed, which is
   * what pays dust and what capsule relevance reads; `uses` is the remainder of that total toward the
   * next dust, so a run that ends early keeps its unfinished ten. Written by `settleSkillUses` when a
   * run ends and by a capsule when it is opened (DELVE_REDESIGN §7 D.6, §10.1).
   */
  skills: Record<string, { level: number; uses: number; lifetime: number }>;
  /** Species-and-skill ids the companion knows, i.e. can be equipped at all. */
  knownSkills: string[];
  /** The four slots the companion fights with. Respec is free between runs. */
  equippedSkills: string[];
  /**
   * The passive slot (§7 D.2 keeps the action bar at four, so a collected passive takes its own).
   * Absent reads as the build's own passive, which is the fight every book had before the collection.
   */
  equippedPassive?: string;
  /** Skill Dust: the single progression currency, earned by use and by duplicates. */
  dust: number;
  /** Held capsules, counted per tier ceiling — see §7 D.3. */
  capsules: Record<string, number>;
  /** How many capsules this book has ever issued; the draw key for a capsule's contents. */
  capsuleIndex: number;
  /** Capsules opened since the last Epic-or-better. At 10 the next one is an Epic. */
  pitySinceEpic: number;
  /** Capsules opened since the last one matched the player's most-used tag (§7 D.4, layer 3). */
  capsuleTagStreak: number;
  /**
   * Which Hollow each material came from. A capsule's tier ceiling is set by the deepest Hollow its
   * materials came from (§7 D.3), so the bank keeps provenance rather than one anonymous pile.
   * `materials` stays the total every screen prints, and the two always agree —
   * `tests/delve-capsules.test.ts` pins the invariant, because a drift would let Hollow 1 ore buy a
   * Mythic capsule.
   */
  materialsFrom?: Partial<Record<HollowId, Materials>>;
  /**
   * The last capsule opened, kept so a reload during the reveal shows the same prize instead of
   * handing out a new one (§7 D.5). The grant has already happened by the time this is written, so a
   * player cannot lose a prize by closing the app, and cannot reroll one by reloading.
   */
  capsuleReveal?: CapsuleReveal | null;
}

/** The best tier a capsule may hold, named after the Hollow whose materials paid for it (§7 D.3). */
export type CapsuleCeiling = 'rare' | 'epic' | 'mythic';

/** A capsule already opened and already granted: the record of what the reveal should print. */
export interface CapsuleReveal {
  /** The `capsuleIndex` value the contents were drawn from — the anti-scumming key (§7 D.5). */
  index: number;
  ceiling: CapsuleCeiling;
  skillId: string;
  rarity: Rarity;
  /** True when the companion already knew the skill, so the prize became Skill Dust instead. */
  duplicate: boolean;
}

/** Narrow, read-only snapshot of budgeting behaviour. Delve never mutates it. */
export interface BudgetSignals {
  checkedInToday: boolean;
  envelopesWithinAllowance: number;
  contributedToGoalLast7d: boolean;
  reviewedLast7d: boolean;
}

export interface StepContext {
  /** Current epoch ms. Injected; the engine never reads the clock itself. */
  now: number;
  signals: BudgetSignals;
  meta: DelveMeta;
  /** Local date of the step, for ledger events. */
  today: LocalDate;
  /** The player's order for the round the run is waiting on. Absent means "rebuild the menu". */
  order?: TurnOrder;
}

export interface StepOutcome {
  run: RunState;
  meta: DelveMeta;
  /** Ledger hooks for the persistence layer (idempotent keys). */
  ledger: { key: string; type: string; xp: number; sparks: number }[];
  /** True when the run ended on this step. */
  ended: boolean;
  /**
   * Set when the room is still standing and wants the next order. The persistence layer stores it
   * instead of a log entry: the partial room is rebuilt by replaying `run.orders`, not appended to.
   */
  pause?: CombatPause;
}

export interface BuffSummary {
  wardHp: number;
  luckBonus: number;
  oilCapacityBonus: number;
  totalPowerPercent: number;
  reasons: string[];
}
