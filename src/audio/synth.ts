/**
 * The four voices the chiptune engine can mix: two pulses with a selectable duty cycle, one
 * triangle and one noise channel. Everything is synthesized at runtime — no audio files, so the
 * offline pack stays a code-and-art download.
 */

import { midiToHz, type StepEffect, type Wave } from './score';

/** Fourier coefficients for a pulse wave of the given duty cycle, cached per duty. */
const pulseWaves = new Map<number, PeriodicWave>();

export function pulseWave(context: AudioContext, duty: number): PeriodicWave {
  const cached = pulseWaves.get(duty);
  if (cached) return cached;
  const harmonics = 24;
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let n = 1; n < harmonics; n += 1) {
    // A pulse wave is a sum of sines whose amplitude falls off with a sin(n·π·duty) envelope.
    imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  const wave = context.createPeriodicWave(real, imag, { disableNormalization: false });
  pulseWaves.set(duty, wave);
  return wave;
}

let noiseBuffer: AudioBuffer | null = null;

export function noiseSource(context: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
  const data = buffer.getChannelData(0);
  // Deterministic xorshift: the same "kit" on every device, which keeps a run's sound repeatable.
  let seed = 0x51f15e;
  for (let i = 0; i < data.length; i += 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

export interface VoiceOptions {
  at: number;
  duration: number;
  volume: number;
  effect?: StepEffect | null;
  /** Semitones the note travels by the end of a `slide`, and the vibrato depth in cents. */
  slideTo?: number;
  vibratoHz?: number;
}

/** One plucked/struck voice into `destination`. Returns when the node is scheduled to stop. */
export function playVoice(
  context: AudioContext,
  destination: AudioNode,
  wave: Wave,
  midi: number,
  options: VoiceOptions,
): number {
  const { at, duration, volume, effect = null } = options;
  const end = at + duration;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, volume),
    at + Math.min(0.02, duration * 0.2),
  );
  // A chiptune note decays instead of holding, so a bar of eighth notes still breathes.
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(destination);

  const osc = context.createOscillator();
  if (wave === 'triangle') osc.type = 'triangle';
  else osc.setPeriodicWave(pulseWave(context, wave === 'noise' ? 0.5 : 0.25));
  osc.frequency.setValueAtTime(midiToHz(midi), at);

  if (effect === 'slide' && options.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(midiToHz(midi + options.slideTo), end);
  }
  if (effect === 'vibrato') {
    const lfo = context.createOscillator();
    const depth = context.createGain();
    lfo.frequency.setValueAtTime(options.vibratoHz ?? 5.5, at);
    depth.gain.setValueAtTime(6, at);
    lfo.connect(depth);
    depth.connect(osc.frequency);
    lfo.start(at);
    lfo.stop(end + 0.02);
  }
  osc.start(at);
  osc.stop(end + 0.02);
  return end;
}

/** An arpeggiated step: the triad a note stands for, played as three fast sixteenths. */
export function playArpeggio(
  context: AudioContext,
  destination: AudioNode,
  wave: Wave,
  midi: number,
  options: VoiceOptions,
): void {
  const slice = options.duration / 3;
  for (const [index, offset] of [0, 4, 7].entries()) {
    playVoice(context, destination, wave, midi + offset, {
      ...options,
      at: options.at + slice * index,
      duration: slice * 0.9,
    });
  }
}

export type Hit = 'kick' | 'snare' | 'hat' | 'open';

/** The noise voice, tuned into the four drums a 1-bit soundtrack actually needs. */
export function playHit(
  context: AudioContext,
  destination: AudioNode,
  hit: Hit,
  at: number,
  volume: number,
): void {
  const source = context.createBufferSource();
  source.buffer = noiseSource(context);
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const shape: Record<
    Hit,
    { type: BiquadFilterType; freq: number; length: number; level: number }
  > = {
    kick: { type: 'lowpass', freq: 320, length: 0.12, level: 1 },
    snare: { type: 'highpass', freq: 1400, length: 0.11, level: 0.8 },
    hat: { type: 'highpass', freq: 6500, length: 0.035, level: 0.5 },
    open: { type: 'highpass', freq: 5200, length: 0.16, level: 0.5 },
  };
  const { type, freq, length, level } = shape[hit];
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  gain.gain.setValueAtTime(Math.max(0.0002, volume * level), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(at, 0, length + 0.05);
  source.stop(at + length + 0.05);
}
