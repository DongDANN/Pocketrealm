/**
 * Original four-channel chiptune loop and three UI sounds, synthesized at runtime with
 * WebAudio. Nothing loads from the network, and no audio context exists until the player
 * explicitly turns sound on. Score data is deterministic so it can be tested headlessly.
 */

export const MUSIC = {
  bpm: 80,
  bars: 4,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  channels: ['lead', 'bass', 'pad', 'perc'] as const,
  lead: [
    76,
    null,
    74,
    72,
    null,
    69,
    72,
    76,
    74,
    null,
    72,
    69,
    null,
    65,
    69,
    72,
    76,
    79,
    76,
    72,
    null,
    67,
    64,
    67,
    74,
    null,
    71,
    67,
    null,
    71,
    74,
    79,
  ],
  bass: [
    45,
    null,
    null,
    45,
    null,
    52,
    null,
    45,
    41,
    null,
    null,
    41,
    null,
    48,
    null,
    41,
    48,
    null,
    null,
    48,
    null,
    55,
    null,
    48,
    43,
    null,
    null,
    43,
    null,
    50,
    null,
    43,
  ],
  pad: [
    [57, 60, 64],
    [53, 57, 60],
    [60, 64, 67],
    [55, 59, 62],
  ],
  perc: [
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    null,
    'hat',
    'kick',
    'hat',
    'hat',
    'kick',
  ],
} as const;

export const MUSIC_LOOP_SECONDS = (60 / MUSIC.bpm) * MUSIC.beatsPerBar * MUSIC.bars;

export type SfxName = 'tap' | 'coin' | 'check';
export const SFX_NAMES = ['tap', 'coin', 'check'] as const satisfies readonly SfxName[];

const note = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

let ctx: AudioContext | null = null;
let enabled = false;
let musicBus: GainNode | null = null;
let nextLoopAt = 0;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let noise: AudioBuffer | null = null;

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  return window.AudioContext ?? legacy;
}

function getNoise(context: AudioContext): AudioBuffer {
  if (noise) return noise;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.25), context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x51f15e;
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
  }
  noise = buffer;
  return buffer;
}

function tone(
  context: AudioContext,
  destination: AudioNode,
  type: OscillatorType,
  frequency: number,
  at: number,
  duration: number,
  volume: number,
): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(at);
  osc.stop(at + duration + 0.03);
}

function kick(context: AudioContext, destination: AudioNode, at: number): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, at);
  osc.frequency.exponentialRampToValueAtTime(42, at + 0.1);
  gain.gain.setValueAtTime(0.055, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(at);
  osc.stop(at + 0.18);
}

function hat(context: AudioContext, destination: AudioNode, at: number): void {
  const source = context.createBufferSource();
  source.buffer = getNoise(context);
  const filter = context.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.018, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(at);
  source.stop(at + 0.06);
}

function scheduleLoop(context: AudioContext, bus: GainNode, start: number): void {
  const step = 60 / MUSIC.bpm / MUSIC.stepsPerBeat;
  const bar = step * MUSIC.beatsPerBar * MUSIC.stepsPerBeat;

  MUSIC.lead.forEach((midi, index) => {
    if (midi === null) return;
    tone(context, bus, 'square', note(midi), start + index * step, step * 0.75, 0.032);
  });
  MUSIC.bass.forEach((midi, index) => {
    if (midi === null) return;
    tone(context, bus, 'triangle', note(midi), start + index * step, step * 1.6, 0.07);
  });
  MUSIC.pad.forEach((chord, index) => {
    const at = start + index * bar;
    for (const midi of chord) {
      tone(context, bus, 'triangle', note(midi), at, bar * 0.94, 0.012);
    }
  });
  MUSIC.perc.forEach((hit, index) => {
    if (hit === null) return;
    const at = start + index * step;
    if (hit === 'kick') kick(context, bus, at);
    else hat(context, bus, at);
  });
}

function pump(): void {
  if (!enabled || !ctx) return;
  while (nextLoopAt < ctx.currentTime + MUSIC_LOOP_SECONDS * 2) {
    scheduleLoop(ctx, musicBus!, nextLoopAt);
    nextLoopAt += MUSIC_LOOP_SECONDS;
  }
  pumpTimer = setTimeout(pump, 1000);
}

export async function enableSound(): Promise<boolean> {
  const Ctor = audioContextCtor();
  if (!Ctor) return false;
  try {
    ctx = ctx ?? new Ctor();
    await ctx.resume();
  } catch {
    return false;
  }
  if (enabled) return true;
  enabled = true;
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicBus.gain.exponentialRampToValueAtTime(0.65, ctx.currentTime + 0.8);
  musicBus.connect(ctx.destination);
  nextLoopAt = ctx.currentTime + 0.08;
  pump();
  return true;
}

export function disableSound(): void {
  enabled = false;
  if (pumpTimer !== null) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  const bus = musicBus;
  musicBus = null;
  if (ctx && bus) {
    const now = ctx.currentTime;
    const current = Math.max(0.0001, bus.gain.value);
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(current, now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    setTimeout(() => bus.disconnect(), 400);
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function playSfx(name: SfxName): void {
  if (!enabled || !ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const at = ctx.currentTime + 0.005;
  if (name === 'tap') {
    tone(ctx, ctx.destination, 'square', 660, at, 0.05, 0.028);
  } else if (name === 'coin') {
    tone(ctx, ctx.destination, 'square', 988, at, 0.06, 0.032);
    tone(ctx, ctx.destination, 'square', 1319, at + 0.06, 0.08, 0.032);
  } else {
    tone(ctx, ctx.destination, 'triangle', 523, at, 0.07, 0.04);
    tone(ctx, ctx.destination, 'triangle', 659, at + 0.07, 0.07, 0.04);
    tone(ctx, ctx.destination, 'triangle', 784, at + 0.14, 0.1, 0.04);
  }
}
