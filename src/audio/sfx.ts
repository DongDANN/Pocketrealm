/**
 * The parametric SFX library. A preset is a short list of blips — a wave, a note, a slide, an
 * envelope — which is everything a 1-bit soundtrack needs to say "that hit", "that coin" or "that
 * did not work" without shipping a single audio file.
 */

import type { Hit } from './synth';
import type { Wave } from './score';

export interface SfxBlip {
  wave: Wave;
  /** MIDI note for a tonal blip. */
  midi?: number;
  /** Free-running frequency, for sweeps and drones that are not a note. */
  hz?: number;
  /** Seconds after the trigger. */
  at: number;
  dur: number;
  volume: number;
  /** Semitones travelled across the blip. */
  slideTo?: number;
  /** A noise-channel drum instead of a pitched voice. */
  hit?: Hit;
}

export interface SfxPreset {
  name: string;
  blips: SfxBlip[];
}

const b = (
  wave: Wave,
  midi: number,
  at: number,
  dur: number,
  volume = 0.22,
  slideTo?: number,
): SfxBlip => ({ wave, midi, at, dur, volume, slideTo });

const drum = (hit: Hit, at: number, volume = 0.2): SfxBlip => ({
  wave: 'noise',
  at,
  dur: 0.1,
  volume,
  hit,
});

const sweep = (hz: number, to: number, at: number, dur: number, volume = 0.2): SfxBlip => ({
  wave: 'pulse',
  hz,
  at,
  dur,
  volume,
  slideTo: to,
});

/**
 * Slides are written in semitones for notes and in hertz for sweeps; `hz` blips use `slideTo` as the
 * target frequency, which is how the noise-ish errors and alarms get their fall.
 */
export const SFX_PRESETS: readonly SfxPreset[] = [
  // Interface.
  { name: 'tap', blips: [b('pulse', 84, 0, 0.04, 0.14)] },
  { name: 'confirm', blips: [b('pulse', 76, 0, 0.05, 0.18), b('pulse', 83, 0.05, 0.08, 0.18)] },
  { name: 'cancel', blips: [b('pulse', 74, 0, 0.05, 0.16), b('pulse', 67, 0.05, 0.09, 0.16)] },
  { name: 'error', blips: [b('pulse', 60, 0, 0.09, 0.2), b('pulse', 58, 0.09, 0.14, 0.2)] },
  { name: 'coin', blips: [b('pulse', 91, 0, 0.05, 0.2), b('pulse', 96, 0.05, 0.1, 0.2)] },
  {
    name: 'spark',
    blips: [b('triangle', 98, 0, 0.05, 0.16), b('triangle', 103, 0.04, 0.09, 0.12)],
  },
  {
    name: 'loot',
    blips: [
      b('pulse', 79, 0, 0.05, 0.18),
      b('pulse', 86, 0.05, 0.05, 0.18),
      b('pulse', 91, 0.1, 0.12, 0.18),
    ],
  },
  { name: 'equip', blips: [b('triangle', 71, 0, 0.05, 0.2), drum('snare', 0.05, 0.12)] },
  { name: 'menu', blips: [b('pulse', 72, 0, 0.03, 0.1), b('pulse', 79, 0.03, 0.05, 0.1)] },

  // Combat.
  { name: 'hit', blips: [b('pulse', 52, 0, 0.06, 0.24, -5), drum('kick', 0, 0.16)] },
  {
    name: 'crit',
    blips: [
      b('pulse', 55, 0, 0.08, 0.3, -7),
      b('pulse', 88, 0.06, 0.12, 0.2),
      drum('snare', 0, 0.2),
    ],
  },
  { name: 'hurt', blips: [b('triangle', 45, 0, 0.14, 0.26, -4)] },
  {
    name: 'faint',
    blips: [b('triangle', 52, 0, 0.2, 0.24, -12), b('pulse', 38, 0.18, 0.3, 0.18, -5)],
  },
  {
    name: 'clear',
    blips: [
      b('pulse', 76, 0, 0.08, 0.2),
      b('pulse', 83, 0.08, 0.08, 0.2),
      b('pulse', 88, 0.16, 0.18, 0.22),
    ],
  },
  {
    name: 'retreat',
    blips: [
      b('pulse', 74, 0, 0.07, 0.18),
      b('pulse', 67, 0.07, 0.07, 0.18),
      b('pulse', 60, 0.14, 0.14, 0.18),
    ],
  },
  { name: 'step', blips: [drum('hat', 0, 0.12), b('triangle', 40, 0, 0.05, 0.12)] },
  { name: 'block', blips: [b('triangle', 64, 0, 0.05, 0.22), drum('snare', 0.01, 0.16)] },
  {
    name: 'heal',
    blips: [
      b('triangle', 81, 0, 0.09, 0.16),
      b('triangle', 85, 0.07, 0.09, 0.16),
      b('triangle', 88, 0.14, 0.16, 0.16),
    ],
  },
  { name: 'shield', blips: [b('pulse', 69, 0, 0.16, 0.16, 3), b('triangle', 81, 0.04, 0.2, 0.12)] },
  { name: 'oil', blips: [b('triangle', 57, 0, 0.06, 0.2, 5), b('pulse', 69, 0.06, 0.1, 0.14)] },

  // Elemental casts, one colour each.
  { name: 'castFlame', blips: [sweep(220, 880, 0, 0.16, 0.2), drum('snare', 0.12, 0.14)] },
  { name: 'castFrost', blips: [b('triangle', 96, 0, 0.18, 0.14, -9), drum('hat', 0, 0.1)] },
  {
    name: 'castSpark',
    blips: [sweep(1200, 300, 0, 0.09, 0.16), b('pulse', 100, 0.05, 0.06, 0.14)],
  },
  {
    name: 'castVerdant',
    blips: [b('triangle', 74, 0, 0.12, 0.16, 2), b('triangle', 81, 0.1, 0.14, 0.14)],
  },
  { name: 'castVoid', blips: [b('pulse', 61, 0, 0.26, 0.2, -14), drum('kick', 0.02, 0.12)] },

  // Statuses.
  {
    name: 'statusStun',
    blips: [b('pulse', 90, 0, 0.1, 0.16, 5), b('pulse', 88, 0.1, 0.14, 0.14, -5)],
  },
  { name: 'statusBurn', blips: [sweep(400, 1600, 0, 0.14, 0.14)] },
  { name: 'statusChill', blips: [b('triangle', 100, 0, 0.22, 0.12, -16)] },
  {
    name: 'statusPoison',
    blips: [b('triangle', 66, 0, 0.1, 0.14, 1), b('triangle', 65, 0.1, 0.16, 0.12, -1)],
  },
  {
    name: 'statusRally',
    blips: [
      b('pulse', 72, 0, 0.06, 0.18),
      b('pulse', 76, 0.06, 0.06, 0.18),
      b('pulse', 79, 0.12, 0.14, 0.2),
    ],
  },

  // Celebrations, kept short enough to never talk over the theme.
  {
    name: 'levelUp',
    blips: [
      b('pulse', 79, 0, 0.07, 0.22),
      b('pulse', 86, 0.07, 0.07, 0.22),
      b('pulse', 91, 0.14, 0.2, 0.24),
    ],
  },
  {
    name: 'fusion',
    blips: [
      b('pulse', 74, 0, 0.08, 0.2),
      b('pulse', 81, 0.08, 0.08, 0.2),
      b('pulse', 86, 0.16, 0.22, 0.22),
      drum('open', 0.16, 0.14),
    ],
  },
  {
    name: 'quest',
    blips: [
      b('triangle', 83, 0, 0.09, 0.2),
      b('triangle', 88, 0.09, 0.09, 0.2),
      b('triangle', 95, 0.18, 0.18, 0.22),
    ],
  },
];

export type SfxName = (typeof SFX_PRESETS)[number]['name'];

export const SFX_NAMES: readonly string[] = SFX_PRESETS.map((preset) => preset.name);

export function sfxPreset(name: string): SfxPreset | undefined {
  return SFX_PRESETS.find((preset) => preset.name === name);
}
