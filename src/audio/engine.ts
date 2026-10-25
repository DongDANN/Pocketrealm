/**
 * The tracker player. Four channels — two pulses, a triangle and a noise voice — scheduled a short
 * way ahead of the audio clock, over three buses: master, music and SFX.
 *
 * Nothing here exists until a gesture asks for it. `enableAudio` is the only path that creates an
 * `AudioContext`, and every other entry point is safe to call before then, so a screen can hand the
 * engine an event without knowing whether the player has sound on.
 */

import { prepareTrack, trackById, type PreparedTrack, type Step, type Track } from './score';
import { playArpeggio, playHit, playVoice } from './synth';
import { sfxPreset } from './sfx';

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
}

/** Off by default: a budgeting app should not start making noise at someone's desk. */
export const DEFAULT_VOLUMES: AudioVolumes = { master: 0.6, music: 0.5, sfx: 0.8 };

const LOOKAHEAD_SECONDS = 0.25;
const TICK_MS = 25;
/** Two identical sounds inside this window collapse into one, so a fast run cannot machine-gun. */
const SFX_SAME_NAME_GAP = 0.04;
/** How far the music bus drops while a sound plays, and how long it takes to come back. */
const DUCK_LEVEL = 0.45;
const DUCK_RECOVER = 0.22;

function audioContextCtor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const legacy = (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  return window.AudioContext ?? legacy;
}

export function stepSeconds(track: Pick<Track, 'bpm' | 'stepsPerBeat'>): number {
  return 60 / track.bpm / track.stepsPerBeat;
}

/** The shuffle applied to every second step of a bar; 0 when the track has no swing. */
export function swingOffset(track: Track, step: number): number {
  return step % 2 === 1 ? track.swing * stepSeconds(track) : 0;
}

function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

/** The note a `~` slides toward: the next played step in the same channel. */
function slideTarget(pattern: Step[], step: number): number | undefined {
  for (let index = step + 1; index < pattern.length; index += 1) {
    const midi = pattern[index]?.midi;
    if (midi !== null && midi !== undefined) return midi;
  }
  return undefined;
}

export class ChiptuneEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private volumes: AudioVolumes = { ...DEFAULT_VOLUMES };
  private enabled = false;
  private track: PreparedTrack | null = null;
  private step = 0;
  private nextStepAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSfx = new Map<string, number>();

  isEnabled(): boolean {
    return this.enabled;
  }

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  currentTrack(): string | null {
    return this.track?.id ?? null;
  }

  /** True when this browser can host an AudioContext at all. */
  static supported(): boolean {
    return audioContextCtor() !== undefined;
  }

  /**
   * Must be called from a user gesture. Returns false — and creates nothing — when the browser has
   * no WebAudio or refuses to start the context.
   */
  async enableAudio(volumes?: Partial<AudioVolumes>): Promise<boolean> {
    this.setVolumes(volumes ?? {});
    const Ctor = audioContextCtor();
    if (!Ctor) return false;
    try {
      this.ctx = this.ctx ?? new Ctor();
      await this.ctx.resume();
    } catch {
      return false;
    }
    if (!this.ctx) return false;
    this.buildBuses();
    this.enabled = true;
    // A previous disableAudio ramped the buses to silence; bring them back up.
    this.applyVolumes(0.15);
    return true;
  }

  /** Master, music and SFX gains, built once and left silent until `applyVolumes` opens them. */
  private buildBuses(): void {
    if (!this.ctx || this.master) return;
    const master = this.ctx.createGain();
    master.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    master.connect(this.ctx.destination);
    const music = this.ctx.createGain();
    music.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    music.connect(master);
    const sfx = this.ctx.createGain();
    sfx.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    sfx.connect(master);
    this.master = master;
    this.musicBus = music;
    this.sfxBus = sfx;
  }

  disableAudio(): void {
    this.enabled = false;
    this.stopMusic();
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      for (const bus of [this.master, this.musicBus, this.sfxBus]) {
        if (!bus) continue;
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), now);
        bus.gain.linearRampToValueAtTime(0.0001, now + 0.25);
      }
    }
  }

  setVolumes(next: Partial<AudioVolumes>): void {
    this.volumes = {
      master: clampVolume(next.master ?? this.volumes.master),
      music: clampVolume(next.music ?? this.volumes.music),
      sfx: clampVolume(next.sfx ?? this.volumes.sfx),
    };
    this.applyVolumes(0.1);
  }

  private applyVolumes(ramp: number): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const now = this.ctx.currentTime;
    const set = (node: GainNode, value: number) => {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(Math.max(0.0001, node.gain.value), now);
      node.gain.linearRampToValueAtTime(Math.max(0.0001, value), now + ramp);
    };
    set(this.master, this.volumes.master);
    set(this.musicBus, this.volumes.music);
    set(this.sfxBus, this.volumes.sfx);
  }

  /** Starts a looping track, or does nothing when that track is already the one playing. */
  startMusic(id: string): boolean {
    const raw = trackById(id);
    if (!raw || !this.enabled || !this.ctx || !this.musicBus) return false;
    if (this.track?.id === id) return true;
    this.track = prepareTrack(raw);
    this.step = 0;
    this.nextStepAt = this.ctx.currentTime + 0.08;
    this.applyVolumes(0.4);
    this.tick();
    if (this.timer === null) this.timer = setInterval(() => this.tick(), TICK_MS);
    return true;
  }

  stopMusic(): void {
    this.track = null;
    this.step = 0;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** A one-shot celebration over the music, which ducks for its whole length. */
  playStinger(id: string): boolean {
    const raw = trackById(id);
    if (!raw || !this.enabled || !this.ctx || !this.musicBus) return false;
    const prepared = prepareTrack({ ...raw, loops: false });
    const at = this.ctx.currentTime + 0.02;
    const seconds = stepSeconds(prepared);
    for (let step = 0; step < prepared.lengthSteps; step += 1) {
      this.scheduleStep(prepared, step, at + step * seconds, seconds, true);
    }
    this.duck(prepared.loopSeconds);
    return true;
  }

  playSfx(name: string): boolean {
    const preset = sfxPreset(name);
    if (!preset || !this.enabled || !this.ctx || !this.sfxBus) return false;
    const now = this.ctx.currentTime;
    const previous = this.lastSfx.get(preset.name);
    if (previous !== undefined && now - previous < SFX_SAME_NAME_GAP) return false;
    this.lastSfx.set(preset.name, now);
    const bus = this.sfxBus;
    for (const blip of preset.blips) {
      const at = now + 0.005 + blip.at;
      if (blip.hit) {
        playHit(this.ctx, bus, blip.hit, at, blip.volume);
        continue;
      }
      // A sweep is written in hertz; the voice layer takes a MIDI frame, so convert both ends.
      const from = blip.midi ?? (blip.hz ? 69 + 12 * Math.log2(blip.hz / 440) : 69);
      const to = blip.hz && blip.slideTo ? blip.slideTo / blip.hz : undefined;
      playVoice(this.ctx, bus, blip.wave, from, {
        at,
        duration: blip.dur,
        volume: blip.volume,
        effect: to ? 'slide' : null,
        slideTo: to ? 12 * Math.log2(to) : blip.slideTo,
      });
    }
    this.duck(0.12);
    return true;
  }

  private duck(seconds: number): void {
    if (!this.ctx || !this.musicBus || !this.track) return;
    const now = this.ctx.currentTime;
    const gain = this.musicBus.gain;
    const level = Math.max(0.0001, this.volumes.music);
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(0.0001, gain.value), now);
    gain.linearRampToValueAtTime(level * DUCK_LEVEL, now + 0.03);
    gain.linearRampToValueAtTime(level, now + seconds + DUCK_RECOVER);
  }

  /** Queue every step that falls inside the lookahead window, then wait for the next tick. */
  private tick(): void {
    const ctx = this.ctx;
    const track = this.track;
    if (!ctx || !track) return;
    const seconds = stepSeconds(track);
    while (this.nextStepAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const step = this.step;
      this.scheduleStep(track, step, this.nextStepAt, seconds, false);
      this.nextStepAt += seconds;
      this.step = step + 1;
      if (this.step >= track.lengthSteps) {
        if (!track.loops) {
          this.stopMusic();
          return;
        }
        this.step = 0;
      }
    }
  }

  private scheduleStep(
    track: PreparedTrack,
    step: number,
    baseAt: number,
    seconds: number,
    immediate: boolean,
  ): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const at = immediate ? baseAt : baseAt + swingOffset(track, step);
    for (const channel of track.channels) {
      const cell = channel.pattern[step];
      if (!cell || cell.tie || cell.midi === null) continue;
      if (channel.wave === 'noise') {
        playHit(ctx, bus, cell.hit ?? 'hat', at, channel.volume);
        continue;
      }
      // A note holds through the ties that follow it, so a half note is not four plucks.
      let hold = 1;
      while (hold < track.lengthSteps && channel.pattern[(step + hold) % track.lengthSteps]?.tie) {
        hold += 1;
      }
      const duration = seconds * hold * 0.95;
      if (cell.effect === 'arp') {
        playArpeggio(ctx, bus, channel.wave, cell.midi, {
          at,
          duration,
          volume: channel.volume,
          effect: null,
        });
        continue;
      }
      playVoice(ctx, bus, channel.wave, cell.midi, {
        at,
        duration,
        volume: channel.volume,
        effect: cell.effect,
        slideTo: cell.effect === 'slide' ? slideTarget(channel.pattern, step) : undefined,
      });
    }
  }
}

/**
 * One engine per document. The UI reaches it through `src/ui/lib/sound.ts`, which is the lazy
 * boundary: nothing imports this module until the player turns sound on.
 */
export const chiptune = new ChiptuneEngine();
