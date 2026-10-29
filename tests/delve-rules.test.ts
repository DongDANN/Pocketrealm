import { describe, expect, it } from 'vitest';
import {
  BOSS_RULES,
  BOSS_RULE_AFFIX,
  FLOOR_RULES,
  boonAllowed,
  critMultiplier,
  dropMultiplier,
  elementsInverted,
  enemyStatShift,
  floorRuleById,
  floorRuleFor,
  guardReflect,
  leaderGuarded,
  markRounds,
  nextFloorRuleId,
  restHealPercent,
  shopPriceMultiplier,
  skillEnergyCost,
} from '../src/core/delve';
import type { BoonEffect } from '../src/core/delve/data/boons';
import type { HollowId } from '../src/core/delve/types';

const STREAM: HollowId[] = [1, 2, 3];

/** A wide sample of the draws a real run can see. */
function sampleRules(): Set<string> {
  const seen = new Set<string>();
  for (const hollow of STREAM) {
    for (let seed = 1; seed <= 40; seed++) {
      for (let floor = 1; floor <= 10; floor++) seen.add(floorRuleFor(seed, hollow, floor));
    }
  }
  return seen;
}

describe('floor rule table', () => {
  it('holds the ten rules §8 E.1 names, with unique ids and readable copy', () => {
    expect(FLOOR_RULES).toHaveLength(10);
    expect(new Set(FLOOR_RULES.map((rule) => rule.id)).size).toBe(10);
    for (const rule of FLOOR_RULES) {
      expect(rule.label.length).toBeGreaterThan(0);
      expect(rule.detail.length).toBeGreaterThan(0);
      expect(floorRuleById(rule.id)).toBe(rule);
    }
  });

  it('can draw every rule on some floor of some run', () => {
    expect(sampleRules().size).toBe(FLOOR_RULES.length);
  });

  it('is deterministic per seed, hollow and floor', () => {
    expect(floorRuleFor(12345, 1, 3)).toBe(floorRuleFor(12345, 1, 3));
    expect(floorRuleFor(12345, 1, 3)).not.toBe(floorRuleFor(12345, 1, 4));
  });

  it('prints no next-floor rule past the Hollow’s last floor', () => {
    expect(nextFloorRuleId(1, 3, 9)).toBe(floorRuleFor(1, 3, 10));
    expect(nextFloorRuleId(1, 3, 10)).toBeNull();
    expect(nextFloorRuleId(1, 1, 6)).toBeNull();
  });
});

describe('floor rule helpers', () => {
  it('makes every skill cost 2 energy', () => {
    expect(skillEnergyCost('skills-cost-two', { energyCost: 1 })).toBe(2);
    expect(skillEnergyCost('skills-cost-two', { energyCost: 3 })).toBe(2);
    expect(skillEnergyCost('skills-cost-two', {})).toBe(2);
    expect(skillEnergyCost(null, { energyCost: 3 })).toBe(3);
    expect(skillEnergyCost(null, {})).toBe(1);
  });

  it('stops Rest rooms healing', () => {
    expect(restHealPercent('no-rest-heal', 55)).toBe(0);
    expect(restHealPercent(null, 55)).toBe(55);
  });

  it('doubles shop prices and drops', () => {
    expect(shopPriceMultiplier('market-flip')).toBe(2);
    expect(dropMultiplier('market-flip')).toBe(2);
    expect(shopPriceMultiplier(null)).toBe(1);
    expect(dropMultiplier(null)).toBe(1);
  });

  it('keeps Ward boons out of the offer and leaves every other boon alone', () => {
    const ward: { fx: BoonEffect } = { fx: { kind: 'roomShield', amount: 3 } };
    const other: { fx: BoonEffect } = { fx: { kind: 'stat', stat: 'atk', add: 1 } };
    expect(boonAllowed('no-ward-boons', ward)).toBe(false);
    expect(boonAllowed('no-ward-boons', other)).toBe(true);
    expect(boonAllowed(null, ward)).toBe(true);
  });

  it('clamps Mark to one round', () => {
    expect(markRounds('mark-one-round', 2)).toBe(1);
    expect(markRounds('mark-one-round', 4)).toBe(1);
    expect(markRounds(null, 2)).toBe(2);
  });

  it('shifts enemies swift and weak', () => {
    expect(enemyStatShift('swift-weak')).toEqual({ atk: -2, spd: 4 });
    expect(enemyStatShift(null)).toEqual({ atk: 0, spd: 0 });
  });

  it('removes the crit multiplier', () => {
    expect(critMultiplier('crits-heal', 1.5)).toBe(1);
    expect(critMultiplier(null, 1.5)).toBe(1.5);
  });

  it('reflects a quarter of a braced blow', () => {
    expect(guardReflect('guard-reflects', 8)).toBe(2);
    expect(guardReflect('guard-reflects', 1)).toBe(1);
    expect(guardReflect('guard-reflects', 0)).toBe(0);
    expect(guardReflect(null, 8)).toBe(0);
  });

  it('guards the leader and inverts elements only under their own rule', () => {
    expect(leaderGuarded('leader-guarded')).toBe(true);
    expect(leaderGuarded(null)).toBe(false);
    expect(elementsInverted('elements-invert')).toBe(true);
    expect(elementsInverted(null)).toBe(false);
  });
});

describe('boss rule vocabulary', () => {
  it('gives every rule a label, a detail, and an engine home', () => {
    for (const id of Object.keys(BOSS_RULES) as (keyof typeof BOSS_RULES)[]) {
      expect(BOSS_RULES[id].label.length).toBeGreaterThan(0);
      expect(BOSS_RULES[id].detail.length).toBeGreaterThan(0);
    }
    expect(BOSS_RULE_AFFIX['strikes-twice']).toBe('frenzied');
    expect(BOSS_RULE_AFFIX.drains).toBe('vampiric');
    expect(BOSS_RULE_AFFIX.thorns).toBe('thorned');
  });
});
