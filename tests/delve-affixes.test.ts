import { describe, expect, it } from 'vitest';
import {
  AFFIXES,
  affixById,
  builtinDecider,
  computeModifiers,
  emptyMeta,
  generateFloor,
  newRun,
  runCombat,
  type CombatResult,
  type RunState,
} from '../src/core/delve';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

function runWith(over: Partial<RunState> = {}): RunState {
  return { ...newRun(1, 1, 1, emptyMeta()), ...over };
}

function firstHitDamage(r: CombatResult): number {
  return Number(r.log.find((l) => /^You hit/.test(l.text))!.text.match(/for (\d+)/)![1]);
}

describe('Affix data', () => {
  it('ships 8 affixes with unique ids, names, and effects', () => {
    expect(AFFIXES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(AFFIXES.map((a) => a.id)).size).toBe(AFFIXES.length);
    for (const a of AFFIXES) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.effect.length).toBeGreaterThan(0);
      expect(affixById(a.id)?.id).toBe(a.id);
    }
  });
});

describe('affix placement', () => {
  it('keeps floors 1-3 clean and caps ordinary affixes after floor 3', () => {
    for (const floor of [1, 2, 3]) {
      const plan = generateFloor(7, 1, floor);
      for (const row of plan.rows) {
        for (const room of row) expect(room.affixes ?? []).toEqual([]);
      }
    }
    for (const floor of [4, 5]) {
      const plan = generateFloor(7, 1, floor);
      for (const row of plan.rows) {
        for (const room of row) {
          if (room.kind === 'skirmish') {
            expect((room.affixes ?? []).length).toBeLessThanOrEqual(1);
          }
          if (room.kind === 'elite') {
            expect((room.affixes ?? []).length).toBeGreaterThanOrEqual(1);
            expect((room.affixes ?? []).length).toBeLessThanOrEqual(2);
          }
        }
      }
    }
  });

  it('gives elites up to two affixes in the floor plan, deterministically', () => {
    let found = false;
    for (let seed = 1; seed <= 80 && !found; seed++) {
      for (const floor of [4, 5]) {
        const plan = generateFloor(seed, 1, floor);
        const elite = plan.rows.flat().find((r) => r.kind === 'elite');
        if (elite) {
          found = true;
          expect(elite.affixes!.length).toBeGreaterThanOrEqual(1);
          expect(elite.affixes!.length).toBeLessThanOrEqual(2);
          expect(generateFloor(seed, 1, floor)).toEqual(plan);
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('never affixes the boss room', () => {
    const plan = generateFloor(7, 1, 6);
    const boss = plan.rows.flat().find((r) => r.kind === 'boss')!;
    expect(boss.affixes ?? []).toEqual([]);
  });
});

describe('affixes in combat', () => {
  const mods = () => computeModifiers(runWith({}), {}, zeroBuffs());

  it('armored enemies take less damage per hit', () => {
    const plain = runCombat(
      runWith({}),
      { enemies: ['tollbug'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    const armored = runCombat(
      runWith({}),
      { enemies: ['tollbug'], affixes: ['armored'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(firstHitDamage(armored)).toBeLessThan(firstHitDamage(plain));
  });

  it('warded enemies start shielded and absorb the first hits', () => {
    const r = runCombat(
      runWith({}),
      { enemies: ['tollbug'], affixes: ['warded'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(r.log.some((l) => l.text.includes("'s shield absorbs"))).toBe(true);
  });

  it('swift enemies act before the companion', () => {
    const plain = runCombat(
      runWith({}),
      { enemies: ['mossbite'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    const swift = runCombat(
      runWith({}),
      { enemies: ['mossbite'], affixes: ['swift'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    const firstAction = (r: CombatResult) =>
      r.log.find((l) => /^(You|Mossbite)/.test(l.text))!.text;
    expect(firstAction(plain)).toMatch(/^You/);
    expect(firstAction(swift)).toMatch(/^Mossbite/);
  });

  it('vampiric enemies heal from the damage they deal', () => {
    const r = runCombat(
      runWith({}),
      { enemies: ['tollbug'], affixes: ['vampiric'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(r.log.some((l) => l.text.includes('drains'))).toBe(true);
  });

  it('enraged enemies hit harder below 30% HP', () => {
    const r = runCombat(
      runWith({}),
      { enemies: ['tollbug'], affixes: ['enraged'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    const hits = r.log
      .filter((l) => /^Tollbug hits/.test(l.text))
      .map((l) => Number(l.text.match(/for (\d+)/)![1]));
    expect(Math.max(...hits)).toBeGreaterThanOrEqual(6);
  });

  it('thorned enemies cut the attacker', () => {
    const r = runCombat(
      runWith({}),
      { enemies: ['tollbug'], affixes: ['thorned'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(r.log.some((l) => l.text.includes('thorns cut you'))).toBe(true);
  });

  it('splitting enemies spawn a half-HP copy when killed', () => {
    const run = { ...newRun(1, 1, 6, emptyMeta()) };
    const r = runCombat(
      run,
      { enemies: ['tollbug'], affixes: ['splitting'] },
      computeModifiers(run, {}, zeroBuffs()),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(r.won).toBe(true);
    expect(r.log.some((l) => l.text.includes('splits into'))).toBe(true);
    expect(r.log.filter((l) => l.text.includes('falls.')).length).toBe(2);
  });

  it('frenzied enemies strike twice per round', () => {
    const plain = runCombat(
      runWith({}),
      { enemies: ['mossbite'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    const frenzied = runCombat(
      runWith({}),
      { enemies: ['mossbite'], affixes: ['frenzied'] },
      mods(),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(plain.log.some((l) => l.text.includes('strikes again'))).toBe(false);
    expect(frenzied.log.some((l) => l.text.includes('strikes again'))).toBe(true);
  });
});
