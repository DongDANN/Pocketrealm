/**
 * Delve domain types. Pure data — no React, no DOM, no IndexedDB, no clock reads.
 * A run is a seeded sequence of rooms; each room step consumes 1 Lantern Oil and produces
 * deterministic events. Everything below survives JSON round-trips (no functions, no Maps).
 */

import type { LocalDate } from '../types';
import type { Element } from './data/elements';

export type HollowId = 1 | 2 | 3;
export type BoonTag = 'guard' | 'fury' | 'fortune' | 'vigor' | 'thrift';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

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
  /** Options the player (or Autopilot) picks from. */
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
 */
export interface TurnOrder {
  /** The skill the player fired; null is the basic attack. */
  skillId: string | null;
  /** Index into the room's live enemy list. */
  targetIndex: number;
  /** True to brace this round instead of attacking. */
  guard: boolean;
  /** A consumable spent on the round, which costs the action. */
  consumableId?: string;
}

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
  /** Equipped Habit Cards for this run (max 3, priority order). */
  cards: string[];
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
  /** Equipped Habit Cards (max 3, priority top to bottom). */
  cards: string[];
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
   * Collected skills, keyed by id: the level bought with Skill Dust, the uses that earned it, and
   * the lifetime total the Codex reports. Arrives with the collection in Gate 7c; declared here so
   * the v3 shape is settled once (DELVE_REDESIGN §10.1).
   */
  skills: Record<string, { level: number; uses: number; lifetime: number }>;
  /** Species-and-skill ids the companion knows, i.e. can be equipped at all. */
  knownSkills: string[];
  /** The four slots the companion fights with. Respec is free between runs. */
  equippedSkills: string[];
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
}

/** Narrow, read-only snapshot of budgeting behaviour. Delve never mutates it. */
export interface BudgetSignals {
  checkedInToday: boolean;
  envelopesWithinAllowance: number;
  contributedToGoalLast7d: boolean;
  reviewedLast7d: boolean;
}

export interface AutopilotPolicy {
  mode: 'autopilot' | 'camp';
  /** Boon tag priority, highest first. */
  tagPriority: BoonTag[];
  /** Retreat from a Rest room when HP ratio is at or below this (0-100). */
  retreatHpPercent: number;
  route: 'safe' | 'balanced' | 'greedy';
  /** Minimum companion level to attempt a hollow's boss; below it the pre-boss Rest retreats. */
  bossGate?: Partial<Record<HollowId, number>>;
}

export interface StepContext {
  /** Current epoch ms. Injected; the engine never reads the clock itself. */
  now: number;
  oil: number;
  /** Oil capacity (storage cap + Forge + buffs). */
  oilCapacity: number;
  signals: BudgetSignals;
  meta: DelveMeta;
  policy: AutopilotPolicy;
  /** Local date of the step, for ledger events. */
  today: LocalDate;
}

export interface StepOutcome {
  run: RunState;
  meta: DelveMeta;
  /** Ledger hooks for the persistence layer (idempotent keys). */
  ledger: { key: string; type: string; xp: number; sparks: number }[];
  /** Oil consumed by this step. */
  oilSpent: number;
  /** True when the run ended on this step. */
  ended: boolean;
}

export interface BuffSummary {
  wardHp: number;
  luckBonus: number;
  oilCapacityBonus: number;
  totalPowerPercent: number;
  reasons: string[];
}
