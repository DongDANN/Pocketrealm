/**
 * The score data for Pocketrealm's chiptune. Everything here is plain data — patterns and order,
 * never audio files — so the whole soundtrack is precached with the code and works offline.
 *
 * A channel is one voice, and its `steps` are written one token per slot with a `|` marking each
 * bar line, so a tune can be read (and corrected) by eye:
 *
 *   `d4` play D4 · `f#4` play F#4 · `bb3` play B flat · `-` rest · `.` hold the previous note ·
 *   `~` slide into the next note · `v` vibrato · `^` arpeggiate the note as a triad ·
 *   `k s h o` kick, snare, hat, open hat on a noise channel.
 */

export type Wave = 'pulse' | 'triangle' | 'noise';

/** The four channels the engine mixes: two pulses, a triangle and a noise voice. */
export interface Channel {
  wave: Wave;
  /** Pulse duty cycle. 0.5 is a plain square; 0.125/0.25 give the reedier Game Boy timbres. */
  duty?: 0.125 | 0.25 | 0.5;
  /** 0–1 relative to the music bus. */
  volume: number;
  /** Bar-line separated step tokens; every channel in a track must cover the same number of steps. */
  steps: string;
}

export interface Track {
  id: string;
  title: string;
  bpm: number;
  /** 0–0.5: how much every off-beat is pushed late. A shuffle, not a swing feel at 1. */
  swing: number;
  beatsPerBar: number;
  stepsPerBeat: number;
  /** False for a one-shot stinger, which stops at the end instead of looping. */
  loops: boolean;
  channels: Channel[];
}

const NOTE_SEMIS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export type StepEffect = 'slide' | 'vibrato' | 'arp';

export interface Step {
  /** MIDI note number, or null for a rest. */
  midi: number | null;
  /** True when this slot continues the previous note. */
  tie: boolean;
  /** Percussion voice for a noise channel; null on tonal steps. */
  hit: 'kick' | 'snare' | 'hat' | 'open' | null;
  effect: StepEffect | null;
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Parses one channel's step string. Throws on a token it cannot read, so bad data fails loudly. */
export function parseSteps(source: string): Step[] {
  const out: Step[] = [];
  for (const token of source.split(/\s+/)) {
    if (token === '' || token === '|') continue;
    // The octave digit must follow the accidental, which is what keeps `bb3` (B flat) readable
    // next to `b3` (B natural) without a second notation.
    const match = /^([a-g])([#b]?)([0-7])([~v^]*)$/.exec(token);
    if (match) {
      const [, letter, accidental, octave, marks] = match;
      const midi =
        (Number(octave) + 1) * 12 +
        NOTE_SEMIS[letter] +
        (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
      out.push({
        midi,
        tie: false,
        hit: null,
        effect: marks.includes('~')
          ? 'slide'
          : marks.includes('v')
            ? 'vibrato'
            : marks.includes('^')
              ? 'arp'
              : null,
      });
      continue;
    }
    if (token === '-' || token === 'r') {
      out.push({ midi: null, tie: false, hit: null, effect: null });
      continue;
    }
    if (token === '.') {
      out.push({ midi: null, tie: true, hit: null, effect: null });
      continue;
    }
    const hit = ({ k: 'kick', s: 'snare', h: 'hat', o: 'open' } as const)[token as 'k'];
    if (hit) {
      out.push({ midi: null, tie: false, hit, effect: null });
      continue;
    }
    throw new Error(`Unreadable chiptune step "${token}"`);
  }
  return out;
}

export interface PreparedChannel extends Channel {
  pattern: Step[];
}

export interface PreparedTrack extends Omit<Track, 'channels'> {
  channels: PreparedChannel[];
  /** Steps in the loop, and how long one loop lasts in seconds. */
  lengthSteps: number;
  loopSeconds: number;
}

/** Turns score data into played data: parsed patterns, a shared length, and a loop duration. */
export function prepareTrack(track: Track): PreparedTrack {
  const channels = track.channels.map((channel) => ({
    ...channel,
    pattern: parseSteps(channel.steps),
  }));
  const length = channels[0]?.pattern.length ?? 0;
  if (length === 0) throw new Error(`Track ${track.id} has no steps`);
  for (const channel of channels) {
    if (channel.pattern.length !== length) {
      throw new Error(
        `Track ${track.id}: ${channel.wave} channel has ${channel.pattern.length} steps, not ${length}`,
      );
    }
  }
  const stepSeconds = 60 / track.bpm / track.stepsPerBeat;
  return {
    ...track,
    channels,
    lengthSteps: length,
    loopSeconds: stepSeconds * length,
  };
}

/* -------------------------------------------------------------------------------------------
 * Tracks. Six loops and three stingers, all original: a hearth for the budgeting screens, one
 * theme per Hollow, a boss theme, a results theme, and short celebrations.
 * ----------------------------------------------------------------------------------------- */

export const TRACKS: readonly Track[] = [
  {
    id: 'camp',
    title: 'Lantern in the Camp',
    bpm: 74,
    swing: 0.06,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.25,
        volume: 0.3,
        steps: `a4 - . . e5 - . . c5 - b4 - a4 - . .
                e5 - . . a5 - . . g5 - e5 - c5 - . .
                d5 - . . g5 - . . f5 - d5 - c5 - a4 -
                b4 - . . e5 - . . d5 - b4 - a4 - . .`,
      },
      {
        wave: 'triangle',
        volume: 0.5,
        steps: `a2 - - - a2 - - - e3 - - - e3 - - -
                c3 - - - c3 - - - g3 - - - g3 - - -
                f3 - - - f3 - - - c3 - - - c3 - - -
                g2 - - - g2 - - - e3 - - - e3 - - -`,
      },
      {
        wave: 'pulse',
        duty: 0.5,
        volume: 0.1,
        steps: `a3 . . . . . . . c4 . . . . . . .
                e4 . . . . . . . c4 . . . . . . .
                f4 . . . . . . . c4 . . . . . . .
                e4 . . . . . . . b3 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.22,
        steps: `h - h - h - h - h - h - h - h -
                h - h - h - h - h - h - h - o -
                h - h - h - h - h - h - h - h -
                h - h - h - h - h - h - h - o -`,
      },
    ],
  },
  {
    id: 'hollow1',
    title: 'Rootfall Warren',
    bpm: 98,
    swing: 0.04,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.125,
        volume: 0.26,
        steps: `d4 - d4 - f4 - d4 - a4 - . . f4 - d4 -
                g4 - g4 - f4 - d4 - c5 - . . a4 - f4 -
                d4 - d4 - f4 - g4 - a4 - . . c5 - a4 -
                f4 - e4 - d4 - . . d4 - a3 - . . - -`,
      },
      {
        wave: 'triangle',
        volume: 0.5,
        steps: `d2 - - - d2 - - - d2 - - - a2 - - -
                d2 - - - d2 - - - f2 - - - c3 - - -
                d2 - - - d2 - - - d2 - - - a2 - - -
                g2 - - - g2 - - - a2 - - - a2 - - -`,
      },
      {
        wave: 'pulse',
        duty: 0.5,
        volume: 0.09,
        steps: `d3 . . . . . . . f3 . . . . . . .
                a3 . . . . . . . f3 . . . . . . .
                d3 . . . . . . . g3 . . . . . . .
                a3 . . . . . . . e3 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.26,
        steps: `k - h - s - h - k - h - s - h k
                k - h - s - h - k - h - s - h -
                k - h - s - h - k - h - s - h k
                k - k - s - h - k - h - s s h o`,
      },
    ],
  },
  {
    id: 'hollow2',
    title: 'Saltglass Hollow',
    bpm: 112,
    swing: 0,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.25,
        volume: 0.24,
        steps: `f4^ - - - a4 - - - c5 - . . a4 - - -
                g4 - - - b4 - - - d5 - . . b4 - - -
                a4^ - - - c5 - - - e5 - . . c5 - - -
                f5 - e5 - d5 - c5 - a4 - . . g4 - - -`,
      },
      {
        wave: 'triangle',
        volume: 0.48,
        steps: `f2 - f3 - f2 - f3 - c3 - c4 - c3 - c4 -
                g2 - g3 - g2 - g3 - d3 - d4 - d3 - d4 -
                a2 - a3 - a2 - a3 - e3 - e4 - e3 - e4 -
                c3 - c4 - c3 - c4 - g2 - g3 - g2 - g3 -`,
      },
      {
        wave: 'pulse',
        duty: 0.5,
        volume: 0.08,
        steps: `c5 . . . . . . . a4 . . . . . . .
                b4 . . . . . . . g4 . . . . . . .
                e5 . . . . . . . c5 . . . . . . .
                a4 . . . . . . . g4 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.2,
        steps: `k - h - s - h - k - h - s - h -
                k - h - s - h - k - h k - - h -
                k - h - s - h - k - h - s - h k
                k - h - s - h - s - s - s s h o`,
      },
    ],
  },
  {
    id: 'hollow3',
    title: 'Emberreach Deep',
    bpm: 128,
    swing: 0,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.125,
        volume: 0.26,
        steps: `e4~ e4 - g4 - b4 - g4 - e4 - g4 - b4~ - - -
                c5 - b4 - g4 - e4 - d5 - b4 - g4~ - - -
                e4~ e4 - g4 - b4 - c5 - d5 - c5 - b4 -
                a4 - g4 - f4 - e4 - g4 - b4 - e5 - - -`,
      },
      {
        wave: 'triangle',
        volume: 0.52,
        steps: `e2 - e2 - e2 - e2 - e2 - e2 - g2 - g2 -
                c3 - c3 - c3 - c3 - c3 - c3 - g2 - g2 -
                e2 - e2 - e2 - e2 - a2 - a2 - b2 - b2 -
                f2 - f2 - g2 - g2 - e2 - e2 - e2 - e2 -`,
      },
      {
        wave: 'pulse',
        duty: 0.25,
        volume: 0.08,
        steps: `b3 . . . . . . . e4 . . . . . . .
                g4 . . . . . . . e4 . . . . . . .
                b3 . . . . . . . c4 . . . . . . .
                d4 . . . . . . . e4 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.28,
        steps: `k - h k s - h - k - h k s - h k
                k - h k s - h - k - h - s - h -
                k - h k s - h k k - h k s - h k
                k - k - s - s - k - h - s s h o`,
      },
    ],
  },
  {
    id: 'boss',
    title: 'The Warden Wakes',
    bpm: 132,
    swing: 0,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.5,
        volume: 0.28,
        steps: `c4~ - - - c4 - eb4 - g4 - - - gb4~ - - -
                c4~ - - - c4 - bb3 - g3 - - - gb4 - f4 -
                c5 - - - c5 - eb5 - g5 - - - gb5~ - - -
                f5 - e5 - eb5 - d5 - c5 - b4 - bb4 - - -`,
      },
      {
        wave: 'triangle',
        volume: 0.55,
        steps: `c2 - c2 - c2 - c2 - gb2 - gb2 - gb2 - gb2 -
                c2 - c2 - c2 - c2 - f2 - f2 - f2 - f2 -
                c2 - c2 - c2 - c2 - gb2 - gb2 - g2 - g2 -
                c2 - c2 - c2 - c2 - c2 - c2 - c2 - c2 -`,
      },
      {
        wave: 'pulse',
        duty: 0.125,
        volume: 0.07,
        steps: `eb4 . . . . . . . . . . . g4 . . .
                bb4 . . . . . . . . . . . gb4 . . .
                c5 . . . . . . . . . . . eb5 . . .
                d5 . . . . . . . c5 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.3,
        steps: `k - k - s - k - k - k - s - k s
                k - k - s - k - k - k - s s k -
                k k - - s - k - k k - - s - k s
                k - s - k - s - s s s s h h h o`,
      },
    ],
  },
  {
    id: 'results',
    title: 'What the Run Left Behind',
    bpm: 96,
    swing: 0.08,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: true,
    channels: [
      {
        wave: 'pulse',
        duty: 0.25,
        volume: 0.3,
        steps: `g4 - b4 - d5 - . . e5 - d5 - b4 - . .
                c5 - . . b4 - a4 - g4 - . . d5 - - -
                g4 - b4 - d5 - . . e5 - g5 - f5 - d5 -
                b4 - . . g4 - - - a4 - b4 - c5 - d5 -`,
      },
      {
        wave: 'triangle',
        volume: 0.5,
        steps: `g2 - - - g2 - - - d3 - - - d3 - - -
                c3 - - - c3 - - - g2 - - - g2 - - -
                g2 - - - g2 - - - d3 - - - b2 - - -
                c3 - - - e3 - - - d3 - - - d3 - - -`,
      },
      {
        wave: 'pulse',
        duty: 0.5,
        volume: 0.1,
        steps: `d4 . . . . . . . b3 . . . . . . .
                e4 . . . . . . . d4 . . . . . . .
                d4 . . . . . . . g4 . . . . . . .
                e4 . . . . . . . f4 . . . . . . .`,
      },
      {
        wave: 'noise',
        volume: 0.22,
        steps: `k - h - s - h - k - h - s - h -
                k - h - s - h - k - h - s - h k
                k - h - s - h - k - h - s - h -
                k - h - s - h - s - s - s s h o`,
      },
    ],
  },
];

/** One-shot celebrations. Short, quiet, and never a reason to wait. */
export const STINGERS: readonly Track[] = [
  {
    id: 'levelUp',
    title: 'A Level Earned',
    bpm: 120,
    swing: 0,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: false,
    channels: [
      { wave: 'pulse', duty: 0.25, volume: 0.32, steps: `c5 - e5 - g5 - c6^ - . . . . - - - -` },
      { wave: 'triangle', volume: 0.4, steps: `c3 - - - g3 - - - c4 . . . . . . .` },
      { wave: 'pulse', duty: 0.5, volume: 0.1, steps: `e4 . . . . . . . g4 . . . . . . .` },
      { wave: 'noise', volume: 0.16, steps: `- - - - - - k - h - h - o - - -` },
    ],
  },
  {
    id: 'fusion',
    title: 'Two Boons, One Shape',
    bpm: 132,
    swing: 0,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: false,
    channels: [
      {
        wave: 'pulse',
        duty: 0.125,
        volume: 0.3,
        steps: `a4~ - c5~ - f5~ - a5~ - c6 - . . . . . .`,
      },
      { wave: 'triangle', volume: 0.42, steps: `a2 - - - f3 - - - a3 . . . . . . .` },
      { wave: 'pulse', duty: 0.5, volume: 0.11, steps: `c4 . . . . . . . e4 . . . . . . .` },
      { wave: 'noise', volume: 0.18, steps: `- - - - k - - - s - h - o - - -` },
    ],
  },
  {
    id: 'questComplete',
    title: 'A Quest Closes',
    bpm: 126,
    swing: 0.05,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    loops: false,
    channels: [
      { wave: 'pulse', duty: 0.25, volume: 0.3, steps: `e5 - g5 - a5 - . . g5 - e5 - a5~ - . .` },
      { wave: 'triangle', volume: 0.4, steps: `a2 - - - e3 - - - a3 . . . . . . .` },
      { wave: 'pulse', duty: 0.5, volume: 0.1, steps: `c4 . . . . . . . e4 . . . . . . .` },
      { wave: 'noise', volume: 0.16, steps: `k - h - s - h - k - h - s - h o` },
    ],
  },
];

export const ALL_TRACKS: readonly Track[] = [...TRACKS, ...STINGERS];

export function trackById(id: string): Track | undefined {
  return ALL_TRACKS.find((track) => track.id === id);
}

/** The Hollow themes, indexed by Hollow id, so a run knows what to play. */
export function hollowTrackId(hollow: number): string {
  return hollow === 2 ? 'hollow2' : hollow === 3 ? 'hollow3' : 'hollow1';
}
