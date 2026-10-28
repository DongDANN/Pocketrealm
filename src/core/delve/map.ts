/**
 * Seeded floor generation. Each floor is 3-5 rows by 2-3 columns; the first row is a single
 * skirmish room, the last row is the boss (final floor) or an exit room, and every room in a
 * row connects forward to every room in the next row (the fork the player or Autopilot picks).
 * Fully determined by seed = hash(hollowId, floor, userSeed).
 */

import { hashCombine, hashString, mulberry32 } from '../rng';
import { AFFIXES } from './data/affixes';
import { BOSSES, ELITES, ENEMIES } from './data/enemies';
import type { FloorPlan, HollowId, RoomDef, RoomKind } from './types';

export const HOLLOW_FLOORS: Record<HollowId, number> = { 1: 6, 2: 8, 3: 10 };

/**
 * Oil to start a run in each Hollow (DELVE_REDESIGN §6). Rooms inside a run are free: the price
 * buys the whole descent. The daily trickle of 20 still buys exactly one Rootfall run a day.
 */
export const RUN_COST: Record<HollowId, number> = { 1: 20, 2: 24, 3: 28 };

export function floorSeed(userSeed: number, hollowId: HollowId, floor: number): number {
  return hashCombine(hashString(`hollow:${hollowId}:floor:${floor}`), userSeed >>> 0);
}

const KIND_WEIGHTS: [RoomKind, number][] = [
  ['skirmish', 50],
  ['treasure', 20],
  ['rest', 10],
  ['shop', 8],
  ['event', 8],
  ['elite', 8],
];

/** Elites never appear on the first three floors of a hollow. Heat 2 adds more elites, Heat 4 fewer rests. */
function kindWeights(floor: number, heat: number): [RoomKind, number][] {
  let weights = floor >= 4 ? KIND_WEIGHTS : KIND_WEIGHTS.filter(([k]) => k !== 'elite');
  if (heat >= 2)
    weights = weights.map(([k, w]) =>
      k === 'elite' ? (['elite', 16] as const) : ([k, w] as const),
    );
  if (heat >= 4)
    weights = weights.map(([k, w]) => (k === 'rest' ? (['rest', 4] as const) : ([k, w] as const)));
  return weights;
}

function weightedKind(rng: { int(n: number): number }, floor: number, heat: number): RoomKind {
  const weights = kindWeights(floor, heat);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng.int(total);
  for (const [kind, w] of weights) {
    if (roll < w) return kind;
    roll -= w;
  }
  return 'skirmish';
}

/** Affix rolls: none through floor 3, at most 1 on ordinaries, 1-2 on elites, never bosses. */
function pickAffixes(rng: { int(n: number): number }, kind: RoomKind, floor: number): string[] {
  if (kind === 'elite') {
    const count = 1 + rng.int(2);
    const pool = AFFIXES.map((a) => a.id);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const pick = pool[rng.int(pool.length)]!;
      pool.splice(pool.indexOf(pick), 1);
      out.push(pick);
    }
    return out;
  }
  if (kind === 'skirmish' && floor >= 4 && rng.int(100) < 30) {
    return [AFFIXES[rng.int(AFFIXES.length)]!.id];
  }
  return [];
}

export function generateFloor(
  userSeed: number,
  hollowId: HollowId,
  floor: number,
  heat = 0,
): FloorPlan {
  const rng = mulberry32(floorSeed(userSeed, hollowId, floor));
  const rows = 3 + rng.int(3); // 3..5
  const cols = 2 + rng.int(2); // 2..3
  const isBossFloor = floor === HOLLOW_FLOORS[hollowId];
  const enemiesOf = (kind: RoomKind): string[] => {
    if (kind === 'boss') return [BOSSES[hollowId - 1]!.id];
    if (kind === 'elite') return [ELITES[hollowId - 1]!.id];
    const pool = ENEMIES.filter((e) => e.hollow === hollowId);
    const count = floor >= 5 && rng.int(4) === 0 ? 2 : 1;
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(pool[rng.int(pool.length)]!.id);
    return out;
  };

  const plan: FloorPlan = { floor, rows: [] };
  for (let r = 0; r < rows; r++) {
    const row: RoomDef[] = [];
    const last = r === rows - 1;
    const width = r === 0 || last ? 1 : cols;
    for (let c = 0; c < width; c++) {
      let kind: RoomKind;
      if (r === 0) kind = 'skirmish';
      else if (last) kind = isBossFloor ? 'boss' : 'rest';
      else kind = weightedKind(rng, floor, heat);
      row.push({
        id: `f${floor}r${r}c${c}`,
        kind,
        enemies: enemiesOf(kind),
        affixes: pickAffixes(rng, kind, floor),
        optionSeed: rng.next(),
      });
    }
    plan.rows.push(row);
  }
  return plan;
}

/** Flatten a floor plan into the ordered room list a run walks (fork choices resolve the row). */
export function flattenRooms(plan: FloorPlan, path: number[]): RoomDef[] {
  const out: RoomDef[] = [];
  for (let r = 0; r < plan.rows.length; r++) {
    const row = plan.rows[r]!;
    if (row.length === 1) out.push(row[0]!);
    else out.push(row[Math.min(path[r] ?? 0, row.length - 1)]!);
  }
  return out;
}
