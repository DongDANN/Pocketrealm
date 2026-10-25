import { describe, expect, it } from 'vitest';
import {
  MUSIC,
  MUSIC_LOOP_SECONDS,
  SFX_NAMES,
  disableSound,
  enableSound,
  isSoundEnabled,
  playSfx,
} from '../src/audio/chiptune';

function midiOk(value: number | null): boolean {
  return value === null || (value >= 36 && value <= 96);
}

describe('chiptune score', () => {
  it('is a 12-second, four-bar loop at 80 bpm', () => {
    expect(MUSIC.bpm).toBe(80);
    expect(MUSIC.bars).toBe(4);
    expect(MUSIC_LOOP_SECONDS).toBe(12);
    expect(MUSIC_LOOP_SECONDS).toBeGreaterThanOrEqual(10);
    expect(MUSIC_LOOP_SECONDS).toBeLessThanOrEqual(20);
  });

  it('has four channels and 32 eighth-note steps per bar pattern', () => {
    expect(MUSIC.channels).toEqual(['lead', 'bass', 'pad', 'perc']);
    expect(MUSIC.lead).toHaveLength(32);
    expect(MUSIC.bass).toHaveLength(32);
    expect(MUSIC.perc).toHaveLength(32);
    expect(MUSIC.pad).toHaveLength(MUSIC.bars);
    for (const chord of MUSIC.pad) expect(chord).toHaveLength(3);
  });

  it('keeps every note in a playable MIDI range', () => {
    for (const value of MUSIC.lead) expect(midiOk(value)).toBe(true);
    for (const value of MUSIC.bass) expect(midiOk(value)).toBe(true);
    for (const chord of MUSIC.pad) for (const value of chord) expect(midiOk(value)).toBe(true);
    for (const hit of MUSIC.perc) expect([null, 'kick', 'hat']).toContain(hit);
  });

  it('ships exactly three UI sounds', () => {
    expect(SFX_NAMES).toEqual(['tap', 'coin', 'check']);
    expect(new Set(SFX_NAMES).size).toBe(3);
  });

  it('stays silent until a user gesture enables audio', async () => {
    expect(isSoundEnabled()).toBe(false);
    expect(await enableSound()).toBe(false);
    expect(isSoundEnabled()).toBe(false);
    expect(() => playSfx('tap')).not.toThrow();
    disableSound();
  });
});
