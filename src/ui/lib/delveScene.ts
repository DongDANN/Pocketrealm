/**
 * The visual half of `delveSound.ts`.
 *
 * The engine resolves a room in one step and hands the screen a before/after pair. This module reads
 * that difference and names the animation that difference justifies — it never predicts an outcome and
 * never invents a beat the rules did not produce, so a browser that cannot run the Canvas scene loses
 * the motion and nothing else.
 */

import type { RoomDef, RunState } from '../../core/delve';
import { currentRoomKind } from './delveView';

export type BattleActionKind =
  | 'playerAttack'
  | 'enemyAttack'
  | 'playerHurt'
  | 'enemyHurt'
  | 'enemyFaint'
  | 'playerFaint'
  | 'heal'
  | 'loot';

export interface SceneAction {
  kind: BattleActionKind;
  /** Monotonic id from the screen. The scene replays only when this changes. */
  token: number;
  /** A heavy hit gets a longer hit-stop and a bigger shake. */
  heavy: boolean;
}

export interface Encounter {
  enemyId: string | null;
  boss: boolean;
  elite: boolean;
  affixes: string[];
}

/** The room the run is standing in, or null before the first step. */
export function currentRoom(run: RunState): RoomDef | null {
  const row = run.floorPlan.rows[Math.min(run.row, run.floorPlan.rows.length - 1)];
  return row?.[run.path[run.row] ?? 0] ?? row?.[0] ?? null;
}

export function encounterOf(run: RunState): Encounter {
  const room = currentRoom(run);
  const kind = room?.kind ?? currentRoomKind(run);
  const enemyId = room?.enemies[0] ?? null;
  return {
    enemyId,
    boss: kind === 'boss',
    elite: kind === 'elite',
    affixes: room?.affixes ?? [],
  };
}

/**
 * One beat per step, chosen from what actually changed. Order matters: a faint outranks the hurt that
 * caused it, and a clear is the last thing the player should see.
 */
export function sceneActionFor(
  before: RunState | null,
  after: RunState | null,
  token: number,
): SceneAction | null {
  if (!after || !before) return null;
  const hpLost = before.unit.hp - after.unit.hp;
  const heavy = hpLost >= before.unit.maxHp * 0.2;

  if (after.unit.hp === 0 && before.unit.hp > 0) return { kind: 'playerFaint', token, heavy: true };
  if (hpLost > 0) return { kind: 'playerHurt', token, heavy };
  if (hpLost < 0) return { kind: 'heal', token, heavy: false };
  if (after.result === 'cleared' || after.row > before.row || after.floor > before.floor) {
    return { kind: 'enemyFaint', token, heavy: true };
  }
  if (after.boons.length > before.boons.length || after.glint > before.glint) {
    return { kind: 'loot', token, heavy: false };
  }
  if (after.stepIndex > before.stepIndex) return { kind: 'playerAttack', token, heavy: false };
  return null;
}
