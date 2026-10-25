import { describe, expect, it } from 'vitest';
import { cuesForRun, musicTrackFor } from '../src/ui/lib/delveSound';
import { singleRowRun } from './delve-helpers';
import type { PendingChoice, RunState } from '../src/core/delve';

const hurt = (run: RunState, hp: number): RunState => ({ ...run, unit: { ...run.unit, hp } });

const choice = (kind: PendingChoice['kind']): PendingChoice => ({
  kind,
  options: [{ id: 'a', label: 'Take it' }],
  reason: 'A fork in the dark.',
  stepIndex: 1,
});

describe('delve sound cues', () => {
  it('names one step for a run that has just started', () => {
    expect(cuesForRun(null, singleRowRun('skirmish'))).toEqual([{ kind: 'sfx', name: 'step' }]);
  });

  it('gives up quietly when there is no run to describe', () => {
    expect(cuesForRun(singleRowRun('skirmish'), null)).toEqual([]);
    expect(cuesForRun(null, null)).toEqual([]);
  });

  it('separates a graze from a heavy blow, and a heal from both', () => {
    const base = singleRowRun('skirmish');
    const light = cuesForRun(base, hurt(base, base.unit.hp - 5));
    const heavy = cuesForRun(base, hurt(base, base.unit.hp - base.unit.maxHp * 0.5));
    const healed = cuesForRun(hurt(base, 20), base);
    expect(light.map((c) => c.kind === 'sfx' && c.name)).toContain('hit');
    expect(heavy.map((c) => c.kind === 'sfx' && c.name)).toContain('hurt');
    expect(healed.map((c) => c.kind === 'sfx' && c.name)).toContain('heal');
  });

  it('sounds an offer of power differently from a fork in the road', () => {
    const base = singleRowRun('skirmish');
    const boon = cuesForRun(base, { ...base, pendingChoice: choice('boon') });
    const fork = cuesForRun(base, { ...base, pendingChoice: choice('fork') });
    expect(boon).toContainEqual({ kind: 'sfx', name: 'loot' });
    expect(fork).toContainEqual({ kind: 'sfx', name: 'menu' });
  });

  it('gives a clear, a faint and a retreat their own voices', () => {
    const base = singleRowRun('skirmish');
    const cleared = cuesForRun(base, { ...base, result: 'cleared' });
    const fainted = cuesForRun(base, { ...base, result: 'fainted', unit: { ...base.unit, hp: 0 } });
    const retreated = cuesForRun(base, { ...base, result: 'retreated' });
    expect(cleared).toContainEqual({ kind: 'sfx', name: 'clear' });
    expect(cleared).toContainEqual({ kind: 'stinger', id: 'questComplete' });
    expect(fainted).toContainEqual({ kind: 'sfx', name: 'faint' });
    expect(retreated).toContainEqual({ kind: 'sfx', name: 'retreat' });
  });

  it('celebrates once: a level, a fusion or a clear, never a chord of them', () => {
    const base = singleRowRun('skirmish');
    const leveled = cuesForRun(base, {
      ...base,
      companionLevel: base.companionLevel + 1,
      result: 'cleared',
      boons: [...base.boons, 'fuse-warchest'],
      unit: { ...base.unit, hp: 1 },
    });
    expect(leveled.filter((cue) => cue.kind === 'stinger')).toHaveLength(1);
    expect(leveled[0]).toEqual({ kind: 'stinger', id: 'levelUp' });
    const fused = cuesForRun(base, { ...base, boons: [...base.boons, 'fuse-warchest'] });
    expect(fused[0]).toEqual({ kind: 'stinger', id: 'fusion' });
  });

  it('never stacks more than three layers on one action', () => {
    const base = singleRowRun('skirmish');
    const after = {
      ...base,
      companionLevel: base.companionLevel + 2,
      result: 'cleared' as const,
      stepIndex: base.stepIndex + 4,
      unit: { ...base.unit, hp: base.unit.hp - 40 },
      boons: [...base.boons, 'fuse-warchest'],
    };
    expect(cuesForRun(base, after).length).toBeLessThanOrEqual(3);
  });
});

describe('delve music', () => {
  it('plays the theme of the Hollow a run is actually in', () => {
    expect(musicTrackFor(null, false)).toBe('camp');
    expect(musicTrackFor(null, true)).toBe('results');
    expect(musicTrackFor(singleRowRun('skirmish'), false)).toBe('hollow1');
    expect(musicTrackFor(singleRowRun('skirmish', { hollowId: 2 }), false)).toBe('hollow2');
    expect(musicTrackFor(singleRowRun('skirmish', { hollowId: 3 }), false)).toBe('hollow3');
  });

  it('switches to the boss while the boss room is the next door', () => {
    expect(musicTrackFor(singleRowRun('boss'), false)).toBe('boss');
  });
});
