import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  BOSS_RULES,
  builtinDecider,
  computeModifiers,
  emptyMeta,
  newRun,
  runCombat,
  type DelveMeta,
  type RunState,
  type TurnOrder,
  type TurnState,
} from '../src/core/delve';
import { playOne, startRun } from './delve-helpers';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

function runWith(over: Partial<RunState> = {}): RunState {
  return { ...newRun(1, 1, 6, emptyMeta()), ...over };
}

describe('boss phase data', () => {
  it('gives every boss phase thresholds at 66% and 33%', () => {
    for (const b of BOSSES) {
      expect(b.phases).toBeDefined();
      expect(b.phases!.length).toBeGreaterThanOrEqual(2);
      expect(b.phases!.length).toBeLessThanOrEqual(3);
      expect(b.phases![0]!.hpPercent).toBe(66);
      expect(b.phases![1]!.hpPercent).toBe(33);
    }
  });

  it('every phase adds one rule from the shared vocabulary, never a hidden multiplier', () => {
    for (const b of BOSSES) {
      const rules = b.phases!.map((p) => p.rule);
      for (const rule of rules) expect(BOSS_RULES[rule]).toBeDefined();
      expect(new Set(rules).size).toBe(rules.length);
      expect(b.heatPhase).toBeDefined();
      expect(BOSS_RULES[b.heatPhase!.rule]).toBeDefined();
      expect(b.mechanicMultiplier).toBeGreaterThan(1);
    }
  });
});

describe('boss phases in combat', () => {
  it('shifts stance at both thresholds', () => {
    const run = runWith({});
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
    expect(r.log.filter((l) => l.text.includes('shifts stance')).length).toBe(2);
  });

  it('reveals phase names and the mechanic once studied', () => {
    const run = runWith({});
    const mods = computeModifiers(run, {}, zeroBuffs());
    const r = runCombat(
      run,
      { enemies: ['thorncrown'] },
      mods,
      6,
      [],
      ['thorncrown'],
      {},
      builtinDecider,
    );
    expect(r.log.some((l) => l.text.includes('enters Bramble Armor'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('enters Thorn Frenzy'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('telegraphs: next round, Thorn Barrage'))).toBe(true);
  });

  it('hides the mechanic name until studied', () => {
    const run = runWith({});
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
    expect(r.log.some((l) => l.text.includes('telegraphs: a heavy attack'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('telegraphs: next round, Thorn Barrage'))).toBe(false);
  });

  it('guard skills soften the mechanic', () => {
    const base = runWith({});
    const run = { ...base, unit: { ...base.unit, hp: 100 } };
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    // Raising the guard is the player's call, so this fight is played with the order a player gives
    // against a telegraph: cast the build's guard-role skill whenever it is ready.
    const castGuard = (state: TurnState): TurnOrder => {
      const guard = state.actives.find(
        (sk) =>
          sk.role === 'guard' &&
          (state.cooldowns[sk.id] ?? 0) <= 0 &&
          state.energy >= (sk.energyCost ?? 1),
      );
      return { skillId: guard?.id ?? null, targetIndex: 0, guard: false };
    };
    const r = runCombat(run, { enemies: ['thorncrown'] }, mods, 6, [], [], {}, castGuard);
    expect(r.log.some((l) => l.text.includes('You brace your guard'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('Your guard softens the blow'))).toBe(true);
    const takes = r.log
      .filter((l) => l.text.includes('unleashes its mechanic'))
      .map((l) => Number(l.text.match(/You take (\d+)\./)![1]));
    expect(takes.length).toBeGreaterThan(0);
    for (const t of takes) expect(t).toBeLessThanOrEqual(6);
  });

  it('a critical interrupt cancels the telegraph', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
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
      if (r.log.some((l) => l.text.includes('interrupts the telegraph'))) found = true;
    }
    expect(found).toBe(true);
  });

  it('a stun interrupts the mechanic', () => {
    let found = false;
    for (let seed = 1; seed <= 400 && !found; seed++) {
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
      if (r.log.some((l) => l.text.includes('mechanic is interrupted'))) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('Boss Study', () => {
  it('fainting to a boss reveals weakness and tells, and never changes boss stats', () => {
    const before = BOSSES.map((b) => ({ ...b, phases: b.phases?.map((p) => ({ ...p })) }));
    let studied: DelveMeta | undefined;
    for (let seed = 1; seed <= 200 && !studied; seed++) {
      let state = startRun(seed, 1, 4);
      let guard = 0;
      while (state.run.result === 'active' && guard < 2000) {
        state = playOne(state);
        guard += 1;
      }
      if (
        state.run.result === 'fainted' &&
        state.run.roomsVisited.some((id) => id.startsWith('f6')) &&
        state.meta.bossKnowledge.length > 0
      ) {
        studied = state.meta;
      }
    }
    expect(studied).toBeDefined();
    expect(studied!.bossKnowledge).toContain('thorncrown');
    expect(studied!.knownWeaknesses).toContain('ember');
    expect(BOSSES).toEqual(before);
  });
});
