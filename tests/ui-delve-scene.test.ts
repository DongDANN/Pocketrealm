import { describe, expect, it } from 'vitest';
import type { RunState } from '../src/core/delve';
import { encounterOf, sceneActionFor } from '../src/ui/lib/delveScene';
import { singleRowRun } from './delve-helpers';

const withHp = (run: RunState, hp: number): RunState => ({ ...run, unit: { ...run.unit, hp } });

describe('delve scene beats', () => {
  it('plays nothing when there is no before or no after to compare', () => {
    const run = singleRowRun('skirmish');
    expect(sceneActionFor(null, run, 1)).toBeNull();
    expect(sceneActionFor(run, null, 1)).toBeNull();
    expect(sceneActionFor(null, null, 1)).toBeNull();
  });

  it('reads a step that changed nothing as the swing that made it', () => {
    const before = singleRowRun('skirmish');
    const after = { ...before, stepIndex: before.stepIndex + 1 };
    expect(sceneActionFor(before, after, 4)).toEqual({
      kind: 'playerAttack',
      token: 4,
      heavy: false,
    });
  });

  it('separates a graze from a heavy blow and calls the difference by max HP', () => {
    const before = singleRowRun('skirmish');
    const graze = withHp(before, before.unit.hp - 1);
    const crushed = withHp(before, before.unit.hp - before.unit.maxHp * 0.5);
    expect(sceneActionFor(before, graze, 1)).toEqual({
      kind: 'playerHurt',
      token: 1,
      heavy: false,
    });
    expect(sceneActionFor(before, crushed, 2)?.heavy).toBe(true);
  });

  it('ranks a faint above the blow that caused it', () => {
    const before = withHp(singleRowRun('skirmish'), 12);
    expect(sceneActionFor(before, withHp(before, 0), 3)?.kind).toBe('playerFaint');
  });

  it('shows HP going up as a heal, not as a hit', () => {
    const hurt = withHp(singleRowRun('skirmish'), 20);
    const whole = withHp(hurt, hurt.unit.maxHp);
    expect(sceneActionFor(hurt, whole, 1)?.kind).toBe('heal');
  });

  it('calls a cleared room the death of the enemy rather than another swing', () => {
    const before = singleRowRun('skirmish');
    const cleared: RunState = { ...before, result: 'cleared' };
    const beat = sceneActionFor(before, cleared, 2);
    expect(beat?.kind).toBe('enemyFaint');
    expect(beat?.heavy).toBe(true);
  });

  it('treats taking a row or a floor as the same faint beat', () => {
    const before = singleRowRun('skirmish');
    expect(sceneActionFor(before, { ...before, row: before.row + 1 }, 1)?.kind).toBe('enemyFaint');
    expect(sceneActionFor(before, { ...before, floor: before.floor + 1 }, 2)?.kind).toBe(
      'enemyFaint',
    );
  });

  it('names loot after a faint, so a clear does not read as two deaths', () => {
    const before = singleRowRun('skirmish');
    const richer: RunState = { ...before, result: 'cleared', glint: before.glint + 10 };
    expect(sceneActionFor(before, richer, 1)?.kind).toBe('enemyFaint');
    const boonOnly: RunState = { ...before, glint: before.glint + 10 };
    expect(sceneActionFor(before, boonOnly, 2)?.kind).toBe('loot');
  });

  it('reports the enemy standing in the room the run is in', () => {
    const fight = singleRowRun('skirmish');
    expect(encounterOf(fight)).toMatchObject({ enemyId: 'tollbug', boss: false, elite: false });
    expect(encounterOf(singleRowRun('boss'))).toMatchObject({ enemyId: null, boss: true });
    expect(encounterOf(singleRowRun('elite'))).toMatchObject({ enemyId: null, elite: true });
  });

  it('carries the room affixes so the scene can mark an altered fight', () => {
    const run = singleRowRun('skirmish');
    const marked: RunState = {
      ...run,
      floorPlan: {
        ...run.floorPlan,
        rows: [[{ ...run.floorPlan.rows[0]![0]!, affixes: ['frenzy'] }]],
      },
    };
    expect(encounterOf(marked).affixes).toEqual(['frenzy']);
    expect(encounterOf(run).affixes).toEqual([]);
  });
});
