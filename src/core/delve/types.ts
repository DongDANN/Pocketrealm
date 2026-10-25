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
  relics: string[];
  glint: number;
  /** Embers earned so far this run (banked on retreat / 60% on faint / clear bonus). */
  embersEarned: number;
  /** Consecutive boon offers that missed the top tag (bad-luck protection). */
  offerStreak: number;
  /** Once-per-run relic flags. */
  relicFlags: Record<string, boolean>;
  result: RunResult;
  pendingChoice: PendingChoice | null;
  log: RunLogEntry[];
  /** Room ids visited (anti-scumming trail). */
  roomsVisited: string[];
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
  /** Clock defense: highest wall-clock ms ever seen. */
  maxSeenAt: number;
  /** When the last step was applied (ms). */
  lastStepAt: number;
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
