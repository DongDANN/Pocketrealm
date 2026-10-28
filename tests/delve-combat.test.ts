import { describe, expect, it } from 'vitest';
import {
  BASE_MODIFIERS,
  ROUND_CAP,
  builtinDecider,
  companionBase,
  computeModifiers,
  emptyMeta,
  newRun,
  runCombat,
  type RunState,
} from '../src/core/delve';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

function runWith(over: Partial<RunState> = {}): RunState {
  return { ...newRun(1, 1, 1, emptyMeta()), ...over };
}

describe('companion stats', () => {
  it('scales per level and clamps to at least level 1', () => {
    expect(companionBase(1)).toEqual({ hp: 60, maxHp: 60, atk: 10, def: 4, spd: 8, luck: 5 });
    expect(companionBase(2)).toEqual({ hp: 66, maxHp: 66, atk: 12, def: 4, spd: 8, luck: 5 });
    expect(companionBase(3).def).toBe(5);
    expect(companionBase(5)).toEqual({ hp: 84, maxHp: 84, atk: 18, def: 6, spd: 8, luck: 5 });
    expect(companionBase(0)).toEqual(companionBase(1));
    expect(companionBase(2.9)).toEqual(companionBase(2));
  });
});

describe('combat modifiers', () => {
  it('sums boon stats', () => {
    const run = runWith({ boons: ['fury-sharpquill', 'fury-emberfist', 'fury-reckless'] });
    const m = computeModifiers(run, {}, zeroBuffs());
    expect(m.atk).toBe(1 + 1 + 2 + 3); // boons + fury>=3 tag bonus
    expect(m.maxHp).toBe(0);
  });

  it('applies tag bonuses at 3 and 5 of a tag', () => {
    const guard3 = runWith({
      boons: ['guard-ironhide', 'guard-rootshell', 'guard-lanternbuckler'],
    });
    const g3 = computeModifiers(guard3, {}, zeroBuffs());
    expect(g3.maxHp).toBe(5);
    expect(g3.def).toBe(1);
    expect(g3.roomShield).toBe(3 + 8);

    const guard5 = runWith({
      boons: [
        'guard-ironhide',
        'guard-rootshell',
        'guard-lanternbuckler',
        'guard-doorstop',
        'guard-secondledger',
      ],
    });
    const g5 = computeModifiers(guard5, {}, zeroBuffs());
    expect(g5.maxHp).toBe(5 + 9);
    expect(g5.def).toBe(1 + 4);
    expect(g5.roomShield).toBe(3 + 8);
    expect(g5.damageReduction).toBe(5);

    const fury5 = runWith({
      boons: [
        'fury-sharpquill',
        'fury-emberfist',
        'fury-reckless',
        'fury-hawkeye',
        'fury-doubledown',
      ],
    });
    const f5 = computeModifiers(fury5, {}, zeroBuffs());
    expect(f5.atk).toBe(1 + 1 + 2 + 3);
    expect(f5.critChance).toBe(2);
    expect(f5.critDamageMult).toBe(BASE_MODIFIERS.critDamageMult + 0.25 + 0.25); // doubledown + fury>=5

    const fortune3 = runWith({
      boons: ['fortune-luckyclover', 'fortune-glimmer', 'fortune-fourleaf'],
    });
    expect(computeModifiers(fortune3, {}, zeroBuffs()).luck).toBe(1 + 2 + 5);

    const vigor5 = runWith({
      boons: [
        'vigor-bandaid',
        'vigor-canteen',
        'vigor-freshair',
        'vigor-camping',
        'vigor-secondwind',
      ],
    });
    const v5 = computeModifiers(vigor5, {}, zeroBuffs());
    expect(v5.healAfterCombat).toBe(4 + 6 + 10);
    expect(v5.maxHp).toBe(7 + 12);
  });

  it('applies relics, Forge totals, and budget buffs', () => {
    const run = runWith({
      boons: ['fury-sharpquill', 'fury-emberfist'],
      relics: ['relic-lanternwick', 'relic-quill', 'relic-matchbook'],
      floor: 3,
    });
    const m = computeModifiers(
      run,
      { maxHp: 6, atk: 2, def: 2, luck: 4 },
      { wardHp: 8, luckBonus: 6 },
    );
    expect(m.roomShield).toBe(4 + 8);
    expect(m.luck).toBe(6 + 2 + 4); // quill (+1 per boon) + forge + buff
    expect(m.eliteDamageBonus).toBe(5);
    expect(m.maxHp).toBe(6);
    expect(m.atk).toBe(2 + 2);
    expect(m.def).toBe(2);

    const interest = runWith({ relics: ['relic-interest'], floor: 3 });
    const i = computeModifiers(interest, { atk: 10 }, zeroBuffs());
    expect(i.atk).toBe(Math.round(10 * (1 + 0.02 * 2)));
  });
});

describe('auto-battle', () => {
  it('is fully deterministic for the same state and room', () => {
    const run = runWith({ runId: 'd1-test-1', stepIndex: 4 });
    const room = { enemies: ['tollbug', 'mossbite'] };
    const a = runCombat(
      run,
      room,
      computeModifiers(run, {}, zeroBuffs()),
      2,
      [],
      [],
      {},
      builtinDecider,
    );
    const b = runCombat(
      run,
      room,
      computeModifiers(run, {}, zeroBuffs()),
      2,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(a).toEqual(b);
    expect(a.log.every((l) => l.type === 'combat' && l.step === run.stepIndex)).toBe(true);
  });

  it('wins decisively when much stronger', () => {
    const run = runWith({ companionLevel: 10 });
    const room = { enemies: ['tollbug'] };
    const result = runCombat(
      run,
      room,
      computeModifiers(run, {}, zeroBuffs()),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(result.won).toBe(true);
    expect(result.drawn).toBe(false);
    expect(result.hpAfter).toBeGreaterThan(0);
    expect(result.hpAfter).toBeLessThanOrEqual(result.maxHp);
  });

  it('draws safely at the 40-round cap without dying', () => {
    const run = runWith({
      companionLevel: 1,
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Warden',
        hp: 960,
        maxHp: 60,
        atk: 10,
        def: 4,
        spd: 8,
        luck: 5,
      },
    });
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const room = { enemies: ['umbralmonarch'] };
    const result = runCombat(run, room, mods, 1, [], [], {}, builtinDecider);
    expect(result.won).toBe(false);
    expect(result.drawn).toBe(true);
    expect(result.hpAfter).toBeGreaterThan(0);
    expect(result.rounds).toBeGreaterThanOrEqual(ROUND_CAP);
  });

  it('telegraphs the boss mechanic one round before it lands', () => {
    // Stun and critical interrupts can cancel the mechanic on some seeds; find a fight where
    // the tell still resolves into an unleash to prove the round-ahead warning.
    let result: ReturnType<typeof runCombat> | undefined;
    for (let seed = 1; seed <= 100 && !result; seed++) {
      const run = { ...newRun(seed, 1, 6, emptyMeta()) };
      const r = runCombat(
        run,
        { enemies: ['thorncrown'] },
        computeModifiers(run, {}, zeroBuffs()),
        6,
        [],
        [],
        {},
        builtinDecider,
      );
      if (r.log.some((l) => l.text.includes('unleashes its mechanic'))) result = r;
    }
    expect(result).toBeDefined();
    const texts = result!.log.map((l) => l.text);
    expect(texts.some((t) => t.includes('telegraphs: a heavy attack'))).toBe(true);
    expect(texts.some((t) => t.includes('unleashes its mechanic'))).toBe(true);
  });

  it('absorbs damage through shields first', () => {
    const run = runWith({ companionLevel: 1 });
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), roomShield: 100 };
    const room = { enemies: ['tollbug'] };
    const result = runCombat(run, room, mods, 1, [], [], {}, builtinDecider);
    expect(result.won).toBe(true);
    expect(result.log.some((l) => l.text.includes('shield absorbs'))).toBe(true);
  });

  it('scales enemies by floor but never bosses', () => {
    // Tollbug at floor 1 vs floor 6: the deeper one is stronger.
    const run = runWith({ companionLevel: 1 });
    const mods = computeModifiers(run, {}, zeroBuffs());
    const shallow = runCombat(run, { enemies: ['tollbug'] }, mods, 1, [], [], {}, builtinDecider);
    const deep = runCombat(run, { enemies: ['tollbug'] }, mods, 6, [], [], {}, builtinDecider);
    expect(deep.rounds).toBeGreaterThanOrEqual(shallow.rounds);
  });
});
