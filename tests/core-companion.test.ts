/**
 * Gate 3 — the companion's mood and growth. SPEC 6.2 is explicit that mood comes from logging
 * recency and review habits and NEVER from how much was spent, so this layer takes dates, not money,
 * and the copy is checked for the absence of figures so a greeting cannot imply blame.
 */

import { describe, expect, it } from 'vitest';
import { addDays } from '../src/core/dates';
import { SPECIES, evolutionStage, moodCopy, moodFor } from '../src/core/companion';

const TODAY = '2026-10-25';

describe('moodFor', () => {
  it('reads logging recency, in the bands SPEC 6.2 defines', () => {
    expect(moodFor(TODAY, TODAY)).toBe('happy');
    expect(moodFor(addDays(TODAY, -1), TODAY)).toBe('content');
    expect(moodFor(addDays(TODAY, -2), TODAY)).toBe('content');
    expect(moodFor(addDays(TODAY, -3), TODAY)).toBe('sleepy');
    expect(moodFor(addDays(TODAY, -6), TODAY)).toBe('sleepy');
    expect(moodFor(addDays(TODAY, -7), TODAY)).toBe('resting');
    expect(moodFor(addDays(TODAY, -400), TODAY)).toBe('resting');
  });

  it('is content, not resting, before anything has ever been logged', () => {
    expect(moodFor(null, TODAY)).toBe('content');
  });

  it('never puts a number in mood copy', () => {
    // A figure next to a mood would read as a judgement about amounts spent.
    for (const mood of ['happy', 'content', 'sleepy', 'resting'] as const) {
      expect(moodCopy(mood, 'Pip')).not.toMatch(/\d/);
      expect(moodCopy(mood, 'Pip')).toContain('Pip');
    }
  });
});

describe('evolutionStage', () => {
  it('changes look only at the levels SPEC 6.2 lists', () => {
    expect(evolutionStage(1)).toBe(1);
    expect(evolutionStage(4)).toBe(1);
    expect(evolutionStage(5)).toBe(2);
    expect(evolutionStage(9)).toBe(2);
    expect(evolutionStage(10)).toBe(3);
    expect(evolutionStage(19)).toBe(3);
    expect(evolutionStage(20)).toBe(4);
    expect(evolutionStage(34)).toBe(4);
    expect(evolutionStage(35)).toBe(5);
    expect(evolutionStage(99)).toBe(5);
  });

  it('clamps a nonsense level instead of returning stage zero', () => {
    expect(evolutionStage(0)).toBe(1);
    expect(evolutionStage(-5)).toBe(1);
  });
});

describe('species', () => {
  it('offers original starters, each with an art key the UI can draw', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(3);
    for (const species of SPECIES) {
      expect(species.key).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(species.name.length).toBeGreaterThan(0);
      expect(species.build.length).toBeGreaterThan(0);
    }
    expect(new Set(SPECIES.map((s) => s.key)).size).toBe(SPECIES.length);
  });
});
