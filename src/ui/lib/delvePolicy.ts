/**
 * Autopilot settings live outside the database: they are preferences, not book data, and losing
 * them to a cleared cache costs nothing. `normalizePolicy` is the single gate, so a hand-edited
 * localStorage row cannot make the engine choose from an empty list or chase a silly HP threshold.
 */

import { DEFAULT_POLICY, normalizePolicy, type AutopilotPolicy } from '../../core/delve';

export const DELVE_POLICY_KEY = 'pocketrealm:delve-policy:v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadDelvePolicy(
  storage: StorageLike | undefined = defaultStorage(),
): AutopilotPolicy {
  try {
    const raw = storage?.getItem(DELVE_POLICY_KEY);
    if (!raw) return { ...DEFAULT_POLICY, tagPriority: [...DEFAULT_POLICY.tagPriority] };
    return normalizePolicy(JSON.parse(raw));
  } catch {
    // A corrupt row is not worth a crash: fall back to the shipped policy.
    return { ...DEFAULT_POLICY, tagPriority: [...DEFAULT_POLICY.tagPriority] };
  }
}

export function saveDelvePolicy(
  policy: AutopilotPolicy,
  storage: StorageLike | undefined = defaultStorage(),
): AutopilotPolicy {
  const clean = normalizePolicy(policy);
  try {
    storage?.setItem(DELVE_POLICY_KEY, JSON.stringify(clean));
  } catch {
    // Private mode can refuse writes; the in-memory policy still applies for this session.
  }
  return clean;
}
