import { describe, expect, it } from 'vitest';
import {
  STINGERS,
  TRACKS,
  hollowTrackId,
  midiToHz,
  parseSteps,
  prepareTrack,
  trackById,
  type Track,
} from '../src/audio/score';
import { SFX_NAMES, SFX_PRESETS } from '../src/audio/sfx';
import { ChiptuneEngine, stepSeconds, swingOffset } from '../src/audio/engine';
import {
  DEFAULT_LEVELS,
  currentMusic,
  isSoundOn,
  loadSoundLevels,
  requestMusic,
  saveSoundLevels,
} from '../src/ui/lib/sound';

const playable = (midi: number): boolean => midi >= 36 && midi <= 96;

describe('chiptune score', () => {
  it('ships six looping themes and three one-shot stingers', () => {
    expect(TRACKS.map((track) => track.id)).toEqual([
      'camp',
      'hollow1',
      'hollow2',
      'hollow3',
      'boss',
      'results',
    ]);
    expect(STINGERS.map((track) => track.id)).toEqual(['levelUp', 'fusion', 'questComplete']);
    expect(TRACKS.every((track) => track.loops)).toBe(true);
    expect(STINGERS.every((track) => !track.loops)).toBe(true);
  });

  it('gives every track the four channels the engine mixes', () => {
    for (const track of [...TRACKS, ...STINGERS]) {
      expect(track.channels, track.id).toHaveLength(4);
      expect(
        track.channels
          .map((channel) => channel.wave)
          .sort()
          .join(','),
        track.id,
      ).toBe('noise,pulse,pulse,triangle');
      for (const channel of track.channels) {
        if (channel.wave === 'pulse') expect([0.125, 0.25, 0.5]).toContain(channel.duty);
        else expect(channel.duty, `${track.id} ${channel.wave}`).toBeUndefined();
        expect(channel.volume).toBeGreaterThan(0);
        expect(channel.volume).toBeLessThanOrEqual(0.6);
      }
    }
  });

  it('keeps every channel the same length and every note playable', () => {
    for (const track of [...TRACKS, ...STINGERS]) {
      const prepared = prepareTrack(track);
      expect(prepared.lengthSteps % (prepared.beatsPerBar * prepared.stepsPerBeat)).toBe(0);
      for (const channel of prepared.channels) {
        expect(channel.pattern, `${track.id} ${channel.wave}`).toHaveLength(prepared.lengthSteps);
        for (const step of channel.pattern) {
          if (step.midi !== null) expect(playable(step.midi), `${track.id}`).toBe(true);
        }
      }
    }
  });

  it('writes loops long enough to leave and themes short enough to repeat', () => {
    for (const track of TRACKS) {
      const prepared = prepareTrack(track);
      // A fast theme loops sooner; anything under seven seconds and a player hears the seam.
      expect(prepared.loopSeconds, track.id).toBeGreaterThanOrEqual(7);
      expect(prepared.loopSeconds, track.id).toBeLessThanOrEqual(45);
      expect(prepared.bpm).toBeGreaterThanOrEqual(60);
      expect(prepared.bpm).toBeLessThanOrEqual(160);
      expect(prepared.swing).toBeGreaterThanOrEqual(0);
      expect(prepared.swing).toBeLessThanOrEqual(0.5);
    }
    for (const stinger of STINGERS) {
      expect(prepareTrack(stinger).loopSeconds).toBeLessThanOrEqual(4);
    }
  });

  it('rejects a channel that does not line up with the others', () => {
    const broken: Track = {
      ...TRACKS[0],
      channels: TRACKS[0].channels.map((channel, index) =>
        index === 0 ? { ...channel, steps: `${channel.steps} -` } : channel,
      ),
    };
    expect(() => prepareTrack(broken)).toThrow(/steps, not/);
  });

  it('reads notes, sharps, flats, rests, holds and the three effects', () => {
    const [a, b, c, d, e] = parseSteps('c4 . - f#4~ d5v');
    expect(a).toMatchObject({ midi: 60, tie: false, effect: null });
    expect(b).toMatchObject({ tie: true });
    expect(c).toMatchObject({ midi: null, tie: false });
    expect(d).toMatchObject({ midi: 66, effect: 'slide' });
    expect(e).toMatchObject({ midi: 74, effect: 'vibrato' });
    expect(parseSteps('a4^')[0]).toMatchObject({ effect: 'arp' });
    expect(parseSteps('b3 bb3')[1]?.midi).toBe(parseSteps('a#3')[0]!.midi);
    expect(parseSteps('k | s h o').map((step) => step.hit)).toEqual([
      'kick',
      'snare',
      'hat',
      'open',
    ]);
    expect(() => parseSteps('h4')).toThrow(/Unreadable chiptune step/);
  });

  it('maps a run to its Hollow theme', () => {
    expect(hollowTrackId(1)).toBe('hollow1');
    expect(hollowTrackId(2)).toBe('hollow2');
    expect(hollowTrackId(3)).toBe('hollow3');
    expect(hollowTrackId(9)).toBe('hollow1');
    expect(trackById('camp')?.title).toBe('Lantern in the Camp');
    expect(trackById('nope')).toBeUndefined();
    expect(midiToHz(69)).toBeCloseTo(440, 6);
  });
});

describe('sfx library', () => {
  it('carries at least 24 distinct, playable presets', () => {
    expect(SFX_PRESETS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SFX_NAMES).size).toBe(SFX_NAMES.length);
    for (const required of [
      'tap',
      'confirm',
      'error',
      'coin',
      'loot',
      'hit',
      'crit',
      'hurt',
      'castFlame',
      'castFrost',
      'castSpark',
      'castVerdant',
      'castVoid',
      'statusStun',
      'levelUp',
    ]) {
      expect(SFX_NAMES, required).toContain(required);
    }
  });

  it('keeps every blip inside the ranges the voices can render', () => {
    for (const preset of SFX_PRESETS) {
      expect(preset.blips.length, preset.name).toBeGreaterThan(0);
      for (const blip of preset.blips) {
        expect(blip.at).toBeGreaterThanOrEqual(0);
        expect(blip.dur).toBeGreaterThan(0);
        expect(blip.dur).toBeLessThanOrEqual(0.6);
        expect(blip.volume).toBeGreaterThan(0);
        expect(blip.volume).toBeLessThanOrEqual(0.4);
        if (blip.hit) continue;
        if (blip.hz !== undefined) expect(blip.hz).toBeGreaterThan(20);
        // Effects sit above the melody range on purpose: a sparkle is meant to be the highest thing
        // on screen, so SFX get the top octave a sung note would never use.
        else expect(blip.midi ?? -1, `${preset.name} ${blip.midi}`).toBeGreaterThanOrEqual(36);
        if (blip.hz === undefined && blip.midi !== undefined)
          expect(blip.midi).toBeLessThanOrEqual(108);
      }
    }
  });
});

describe('engine without a gesture', () => {
  it('creates no AudioContext and refuses every sound in Node', async () => {
    const engine = new ChiptuneEngine();
    expect(ChiptuneEngine.supported()).toBe(false);
    expect(engine.isEnabled()).toBe(false);
    expect(await engine.enableAudio({ master: 1 })).toBe(false);
    expect(engine.isEnabled()).toBe(false);
    expect(engine.startMusic('camp')).toBe(false);
    expect(engine.playSfx('tap')).toBe(false);
    expect(engine.playStinger('levelUp')).toBe(false);
    expect(engine.currentTrack()).toBeNull();
    engine.stopMusic();
    engine.disableAudio();
    expect(engine.getVolumes()).toEqual({ master: 1, music: 0.5, sfx: 0.8 });
  });

  it('swings only the off-steps, and never when a track has no shuffle', () => {
    const track = trackById('camp')!;
    const seconds = stepSeconds(track);
    expect(swingOffset(track, 0)).toBe(0);
    expect(swingOffset(track, 1)).toBeCloseTo(track.swing * seconds, 10);
    expect(swingOffset(trackById('hollow2')!, 3)).toBe(0);
  });
});

describe('engine with a stand-in WebAudio', () => {
  class FakeParam {
    value = 0;

    setValueAtTime(next: number): this {
      this.value = next;
      return this;
    }

    exponentialRampToValueAtTime(next: number): this {
      this.value = next;
      return this;
    }

    linearRampToValueAtTime(next: number): this {
      this.value = next;
      return this;
    }

    cancelScheduledValues(): this {
      return this;
    }
  }

  class FakeAudioContext {
    currentTime = 0;
    sampleRate = 44_100;
    state = 'running';
    resumes = 0;
    gains = 0;
    voices: number[] = [];
    destination = { connect: () => {}, disconnect: () => {} };

    private node(extra: Record<string, unknown>) {
      return { connect: () => {}, disconnect: () => {}, ...extra };
    }

    createGain() {
      this.gains += 1;
      return this.node({ gain: new FakeParam() });
    }

    createOscillator() {
      const voices = this.voices;
      return this.node({
        type: 'sine',
        frequency: new FakeParam(),
        setPeriodicWave: () => {},
        start: (at: number) => voices.push(at),
        stop: () => {},
      });
    }

    createBufferSource() {
      const voices = this.voices;
      return this.node({
        buffer: null,
        start: (at: number) => voices.push(at),
        stop: () => {},
      });
    }

    createBiquadFilter() {
      return this.node({ type: 'lowpass', frequency: new FakeParam() });
    }

    createBuffer(_channels: number, length: number) {
      const data = new Float32Array(length);
      return { getChannelData: () => data, length };
    }

    createPeriodicWave() {
      return {};
    }

    async resume(): Promise<void> {
      this.resumes += 1;
    }
  }

  /** Runs the body against an engine that believes it found a browser. */
  async function withWebAudio(body: (engine: ChiptuneEngine, context: FakeAudioContext) => void) {
    const globalRef = globalThis as Record<string, unknown>;
    const previous = globalRef.window;
    const built: FakeAudioContext[] = [];
    globalRef.window = {
      AudioContext: class extends FakeAudioContext {
        constructor() {
          super();
          built.push(this);
        }
      },
    };
    const engine = new ChiptuneEngine();
    try {
      expect(ChiptuneEngine.supported()).toBe(true);
      expect(await engine.enableAudio({ master: 0.5, music: 0.4, sfx: 0.6 })).toBe(true);
      const context = built[0]!;
      expect(engine.isEnabled()).toBe(true);
      expect(context.resumes).toBe(1);
      // Master, music and effects exist before a single note is scheduled.
      expect(context.gains).toBe(3);
      body(engine, context);
      engine.disableAudio();
      expect(engine.isEnabled()).toBe(false);
      expect(engine.playSfx('tap')).toBe(false);
      expect(engine.startMusic('camp')).toBe(false);
    } finally {
      engine.stopMusic();
      if (previous === undefined) delete globalRef.window;
      else globalRef.window = previous;
    }
  }

  it('starts a looping theme once the buses exist', async () => {
    await withWebAudio((engine, context) => {
      expect(engine.startMusic('camp')).toBe(true);
      expect(engine.currentTrack()).toBe('camp');
      expect(context.voices.length).toBeGreaterThan(0);
      const scheduled = context.voices.length;
      expect(engine.startMusic('camp')).toBe(true);
      expect(context.voices.length).toBe(scheduled);
      engine.stopMusic();
      expect(engine.currentTrack()).toBeNull();
    });
  });

  it('plays a sound effect and refuses the same name inside its gap', async () => {
    await withWebAudio((engine, context) => {
      engine.startMusic('hollow1');
      const before = context.voices.length;
      expect(engine.playSfx('coin')).toBe(true);
      expect(context.voices.length).toBeGreaterThan(before);
      expect(engine.playSfx('coin')).toBe(false);
      expect(engine.playSfx('loot')).toBe(true);
      expect(engine.playSfx('no-such-sound')).toBe(false);
    });
  });

  it('plays a one-shot stinger and lets it expire on its own', async () => {
    await withWebAudio((engine, context) => {
      engine.startMusic('camp');
      const before = context.voices.length;
      expect(engine.playStinger('levelUp')).toBe(true);
      expect(context.voices.length).toBeGreaterThan(before);
      expect(engine.playStinger('not-a-stinger')).toBe(false);
    });
  });

  it('keeps the volumes the player set and clamps what a bad row offers', async () => {
    await withWebAudio((engine) => {
      expect(engine.getVolumes()).toEqual({ master: 0.5, music: 0.4, sfx: 0.6 });
      engine.setVolumes({ music: 9, sfx: -1 });
      expect(engine.getVolumes()).toEqual({ master: 0.5, music: 1, sfx: 0 });
    });
  });
});

describe('sound preferences', () => {
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const rows = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => void rows.set(key, value),
      rows,
    };
  };

  it('falls back to the shipped levels on a missing or corrupt row', () => {
    expect(loadSoundLevels(fakeStorage())).toEqual(DEFAULT_LEVELS);
    expect(loadSoundLevels(fakeStorage({ 'pocketrealm:sound:v1': 'not json' }))).toEqual(
      DEFAULT_LEVELS,
    );
    expect(loadSoundLevels(undefined)).toEqual(DEFAULT_LEVELS);
  });

  it('merges, clamps and persists a change', () => {
    const storage = fakeStorage();
    expect(saveSoundLevels({ music: 0.2 }, storage)).toEqual({
      master: DEFAULT_LEVELS.master,
      music: 0.2,
      sfx: DEFAULT_LEVELS.sfx,
    });
    expect(saveSoundLevels({ master: 4, sfx: -2 }, storage)).toEqual({
      master: 1,
      music: 0.2,
      sfx: 0,
    });
    expect(loadSoundLevels(storage).music).toBe(0.2);
    expect(storage.rows.get('pocketrealm:sound:v1')).toContain('"music":0.2');
  });

  it('records a requested theme without starting audio', () => {
    expect(isSoundOn()).toBe(false);
    requestMusic('hollow1');
    expect(currentMusic()).toBeNull();
    requestMusic(null);
    expect(isSoundOn()).toBe(false);
  });
});
