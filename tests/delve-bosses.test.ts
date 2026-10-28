import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  computeModifiers,
  emptyMeta,
  newRun,
  runCombat,
  stepRun,
  type AutopilotPolicy,
  type DelveMeta,
  type RunState,
} from '../src/core/delve';
import { mkCtx } from './delve-helpers';

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

  it('each phase hits harder than the last', () => {
    for (const b of BOSSES) {
      expect(b.phases![0]!.mechanicMultiplier).toBeGreaterThan(b.mechanicMultiplier);
      expect(b.phases![1]!.mechanicMultiplier).toBeGreaterThan(b.phases![0]!.mechanicMultiplier);
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
    );
    expect(r.log.filter((l) => l.text.includes('shifts stance')).length).toBe(2);
  });

  it('reveals phase names and the mechanic once studied', () => {
    const run = runWith({});
    const mods = computeModifiers(run, {}, zeroBuffs());
    const r = runCombat(run, { enemies: ['thorncrown'] }, mods, 6, [], ['thorncrown']);
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
    );
    expect(r.log.some((l) => l.text.includes('telegraphs: a heavy attack'))).toBe(true);
    expect(r.log.some((l) => l.text.includes('telegraphs: next round, Thorn Barrage'))).toBe(false);
  });

  it('guard skills soften the mechanic', () => {
    const base = runWith({ cards: ['rainy-day'] });
    const run = { ...base, unit: { ...base.unit, hp: 100 } };
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const r = runCombat(run, { enemies: ['thorncrown'] }, mods, 6);
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
      );
      if (r.log.some((l) => l.text.includes('mechanic is interrupted'))) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('Boss Study', () => {
  it('fainting to a boss reveals weakness and tells, and never changes boss stats', () => {
    const before = BOSSES.map((b) => ({ ...b, phases: b.phases?.map((p) => ({ ...p })) }));
    const policy: AutopilotPolicy = {
      mode: 'autopilot',
      tagPriority: ['guard', 'vigor', 'fury', 'fortune', 'thrift'],
      retreatHpPercent: 0,
      route: 'balanced',
    };
    let studied: DelveMeta | undefined;
    for (let seed = 1; seed <= 200 && !studied; seed++) {
      let meta = emptyMeta();
      let run = newRun(seed, 1, 4, meta);
      let guard = 0;
      while (run.result === 'active' && guard < 1000) {
        guard += 1;
        const before = run.stepIndex;
        const out = stepRun(run, mkCtx(meta, { policy }));
        run = out.run;
        meta = out.meta;
        if (run.stepIndex === before && !out.ended) break;
        if (
          run.result === 'fainted' &&
          run.roomsVisited.some((id) => id.startsWith('f6')) &&
          meta.bossKnowledge.length > 0
        ) {
          studied = meta;
        }
      }
    }
    expect(studied).toBeDefined();
    expect(studied!.bossKnowledge).toContain('thorncrown');
    expect(studied!.knownWeaknesses).toContain('ember');
    expect(BOSSES).toEqual(before);
  });
});
