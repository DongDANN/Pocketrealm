/**
 * Gate 1.6e — Knowledge and mastery: first sightings open codex entries; kills level mastery,
 * which reveals stats, then weakness, then lore, and grants +1% damage per level against that
 * species (capped at +10%). A complete codex unlocks a cosmetic.
 */

import { describe, expect, it } from 'vitest';
import {
  computeModifiers,
  emptyMeta,
  enemyById,
  newRun,
  runCombat,
  stepRun,
  type DelveMeta,
} from '../src/core/delve';
import {
  MAX_MASTERY_LEVEL,
  MASTERY_XP_PER_KILL,
  codexProgress,
  codexReveals,
  codexUnlocks,
  gainMastery,
  masteryDamagePct,
  masteryLevel,
} from '../src/core/delve/mastery';

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), ...over };
}

describe('mastery math', () => {
  it('levels at 10 XP per level and caps at 10', () => {
    expect(MASTERY_XP_PER_KILL).toBe(10);
    expect(MAX_MASTERY_LEVEL).toBe(10);
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(9)).toBe(0);
    expect(masteryLevel(10)).toBe(1);
    expect(masteryLevel(95)).toBe(9);
    expect(masteryLevel(100)).toBe(10);
    expect(masteryLevel(999)).toBe(10);
    expect(masteryDamagePct(0)).toBe(0);
    expect(masteryDamagePct(30)).toBe(3);
    expect(masteryDamagePct(100)).toBe(10);
  });

  it('reveals stats at level 1, weakness at 2, lore at 3', () => {
    expect(codexReveals(0)).toEqual({ stats: false, weakness: false, lore: false });
    expect(codexReveals(10)).toEqual({ stats: true, weakness: false, lore: false });
    expect(codexReveals(20)).toEqual({ stats: true, weakness: true, lore: false });
    expect(codexReveals(30)).toEqual({ stats: true, weakness: true, lore: true });
  });
});

describe('mastery gain', () => {
  it('adds kill XP, applies the Library multiplier, and caps at 100', () => {
    const m = gainMastery(metaWith({}), ['tollbug', 'tollbug'], 1);
    expect(m.mastery['tollbug']).toBe(20);

    const lib = gainMastery(metaWith({}), ['tollbug'], 1.2);
    expect(lib.mastery['tollbug']).toBe(12);

    const capped = gainMastery(metaWith({ mastery: { tollbug: 95 } }), ['tollbug'], 1);
    expect(capped.mastery['tollbug']).toBe(100);
  });

  it('reveals the species weakness once mastery reaches level 2', () => {
    const weak = enemyById('tollbug')!.weakness;
    const before = gainMastery(metaWith({ mastery: { tollbug: 10 } }), ['tollbug'], 1);
    expect(before.mastery['tollbug']).toBe(20);
    expect(before.knownWeaknesses).toContain(weak);
    const never = gainMastery(metaWith({}), ['tollbug'], 1);
    expect(never.knownWeaknesses).not.toContain(weak);
  });
});

describe('codex completion', () => {
  it('tracks sightings against the full bestiary and unlocks a cosmetic when mastered', () => {
    const empty = codexProgress(metaWith({}));
    expect(empty.seen).toBe(0);
    expect(empty.total).toBe(16);
    expect(empty.complete).toBe(false);
    expect(codexUnlocks(metaWith({}))).toEqual([]);

    const sighted = metaWith({ codex: ['tollbug', 'mossbite'] });
    expect(codexProgress(sighted).seen).toBe(2);
    expect(codexProgress(sighted).complete).toBe(false);

    const allIds = [
      'tollbug',
      'mossbite',
      'rootsnarl',
      'sparkmoth',
      'cinderbeetle',
      'emberjaw',
      'smolderhusk',
      'shadewisp',
      'umbraclaw',
      'voidveil',
      'thornheart',
      'cindermaw',
      'veilweaver',
      'thorncrown',
      'ashwrought',
      'umbralmonarch',
    ];
    const mastered = metaWith({
      codex: allIds,
      mastery: Object.fromEntries(allIds.map((id) => [id, 30])),
    });
    const done = codexProgress(mastered);
    expect(done.seen).toBe(16);
    expect(done.complete).toBe(true);
    expect(codexUnlocks(mastered)).toEqual(['codex-sage']);
  });
});

describe('mastery damage bonus in combat', () => {
  it('adds +1% damage per level against the species (same seed, same rolls)', () => {
    const run = newRun(5, 1, 5, emptyMeta());
    const mods = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
    const plain = runCombat(run, { enemies: ['tollbug'] }, mods, 1, [], [], {});
    const studied = runCombat(run, { enemies: ['tollbug'] }, mods, 1, [], [], { tollbug: 30 });
    const firstHit = (log: { text: string }[]): number => {
      for (const l of log) {
        const m = /for (\d+)\./.exec(l.text);
        if (m) return Number(m[1]);
      }
      throw new Error('no hit line found');
    };
    expect(firstHit(studied.log)).toBe(Math.round((firstHit(plain.log) * 103) / 100));
  });

  it('records sightings and kill XP through the engine', () => {
    const meta = emptyMeta();
    const run = newRun(5, 1, 5, meta);
    const enemy = run.floorPlan.rows[0]![0]!.enemies[0]!;
    const out = stepRun(run, {
      now: 0,
      oil: 100,
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
    // One step resolves the first room (autopilot resolves offers inline).
    expect(out.run.roomsVisited.length).toBe(1);
    expect(out.meta.codex).toContain(enemy);
    expect(out.meta.mastery[enemy]).toBe(10);
  });
});
