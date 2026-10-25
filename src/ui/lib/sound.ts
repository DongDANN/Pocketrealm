/**
 * The UI's door to the chiptune engine. Three rules shape it:
 *
 *  - the engine module is imported lazily, so a player who never turns sound on never downloads or
 *    parses it,
 *  - nothing makes noise before a gesture. The book's `sound` setting means "yes, once I touch the
 *    screen", never "play at page load" — browsers refuse autoplay and people refuse noise, and
 *  - the switch itself lives in the book (`settings.sound`), so it exports with the backup. Only the
 *    three slider levels are localStorage: a cleared cache should cost a slider, not a preference.
 */

import type { ChiptuneEngine } from '../../audio/engine';

export interface SoundLevels {
  master: number;
  music: number;
  sfx: number;
}

export const SOUND_KEY = 'pocketrealm:sound:v1';

// Mirrors `DEFAULT_VOLUMES` in the engine, restated here on purpose: importing the engine for a
// number would pull the whole synth into the first chunk and undo this module's lazy boundary.
export const DEFAULT_LEVELS: SoundLevels = { master: 0.6, music: 0.5, sfx: 0.8 };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

const level = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

function readLevels(raw: string | null | undefined): SoundLevels {
  if (!raw) return { ...DEFAULT_LEVELS };
  try {
    const parsed = JSON.parse(raw) as Partial<SoundLevels>;
    return {
      master: level(parsed.master, DEFAULT_LEVELS.master),
      music: level(parsed.music, DEFAULT_LEVELS.music),
      sfx: level(parsed.sfx, DEFAULT_LEVELS.sfx),
    };
  } catch {
    return { ...DEFAULT_LEVELS };
  }
}

export function loadSoundLevels(storage: StorageLike | undefined = defaultStorage()): SoundLevels {
  try {
    return readLevels(storage?.getItem(SOUND_KEY));
  } catch {
    return { ...DEFAULT_LEVELS };
  }
}

export function saveSoundLevels(
  next: Partial<SoundLevels>,
  storage: StorageLike | undefined = defaultStorage(),
): SoundLevels {
  const current = loadSoundLevels(storage);
  const clean: SoundLevels = {
    master: level(next.master ?? current.master, current.master),
    music: level(next.music ?? current.music, current.music),
    sfx: level(next.sfx ?? current.sfx, current.sfx),
  };
  try {
    storage?.setItem(SOUND_KEY, JSON.stringify(clean));
  } catch {
    // Private mode can refuse writes; the session still honors the levels.
  }
  return clean;
}

let engine: ChiptuneEngine | null = null;
let loading: Promise<ChiptuneEngine> | null = null;
let armed = false;
let wantedTrack: string | null = null;

function engineModule(): Promise<ChiptuneEngine> {
  loading ??= import('../../audio/engine').then((mod) => {
    engine = mod.chiptune;
    return mod.chiptune;
  });
  return loading;
}

export function isSoundOn(): boolean {
  return armed;
}

/** Turns audio on. Must be called from inside a gesture handler. */
export async function enableSound(levels: SoundLevels = loadSoundLevels()): Promise<boolean> {
  const instance = await engineModule();
  const ok = await instance.enableAudio(levels);
  if (!ok) return false;
  armed = true;
  if (wantedTrack) instance.startMusic(wantedTrack);
  return true;
}

export function disableSound(): void {
  armed = false;
  engine?.disableAudio();
}

export function setSoundLevels(levels: Partial<SoundLevels>): SoundLevels {
  const clean = saveSoundLevels(levels);
  engine?.setVolumes(clean);
  return clean;
}

/**
 * A screen asks for background music by track id. Before the first gesture this only records the
 * wish, so the Delve can name its theme without creating an AudioContext behind the player's back.
 */
export function requestMusic(trackId: string | null): void {
  wantedTrack = trackId;
  if (!trackId) {
    engine?.stopMusic();
    return;
  }
  if (armed) engine?.startMusic(trackId);
}

export function currentMusic(): string | null {
  return engine?.currentTrack() ?? null;
}

export function playSfx(name: string): void {
  if (armed) engine?.playSfx(name);
}

export function playStinger(id: string): void {
  if (armed) engine?.playStinger(id);
}

/**
 * Lets a stored "sound on" preference actually start making noise, the only way a browser allows
 * it. Safe to call on every settings change: it keeps at most one pair of listeners, and the first
 * gesture removes both.
 */
let detachGesture: (() => void) | null = null;

export function primeSoundFromGesture(on: boolean): void {
  if (typeof window === 'undefined') return;
  if (!on) {
    detachGesture?.();
    detachGesture = null;
    if (armed) disableSound();
    return;
  }
  if (armed) {
    engine?.setVolumes(loadSoundLevels());
    if (wantedTrack) engine?.startMusic(wantedTrack);
    return;
  }
  if (detachGesture) return;
  const wake = () => {
    detachGesture?.();
    detachGesture = null;
    void enableSound();
  };
  window.addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);
  detachGesture = () => {
    window.removeEventListener('pointerdown', wake);
    window.removeEventListener('keydown', wake);
  };
}
