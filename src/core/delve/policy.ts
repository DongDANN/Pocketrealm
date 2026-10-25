/**
 * The Autopilot policy is the only Delve setting the player edits outside a run. It is pure data,
 * so validation lives here: a saved policy from an older build (or a hand-edited localStorage row)
 * can never make the engine pick from an empty priority list or chase a nonsensical HP threshold.
 */

import type { AutopilotPolicy, BoonTag, HollowId } from './types';

export const BOON_TAGS: readonly BoonTag[] = ['guard', 'fury', 'fortune', 'vigor', 'thrift'];

export const DEFAULT_POLICY: AutopilotPolicy = {
  mode: 'autopilot',
  // Guard and vigor first: the shipped policy should survive a first Hollow without being clever.
  tagPriority: ['guard', 'vigor', 'fury', 'fortune', 'thrift'],
  retreatHpPercent: 30,
  route: 'balanced',
};

const ROUTES: readonly AutopilotPolicy['route'][] = ['safe', 'balanced', 'greedy'];
const MODES: readonly AutopilotPolicy['mode'][] = ['autopilot', 'camp'];

function isTag(value: unknown): value is BoonTag {
  return typeof value === 'string' && (BOON_TAGS as readonly string[]).includes(value);
}

function isHollow(value: unknown): value is HollowId {
  return value === 1 || value === 2 || value === 3;
}

/** A complete, valid policy: every tag appears once and numeric knobs are clamped. */
export function normalizePolicy(value: unknown): AutopilotPolicy {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_POLICY };
  const raw = value as Record<string, unknown>;

  const priority: BoonTag[] = [];
  if (Array.isArray(raw.tagPriority)) {
    for (const item of raw.tagPriority) {
      if (isTag(item) && !priority.includes(item)) priority.push(item);
    }
  }
  for (const tag of DEFAULT_POLICY.tagPriority) {
    if (!priority.includes(tag)) priority.push(tag);
  }

  const hp = Number(raw.retreatHpPercent);
  const retreatHpPercent = Number.isFinite(hp) ? Math.max(0, Math.min(100, Math.round(hp))) : 30;

  const mode = MODES.includes(raw.mode as AutopilotPolicy['mode'])
    ? (raw.mode as AutopilotPolicy['mode'])
    : DEFAULT_POLICY.mode;
  const route = ROUTES.includes(raw.route as AutopilotPolicy['route'])
    ? (raw.route as AutopilotPolicy['route'])
    : DEFAULT_POLICY.route;

  const bossGate: Partial<Record<HollowId, number>> = {};
  if (typeof raw.bossGate === 'object' && raw.bossGate !== null) {
    for (const [key, gate] of Object.entries(raw.bossGate as Record<string, unknown>)) {
      const hollow = Number(key);
      const level = Number(gate);
      if (isHollow(hollow) && Number.isFinite(level) && level > 0) {
        bossGate[hollow] = Math.min(99, Math.round(level));
      }
    }
  }

  return {
    mode,
    tagPriority: priority,
    retreatHpPercent,
    route,
    ...(Object.keys(bossGate).length > 0 ? { bossGate } : {}),
  };
}
