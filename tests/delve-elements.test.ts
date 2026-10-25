import { describe, expect, it } from 'vitest';
import { elementMultiplier, ELEMENTS, type Element } from '../src/core/delve/data/elements';
import { STATUSES, statusById } from '../src/core/delve/data/statuses';

describe('elements', () => {
  it('defines the four elements with the same id keys', () => {
    expect(Object.keys(ELEMENTS).sort()).toEqual(['ember', 'frost', 'gale', 'umbra']);
    for (const [id, el] of Object.entries(ELEMENTS)) {
      expect(el.id).toBe(id);
      expect(el.name.length).toBeGreaterThan(0);
    }
  });

  it('applies the ±25% weakness and resistance multipliers', () => {
    expect(elementMultiplier('ember', 'ember', 'frost')).toBe(1.25);
    expect(elementMultiplier('frost', 'ember', 'frost')).toBe(0.75);
    expect(elementMultiplier('gale', 'ember', 'frost')).toBe(1);
    expect(elementMultiplier('umbra', 'frost', 'umbra')).toBe(0.75);
  });

  it('treats unknown weaknesses as neutral, but resistance always applies', () => {
    // Known weakness: 1.25. Unknown: the bonus is withheld (codex gating).
    expect(elementMultiplier('ember', 'ember', 'frost', true)).toBe(1.25);
    expect(elementMultiplier('ember', 'ember', 'frost', false)).toBe(1);
    // Resistance is always active, known or not.
    expect(elementMultiplier('ember', 'frost', 'ember', false)).toBe(0.75);
  });

  it('keeps weakness and resistance distinct per enemy in the bestiary', async () => {
    const { ENEMIES, ELITES, BOSSES } = await import('../src/core/delve/data/enemies');
    for (const e of [...ENEMIES, ...ELITES, ...BOSSES]) {
      const els: Element[] = [e.weakness, e.resistance];
      expect(new Set(els).size).toBe(2);
      for (const el of els) expect(Object.keys(ELEMENTS)).toContain(el);
    }
  });
});

describe('status table', () => {
  it('covers the seven statuses with duration and stacking rules', () => {
    const ids = STATUSES.map((s) => s.id).sort();
    expect(ids).toEqual(['burn', 'chill', 'mark', 'poison', 'regen', 'shield', 'stun']);
    for (const s of STATUSES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(['refresh', 'stack', 'add']).toContain(s.stacking);
      if (s.kind === 'dot' || s.kind === 'hot') {
        expect(s.duration).toBeGreaterThan(0);
        expect(s.perRound).toBeDefined();
      }
      if (s.kind === 'skip') expect(s.duration).toBe(1);
      if (s.kind === 'absorb') expect(s.stacking).toBe('add');
    }
  });

  it('resolves ids and rejects unknown ones', () => {
    expect(statusById('burn')!.id).toBe('burn');
    expect(statusById('nope')).toBeUndefined();
  });
});
