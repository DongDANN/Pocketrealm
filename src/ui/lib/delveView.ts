import {
  HOLLOW_FLOORS,
  type BoonTag,
  type HollowId,
  type RoomKind,
  type RunResult,
  type RunState,
} from '../../core/delve';

export interface HollowInfo {
  id: HollowId;
  name: string;
  blurb: string;
  floors: number;
}

export const HOLLOWS: readonly HollowInfo[] = [
  {
    id: 1,
    name: 'Rootfall Warren',
    blurb: 'Moss, old roots, and a tollbug who has all day.',
    floors: HOLLOW_FLOORS[1],
  },
  {
    id: 2,
    name: 'Cinder Vault',
    blurb: 'A warm, sooty vault. Nothing here is quite cool enough to touch.',
    floors: HOLLOW_FLOORS[2],
  },
  {
    id: 3,
    name: 'Umbral Deep',
    blurb: 'The lantern is the only opinion the dark respects.',
    floors: HOLLOW_FLOORS[3],
  },
];

export function hollowInfo(id: HollowId): HollowInfo {
  return HOLLOWS.find((hollow) => hollow.id === id) ?? HOLLOWS[0]!;
}

export function hollowName(id: HollowId): string {
  return hollowInfo(id).name;
}

export function roomKindLabel(kind: RoomKind): string {
  switch (kind) {
    case 'skirmish':
      return 'Skirmish';
    case 'elite':
      return 'Elite';
    case 'treasure':
      return 'Treasure';
    case 'rest':
      return 'Rest';
    case 'shop':
      return 'Shop';
    case 'event':
      return 'Event';
    case 'boss':
      return 'Boss';
  }
}

/**
 * The map shows three rooms across, and a bitmap word cannot shrink to fit, so the chips carry the
 * shortest label that still reads. The full kind stays the accessible name on the chip.
 */
export function roomKindChip(kind: RoomKind): string {
  switch (kind) {
    case 'skirmish':
      return 'Fight';
    case 'treasure':
      return 'Loot';
    default:
      return roomKindLabel(kind);
  }
}

export function tagLabel(tag: BoonTag): string {
  switch (tag) {
    case 'guard':
      return 'Guard';
    case 'fury':
      return 'Fury';
    case 'fortune':
      return 'Fortune';
    case 'vigor':
      return 'Vigor';
    case 'thrift':
      return 'Thrift';
  }
}

export function resultLabel(result: RunResult): string {
  switch (result) {
    case 'active':
      return 'Still delving';
    case 'cleared':
      return 'Cleared';
    case 'retreated':
      return 'Retreated';
    case 'fainted':
      return 'Fainted';
  }
}

export function hpPercent(run: RunState): number {
  if (run.unit.maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((run.unit.hp / run.unit.maxHp) * 100)));
}

export function runStatus(run: RunState | null): string {
  if (!run) return 'Camping at the lantern';
  if (run.pendingChoice) return 'A choice waits';
  if (run.result !== 'active') return resultLabel(run.result);
  return `${hollowName(run.hollowId)} · Floor ${run.floor}/${hollowInfo(run.hollowId).floors}`;
}

/** Current row kind, falling back to the last room when a floor has just advanced. */
export function currentRoomKind(run: RunState): RoomKind {
  const row = run.floorPlan.rows[Math.min(run.row, run.floorPlan.rows.length - 1)];
  const room = row?.[run.path[run.row] ?? 0] ?? row?.[0];
  return room?.kind ?? 'skirmish';
}

/** Next three room kinds along the current path, for the compact map preview. */
export function upcomingRooms(run: RunState, count = 3): { kind: RoomKind; current: boolean }[] {
  const out: { kind: RoomKind; current: boolean }[] = [];
  for (let row = run.row; row < run.floorPlan.rows.length && out.length < count; row += 1) {
    const rooms = run.floorPlan.rows[row];
    if (!rooms || rooms.length === 0) continue;
    const chosen = rooms[run.path[row] ?? 0] ?? rooms[0]!;
    out.push({ kind: chosen.kind, current: row === run.row });
  }
  return out;
}
