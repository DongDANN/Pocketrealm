/**
 * The Delve's sounds describe what the engine already decided. Nothing here predicts an outcome:
 * it compares the run before an action with the run after it and names the cues that difference
 * justifies. A screen plays the list and never invents one, so a muted or unsupported browser
 * loses the noise and nothing else.
 */

import { currentRoomKind } from './delveView';
import { fusionById, type RunState } from '../../core/delve';
import { hollowTrackId } from '../../audio/score';

export type SoundCue = { kind: 'sfx'; name: string } | { kind: 'stinger'; id: string };

const sfx = (name: string): SoundCue => ({ kind: 'sfx', name });
const stinger = (id: string): SoundCue => ({ kind: 'stinger', id });

/** One celebration at a time, and no more than three layers over it. */
const MAX_CUES = 3;

/**
 * The loop a screen asks for: a Hollow theme while a run is moving, the boss theme on its floor,
 * the results theme on the summary panel and camp elsewhere.
 */
export function musicTrackFor(run: RunState | null, showResults: boolean): string {
  if (!run) return showResults ? 'results' : 'camp';
  return currentRoomKind(run) === 'boss' ? 'boss' : hollowTrackId(run.hollowId);
}

export function cuesForRun(before: RunState | null, after: RunState | null): SoundCue[] {
  if (!after) return [];
  if (!before) return [sfx('step')];
  const prev = before;
  const gained = after.boons.filter((id) => !prev.boons.includes(id));
  const fanfare =
    after.companionLevel > prev.companionLevel
      ? stinger('levelUp')
      : gained.some((id) => fusionById(id) !== undefined)
        ? stinger('fusion')
        : after.result === 'cleared' && prev.result !== 'cleared'
          ? stinger('questComplete')
          : null;
  const out: SoundCue[] = fanfare ? [fanfare] : [];

  if (after.result !== prev.result) {
    if (after.result === 'cleared') out.push(sfx('clear'));
    if (after.result === 'fainted') out.push(sfx('faint'));
    if (after.result === 'retreated') out.push(sfx('retreat'));
  }

  const hpLost = prev.unit.hp - after.unit.hp;
  if (hpLost > 0) {
    const heavy = after.unit.hp === 0 || hpLost >= prev.unit.maxHp * 0.2;
    out.push(sfx(heavy ? 'hurt' : 'hit'));
  } else if (hpLost < 0) {
    out.push(sfx('heal'));
  }

  if (!prev.pendingChoice && after.pendingChoice) {
    out.push(sfx(after.pendingChoice.kind === 'boon' ? 'loot' : 'menu'));
  } else if (gained.length > 0) {
    out.push(sfx('equip'));
  } else if (after.stepIndex > prev.stepIndex) {
    out.push(sfx('spark'));
  }

  return out.slice(0, MAX_CUES);
}
