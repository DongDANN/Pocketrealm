import { daysBetween } from './dates';
import type { LocalDate } from './types';

/**
 * Companion mood and growth (SPEC 6.2). Mood is a function of logging recency only — never of how
 * much money moved, so no greeting can read as blame. Growth changes the sprite, not any stat.
 */

export type Mood = 'happy' | 'content' | 'sleepy' | 'resting';

export interface SpeciesPart {
  id: string;
  shape: 'blob' | 'round' | 'oval' | 'drop';
  /** Palette role resolved by the art layer; no raw colour lives in core. */
  role: 'body' | 'shade' | 'light' | 'accent' | 'eye';
  /** Bounding box on the 32x32 stage, whole art pixels so blitting stays exact. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Species {
  key: string;
  name: string;
  blurb: string;
  /** The sprite recipe, drawn part over part in order. */
  build: readonly SpeciesPart[];
}

const MOSSLING: readonly SpeciesPart[] = [
  { id: 'shadow', shape: 'oval', role: 'shade', x: 8, y: 27, w: 16, h: 4 },
  { id: 'body', shape: 'blob', role: 'body', x: 7, y: 12, w: 18, h: 16 },
  { id: 'moss', shape: 'oval', role: 'light', x: 9, y: 11, w: 14, h: 6 },
  { id: 'eye-left', shape: 'drop', role: 'eye', x: 12, y: 18, w: 3, h: 4 },
  { id: 'eye-right', shape: 'drop', role: 'eye', x: 18, y: 18, w: 3, h: 4 },
  { id: 'lantern', shape: 'round', role: 'accent', x: 24, y: 20, w: 6, h: 7 },
];

const TOLLBUG: readonly SpeciesPart[] = [
  { id: 'shadow', shape: 'oval', role: 'shade', x: 9, y: 26, w: 14, h: 4 },
  { id: 'shell', shape: 'blob', role: 'body', x: 8, y: 14, w: 16, h: 13 },
  { id: 'seam', shape: 'oval', role: 'light', x: 10, y: 15, w: 12, h: 4 },
  { id: 'antenna-left', shape: 'drop', role: 'accent', x: 11, y: 8, w: 3, h: 6 },
  { id: 'antenna-right', shape: 'drop', role: 'accent', x: 19, y: 8, w: 3, h: 6 },
  { id: 'eye', shape: 'round', role: 'eye', x: 14, y: 19, w: 5, h: 5 },
];

const EMBERLING: readonly SpeciesPart[] = [
  { id: 'shadow', shape: 'oval', role: 'shade', x: 10, y: 27, w: 13, h: 3 },
  { id: 'body', shape: 'drop', role: 'body', x: 10, y: 13, w: 13, h: 15 },
  { id: 'glow', shape: 'oval', role: 'light', x: 12, y: 15, w: 9, h: 5 },
  { id: 'eye-left', shape: 'round', role: 'eye', x: 13, y: 20, w: 3, h: 3 },
  { id: 'eye-right', shape: 'round', role: 'eye', x: 18, y: 20, w: 3, h: 3 },
  { id: 'wick', shape: 'drop', role: 'accent', x: 15, y: 9, w: 3, h: 5 },
];

export const SPECIES: readonly Species[] = [
  {
    key: 'mossling',
    name: 'Mossling',
    blurb: 'Round, moss-capped, carries a lantern for the long walk home.',
    build: MOSSLING,
  },
  {
    key: 'tollbug',
    name: 'Tollbug',
    blurb: 'A patient shell that hums when the ledger balances.',
    build: TOLLBUG,
  },
  {
    key: 'emberling',
    name: 'Emberling',
    blurb: 'A small warm light that keeps going on quiet days.',
    build: EMBERLING,
  },
];

export function speciesByKey(key: string): Species | undefined {
  return SPECIES.find((species) => species.key === key);
}

/** Days since the last logged activity; a clock that jumped backwards counts as today. */
export function daysSinceLastLog(lastLogged: LocalDate | null, today: LocalDate): number | null {
  if (lastLogged === null) return null;
  return Math.max(0, daysBetween(lastLogged, today));
}

export function moodFor(lastLogged: LocalDate | null, today: LocalDate): Mood {
  const gap = daysSinceLastLog(lastLogged, today);
  if (gap === null) return 'content';
  if (gap <= 0) return 'happy';
  if (gap <= 2) return 'content';
  if (gap <= 6) return 'sleepy';
  return 'resting';
}

const MOOD_COPY: Readonly<Record<Mood, (name: string) => string>> = {
  happy: (name) => `${name} stretches by the lantern. Today is in the book.`,
  content: (name) => `${name} looks up from the ledger, steady and unhurried.`,
  sleepy: (name) => `${name} yawns and pads back over. Welcome back, no rush.`,
  resting: (name) => `${name} took a long nap. Nothing was lost. Ready when you are.`,
};

export function moodCopy(mood: Mood, name: string): string {
  return MOOD_COPY[mood](name);
}

/** Levels where the sprite changes look (SPEC 6.2). Everything else is cosmetic. */
const EVOLUTION_LEVELS = [5, 10, 20, 35] as const;

export function evolutionStage(level: number): number {
  // Any level below the first threshold, NaN included, is stage one: the sprite always has a body.
  let stage = 1;
  for (const levelAt of EVOLUTION_LEVELS) if (level >= levelAt) stage += 1;
  return stage;
}
