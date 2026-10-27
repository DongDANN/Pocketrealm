/**
 * Gate 7a — the itemized damage sum.
 *
 * The complaint about the Delve is that a room resolves, a number moves, and nothing says how. These
 * tests pin the one function that answers that: it takes the inputs the combat engine already holds,
 * applies them in the order the engine applies them (including where it rounds), and returns both the
 * answer and the arithmetic that produced it. Because combat resolves through this same function, the
 * sum a panel shows cannot drift from the hit that lands.
 */

import { describe, expect, it } from 'vitest';
import {
  attackBreakdown,
  attackRange,
  computeModifiers,
  damageSumText,
  emptyMeta,
  hitOf,
  incomingBreakdown,
  newRun,
  runCombat,
  type AttackInput,
  type HitRecord,
  type IncomingInput,
  type RunLogEntry,
  type RunState,
} from '../src/core/delve';

function attack(over: Partial<AttackInput> = {}) {
  return attackBreakdown({
    atk: 10,
    power: 1,
    def: 0,
    variance: 0,
    crit: false,
    critMult: 1.5,
    burningBonus: 0,
    targetBurning: false,
    markMult: 1,
    elementMult: 1,
    masteryLvl: 0,
    eliteBonus: 0,
    targetElite: false,
    shield: 0,
    hp: 999,
    ...over,
  });
}

const labels = (b: ReturnType<typeof attackBreakdown>): string[] => b.terms.map((t) => t.label);

describe('attackBreakdown', () => {
  it('shows only the factors that changed the number', () => {
    const b = attack({ atk: 10, def: 2 });
    expect(labels(b)).toEqual(['ATK', 'DEF']);
    expect(b.damage).toBe(8);
    expect(b.dealt).toBe(8);
  });

  it('applies skill power to ATK before DEF', () => {
    const b = attack({ atk: 10, power: 1.5, def: 2, variance: 1 });
    expect(labels(b)).toEqual(['ATK', 'Power', 'Variance', 'DEF']);
    expect(b.raw).toBe(14);
    expect(b.damage).toBe(14);
  });

  it('takes the larger of the crit and the normal hit', () => {
    const b = attack({ atk: 10, power: 1.5, def: 2, variance: 1, crit: true, critMult: 1.5 });
    expect(b.raw).toBe(21);
    expect(labels(b)).toContain('Critical');
  });

  it('multiplies mark and element as one rounding, not two', () => {
    // 11 × 1.25 × 1.25 = 17.1875 → 17. Rounding per factor would have said 14, then 18.
    const b = attack({ atk: 13, def: 2, markMult: 1.25, elementMult: 1.25 });
    expect(b.raw).toBe(11);
    expect(b.damage).toBe(17);
  });

  it('applies the burning bonus before mark and element', () => {
    // 13 − 3 = 10, ×1.4 = 14, ×1.25 = 17.5 → 18.
    const b = attack({
      atk: 10,
      power: 1.3,
      def: 3,
      burningBonus: 0.4,
      targetBurning: true,
      markMult: 1.25,
    });
    expect(labels(b)).toEqual(['ATK', 'Power', 'DEF', 'Burning', 'Mark']);
    expect(b.damage).toBe(18);
  });

  it('ignores the burning bonus when the target is not burning', () => {
    const b = attack({ atk: 10, power: 1.3, def: 3, burningBonus: 0.4, targetBurning: false });
    expect(labels(b)).toEqual(['ATK', 'Power', 'DEF']);
    expect(b.damage).toBe(10);
  });

  it('stacks mastery then the elite bonus, each rounded', () => {
    // 17 → mastery 5 (+5%) = 17.85 → 18 → elite +5% = 18.9 → 19.
    const b = attack({ atk: 19, def: 2, masteryLvl: 5, eliteBonus: 5, targetElite: true });
    expect(b.raw).toBe(17);
    expect(labels(b)).toEqual(['ATK', 'DEF', 'Mastery', 'Elite']);
    expect(b.damage).toBe(19);
  });

  it('lets the target shield absorb the front of the hit', () => {
    const b = attack({ atk: 14, def: 2, shield: 8, hp: 22 });
    expect(b.damage).toBe(12);
    expect(b.absorbed).toBe(8);
    expect(b.dealt).toBe(4);
    expect(b.hpAfter).toBe(18);
    expect(labels(b)).toEqual(['ATK', 'DEF', 'Shield']);
  });

  it('says so when the minimum of 1 is all that is left', () => {
    const b = attack({ atk: 3, def: 10 });
    expect(b.damage).toBe(1);
    expect(b.clamped).toBe(true);
    expect(labels(b)).toEqual(['ATK', 'DEF', 'Minimum']);
  });

  it('never reports HP below zero', () => {
    const b = attack({ atk: 40, def: 2, hp: 12 });
    expect(b.dealt).toBe(38);
    expect(b.hpAfter).toBe(0);
  });
});

describe('incomingBreakdown', () => {
  it('reduces a plain strike by the companion DEF and then by damage reduction', () => {
    const b = incomingBreakdown({
      atk: 9,
      def: 6,
      variance: 0,
      damageReduction: 10,
      shield: 0,
      hp: 40,
    });
    expect(b.raw).toBe(3);
    expect(b.damage).toBe(3);
    expect(b.dealt).toBe(3);
    expect(b.hpAfter).toBe(37);
  });

  it('lets the companion shield soak what it can', () => {
    const b = incomingBreakdown({
      atk: 9,
      def: 6,
      variance: 0,
      damageReduction: 0,
      shield: 6,
      hp: 40,
    });
    expect(b.absorbed).toBe(3);
    expect(b.dealt).toBe(0);
    expect(b.hpAfter).toBe(40);
  });

  it('resolves a boss mechanic with its flat +2 and guard halving before reduction', () => {
    // round(9 × 1.3) = 12, +2 = 14, −6 = 8, guard → 4, 5% reduction → round(3.8) = 4, shield 2 → 2.
    const b = incomingBreakdown({
      atk: 9,
      def: 6,
      variance: 0,
      damageReduction: 5,
      shield: 2,
      hp: 40,
      mechanic: { multiplier: 1.3, guard: true },
    });
    expect(b.raw).toBe(8);
    expect(b.damage).toBe(4);
    expect(b.dealt).toBe(2);
    expect(labels(b)).toEqual([
      'ATK',
      'Mechanic',
      'Telegraph',
      'DEF',
      'Guard',
      'Reduction',
      'Shield',
    ]);
  });

  it('draws no variance and no crit on a mechanic', () => {
    const b = incomingBreakdown({
      atk: 9,
      def: 6,
      variance: 1,
      damageReduction: 0,
      shield: 0,
      hp: 40,
      mechanic: { multiplier: 1, guard: false },
    });
    expect(b.raw).toBe(5);
    expect(b.crit).toBe(false);
    expect(labels(b)).not.toContain('Variance');
  });
});

describe('attackRange', () => {
  it('brackets every roll the engine can produce', () => {
    const over = { atk: 12, def: 4, critMult: 1.75, markMult: 1.25 };
    const { min, max } = attackRange(over);
    for (const variance of [-1, 0, 1]) {
      for (const crit of [false, true]) {
        const dealt = attack({ ...over, variance, crit }).dealt;
        expect(dealt).toBeGreaterThanOrEqual(min);
        expect(dealt).toBeLessThanOrEqual(max);
      }
    }
  });

  it('shifts with a target shield without changing its spread', () => {
    const bare = attackRange({ atk: 20, def: 3 });
    const warded = attackRange({ atk: 20, def: 3, shield: 6 });
    expect(bare.min - warded.min).toBe(6);
    expect(bare.max - warded.max).toBe(6);
  });
});

describe('damageSumText', () => {
  it('reads as one arithmetic line', () => {
    const b = attack({ atk: 13, def: 2, markMult: 1.25, elementMult: 1.25 });
    expect(damageSumText(b)).toBe('ATK 13 −2 DEF ×1.25 Mark ×1.25 Weakness = 17');
  });

  it('names resistance when the element is resisted', () => {
    const b = attack({ atk: 13, def: 2, elementMult: 0.75 });
    expect(damageSumText(b)).toBe('ATK 13 −2 DEF ×0.75 Resist = 8');
  });

  it('shows the crit and the shield the hit was cut by', () => {
    const b = attack({ atk: 10, power: 1.5, def: 2, variance: 1, crit: true, shield: 4 });
    expect(damageSumText(b)).toBe(
      'ATK 10 ×1.5 Power +1 Variance −2 DEF ×1.5 Critical −4 Shield = 17',
    );
  });
});

/** The itemized records on a combat log, with the non-hit lines dropped. */
function hits(log: RunLogEntry[], side?: HitRecord['side']): HitRecord[] {
  return log
    .map(hitOf)
    .filter((h): h is HitRecord => h !== null)
    .filter((h) => side === undefined || h.side === side);
}

describe('the engine resolves through the same sum the panel shows', () => {
  function fight(over: Partial<RunState> = {}) {
    const run: RunState = { ...newRun(1, 1, 1, emptyMeta()), ...over };
    const mods = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
    return { run, res: runCombat(run, { enemies: ['tollbug'] }, mods, 1) };
  }

  it('records a sum for every hit that lands', () => {
    const { res } = fight();
    const all = hits(res.log);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((h) => h.side === 'player')).toBe(true);
    expect(all.some((h) => h.side === 'enemy')).toBe(true);
    expect(res.won).toBe(true);
  });

  it('re-derives every logged hit from its own recorded inputs', () => {
    const { res } = fight();
    for (const h of hits(res.log)) {
      const again =
        h.side === 'player'
          ? attackBreakdown(h.input as AttackInput)
          : incomingBreakdown(h.input as IncomingInput);
      expect(again, `${h.side} hit in round ${h.round}`).toEqual(h.sum);
    }
  });

  it('adds up to the HP the companion actually lost', () => {
    const { run, res } = fight();
    const lost = hits(res.log, 'enemy').reduce((total, h) => total + h.sum.dealt, 0);
    expect(run.unit.hp - lost).toBe(res.hpAfter);
  });

  it('kills the enemy with exactly the damage it recorded', () => {
    const { res } = fight();
    const won = hits(res.log, 'player');
    const dealt = won.reduce((total, h) => total + h.sum.dealt, 0);
    expect(dealt).toBeGreaterThanOrEqual(25);
    const last = won[won.length - 1]!;
    expect(dealt - last.sum.dealt).toBeLessThan(25);
  });

  it('writes the sum into the log line so the text version says the same thing', () => {
    const { res } = fight();
    const lines = res.log.filter((l) => hitOf(l) !== null);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const n = l.text.match(/for (\d+)/);
      expect(n, l.text).not.toBeNull();
      expect(l.text.trimEnd().endsWith(`= ${n![1]})`), l.text).toBe(true);
    }
  });
});
