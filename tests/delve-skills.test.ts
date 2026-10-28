import { describe, expect, it } from 'vitest';
import {
  applyStatus,
  builtinDecider,
  computeModifiers,
  effectiveSpd,
  emptyMeta,
  newRun,
  runCombat,
  statusShield,
  type RunLogEntry,
  type RunState,
  type StatusInstance,
} from '../src/core/delve';
import { mulberry32 } from '../src/core/rng';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

function runWith(over: Partial<RunState> = {}): RunState {
  return { ...newRun(1, 1, 1, emptyMeta()), ...over };
}

function drawRun(buildId: string): RunState {
  return runWith({
    buildId,
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
}

/** Sum of companion damage from the log (basic hits and skill hits, crits included). */
function dealt(log: RunLogEntry[]): number {
  let sum = 0;
  for (const l of log) {
    if (/^(CRIT! )?You (hit|use)/.test(l.text)) {
      const m = l.text.match(/for (\d+)\./);
      if (m) sum += Number(m[1]);
    }
  }
  return sum;
}

describe('build profiles and trees in combat', () => {
  it('folds the build profile and bought tree nodes into combat modifiers', () => {
    const run = runWith({
      buildId: 'spark',
      tree: ['spark-b1-n1', 'spark-b1-n2'],
      companionLevel: 5,
    });
    const m = computeModifiers(run, {}, zeroBuffs());
    expect(m.atk).toBe(2 + 2 + 2); // profile atkAdd + Flash Point + Hot Coals
    expect(m.maxHp).toBe(-6); // profile hpAdd
  });

  it('keeps the Warden baseline at zero when nothing is bought', () => {
    const m = computeModifiers(runWith({}), {}, zeroBuffs());
    expect(m.maxHp).toBe(0);
    expect(m.atk).toBe(0);
    expect(m.def).toBe(0);
  });
});

describe('skills in auto-battle', () => {
  it('casts both Warden actives with cooldown spacing in a long fight', () => {
    const run = drawRun('warden');
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const result = runCombat(
      run,
      { enemies: ['umbralmonarch'] },
      mods,
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(result.drawn).toBe(true);
    const texts = result.log.map((l) => l.text);
    const bastions = texts.filter((t) => t.includes('use Bastion')).length;
    const slams = texts.filter((t) => t.includes('use Shield Bash')).length;
    expect(bastions).toBeGreaterThanOrEqual(3);
    expect(bastions).toBeLessThanOrEqual(Math.ceil(40 / 3) + 1);
    expect(slams).toBeGreaterThanOrEqual(1);
  });

  it('applies Burn from Spark Flare and lets it tick', () => {
    const run = drawRun('spark');
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const result = runCombat(
      run,
      { enemies: ['umbralmonarch'] },
      mods,
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(result.log.some((l) => l.text.includes('use Flare'))).toBe(true);
    expect(result.log.some((l) => l.text.includes('burns for 3'))).toBe(true);
  });
});

describe('element weakness and resistance in combat', () => {
  it('applies the +25% weakness only when the codex knows it', () => {
    const run = runWith({ buildId: 'spark', companionLevel: 8 });
    const mods = computeModifiers(run, {}, zeroBuffs());
    const room = { enemies: ['thorncrown'] };
    const unknown = runCombat(run, room, mods, 6, [], [], {}, builtinDecider);
    const known = runCombat(run, room, mods, 6, ['ember'], [], {}, builtinDecider);
    // Same RNG stream: compare the first Flare hit, which lands before anything diverges.
    const flareDamage = (l: RunLogEntry[]): number => {
      const line = l.find((x) => x.text.includes('use Flare'))!;
      return Number(line.text.match(/for (\d+)\./)![1]);
    };
    expect(flareDamage(known.log)).toBeGreaterThan(flareDamage(unknown.log));
    expect(known.log.some((l) => l.text.toLowerCase().includes('weakness'))).toBe(true);
  });

  it('always applies the -25% resistance, codex or not', () => {
    const run = runWith({ buildId: 'warden', companionLevel: 5 });
    const mods = computeModifiers(run, {}, zeroBuffs());
    const room = { enemies: ['tollbug'] }; // resists gale; gale knowledge is irrelevant
    const a = runCombat(run, room, mods, 1, [], [], {}, builtinDecider);
    const b = runCombat(run, room, mods, 1, ['gale'], [], {}, builtinDecider);
    expect(dealt(a.log)).toBe(dealt(b.log));
  });
});

describe('status helpers', () => {
  it('caps poison stacks and refreshes durations on reapply', () => {
    const rng = mulberry32(1);
    let s: StatusInstance[] = [];
    for (let i = 0; i < 6; i++) s = applyStatus(s, 'poison', rng);
    expect(s).toHaveLength(1);
    expect(s[0]!.stacks).toBe(5);
    expect(s[0]!.duration).toBe(3);
  });

  it('refreshes burn without stacking', () => {
    const rng = mulberry32(1);
    let s: StatusInstance[] = [];
    s = applyStatus(s, 'burn', rng);
    s = applyStatus(s, 'burn', rng);
    expect(s[0]!.stacks).toBe(1);
    expect(s[0]!.duration).toBe(3);
  });

  it('always stuns ordinary enemies but bosses resist most of the time', () => {
    const rng = mulberry32(1);
    const plain = applyStatus([], 'stun', rng);
    expect(plain).toHaveLength(1);
    let resisted = 0;
    let applied = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const out = applyStatus([], 'stun', mulberry32(seed), { isBoss: true });
      if (out.length === 0) resisted++;
      else applied++;
    }
    expect(resisted).toBeGreaterThan(10);
    expect(applied).toBeGreaterThan(0);
  });

  it('recently stunned targets resist stuns more often', () => {
    let resisted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const out = applyStatus([], 'stun', mulberry32(seed), { roundsSinceStun: 1 });
      if (out.length === 0) resisted++;
    }
    expect(resisted).toBeGreaterThanOrEqual(5);
  });

  it('halves speed while chilled and sums shield stacks', () => {
    expect(effectiveSpd(8, [{ id: 'chill', stacks: 1, duration: 2 }])).toBe(4);
    expect(effectiveSpd(9, [{ id: 'chill', stacks: 1, duration: 2 }])).toBe(4);
    expect(effectiveSpd(8, [])).toBe(8);
    expect(
      statusShield([
        { id: 'shield', stacks: 6, duration: -1 },
        { id: 'burn', stacks: 1, duration: 2 },
      ]),
    ).toBe(6);
  });
});

describe('passives', () => {
  it('grants the Warden Steadfast shield at battle start', () => {
    const run = runWith({ buildId: 'warden' });
    const result = runCombat(
      run,
      { enemies: ['tollbug'] },
      computeModifiers(run, {}, zeroBuffs()),
      1,
      [],
      [],
      {},
      builtinDecider,
    );
    expect(result.log.some((l) => l.text.includes('Steadfast'))).toBe(true);
    expect(result.log.some((l) => l.text.includes('shield absorbs'))).toBe(true);
  });
});
