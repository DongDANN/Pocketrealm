/**
 * Gate 1.6e — the four consumables fire inside real combats: Fire Oil burns the first fight,
 * Shield Charm shields the first fight, Healing Draught rescues at low HP once, and Smoke Scroll
 * turns one killing blow (outside boss rooms) into a 1-HP escape. Each triggers at most once
 * per run.
 */

import { describe, expect, it } from 'vitest';
import { computeModifiers, emptyMeta, newRun, runCombat, stepRun } from '../src/core/delve';
import type { RunState } from '../src/core/delve';

const BUFFS = { wardHp: 0, luckBonus: 0 };

function runWith(over: Partial<RunState>): RunState {
  const run = newRun(11, 1, 5, emptyMeta());
  return { ...run, ...over };
}

describe('Fire Oil', () => {
  it('burns every enemy in the first fight, once per run', () => {
    const res = runCombat(
      runWith({ consumables: ['fire-oil'] }),
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(res.consumablesUsed['fire-oil']).toBe(true);
    expect(res.log.some((l) => l.text.includes('Fire Oil'))).toBe(true);
    expect(res.log.some((l) => l.text.includes('burns for'))).toBe(true);

    const second = runCombat(
      runWith({ consumables: ['fire-oil'], consumablesUsed: { 'fire-oil': true } }),
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(second.log.some((l) => l.text.includes('Fire Oil'))).toBe(false);
    expect(second.log.some((l) => l.text.includes('burns for'))).toBe(false);
  });
});

describe('Shield Charm', () => {
  it('grants +8 Shield at the start of the first fight only', () => {
    const res = runCombat(
      runWith({ consumables: ['shield-charm'] }),
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(res.consumablesUsed['shield-charm']).toBe(true);
    expect(res.log.some((l) => l.text.includes('Shield Charm: +8 Shield.'))).toBe(true);

    const second = runCombat(
      runWith({ consumables: ['shield-charm'], consumablesUsed: { 'shield-charm': true } }),
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(second.log.some((l) => l.text.includes('Shield Charm'))).toBe(false);
  });
});

describe('Healing Draught', () => {
  it('heals 50% the first time HP drops to 30% or below', () => {
    const lowHp = runWith({ consumables: ['healing-draught'] });
    lowHp.unit = { ...lowHp.unit, hp: 10 };
    const res = runCombat(
      lowHp,
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(res.consumablesUsed['healing-draught']).toBe(true);
    expect(res.log.some((l) => l.text.includes('Healing Draught'))).toBe(true);
    expect(res.hpAfter).toBeGreaterThan(20);
  });

  it('never fires twice in one run', () => {
    const lowHp = runWith({
      consumables: ['healing-draught'],
      consumablesUsed: { 'healing-draught': true },
    });
    lowHp.unit = { ...lowHp.unit, hp: 10 };
    const res = runCombat(
      lowHp,
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      1,
    );
    expect(res.log.some((l) => l.text.includes('Healing Draught'))).toBe(false);
  });
});

describe('Smoke Scroll', () => {
  it('turns a killing blow into a 1-HP escape in ordinary rooms', () => {
    const lowHp = runWith({ consumables: ['smoke-scroll'] });
    lowHp.unit = { ...lowHp.unit, hp: 3 };
    const res = runCombat(
      lowHp,
      { enemies: ['tollbug'] },
      computeModifiers(runWith({}), {}, BUFFS),
      8,
    );
    expect(res.fled).toBe(true);
    expect(res.won).toBe(false);
    expect(res.drawn).toBe(false);
    expect(res.hpAfter).toBe(1);
    expect(res.consumablesUsed['smoke-scroll']).toBe(true);
    expect(res.log.some((l) => l.text.includes('Smoke Scroll'))).toBe(true);
  });

  it('does not trigger in a boss room', () => {
    const lowHp = runWith({ consumables: ['smoke-scroll'] });
    lowHp.unit = { ...lowHp.unit, hp: 3 };
    const res = runCombat(
      lowHp,
      { kind: 'boss', enemies: ['thorncrown'] },
      computeModifiers(runWith({}), {}, BUFFS),
      6,
    );
    expect(res.fled).toBe(false);
    expect(res.won).toBe(false);
    expect(res.hpAfter).toBe(0);
    expect(res.consumablesUsed['smoke-scroll']).toBeUndefined();
  });

  it('keeps the run alive in the engine and marks the scroll used', () => {
    const run = newRun(11, 1, 1, emptyMeta());
    run.consumables = ['smoke-scroll'];
    run.unit = { ...run.unit, hp: 3 };
    const meta = emptyMeta();
    const out = stepRun(run, {
      now: 0,
      oil: 10,
      oilCapacity: 100,
      signals: {
        checkedInToday: false,
        envelopesWithinAllowance: 0,
        contributedToGoalLast7d: false,
        reviewedLast7d: false,
      },
      meta,
      policy: {
        mode: 'autopilot',
        tagPriority: ['guard', 'vigor', 'fury', 'fortune', 'thrift'],
        retreatHpPercent: 0,
        route: 'balanced',
      },
      today: '2026-10-25',
    });
    expect(out.ended).toBe(false);
    expect(out.run.result).toBe('active');
    expect(out.run.consumablesUsed['smoke-scroll']).toBe(true);
    expect(out.run.unit.hp).toBe(1);
    expect(out.run.row).toBe(1);
  });
});
