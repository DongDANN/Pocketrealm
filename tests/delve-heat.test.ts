import { describe, expect, it } from 'vitest';
import {
  computeModifiers,
  emptyMeta,
  generateFloor,
  heatRewardMult,
  heatUnlocked,
  newRun,
  runCombat,
  stepRun,
  type RunState,
} from '../src/core/delve';
import { CAMP_POLICY, mkCtx, singleRowRun } from './delve-helpers';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

describe('heat gating and rewards', () => {
  it('unlocks only after the hollow is cleared', () => {
    const meta = emptyMeta();
    expect(heatUnlocked(meta, 1)).toBe(false);
    expect(heatUnlocked({ ...meta, clearedHollows: [1] }, 1)).toBe(true);
    expect(heatUnlocked({ ...meta, clearedHollows: [1] }, 2)).toBe(false);
  });

  it('scales the reward multiplier about 1.1 per level', () => {
    expect(heatRewardMult(0)).toBe(1);
    expect(heatRewardMult(1)).toBeCloseTo(1.1);
    expect(heatRewardMult(5)).toBe(1.5);
  });

  it('newRun defaults to heat 0 and clamps to the 0-5 range', () => {
    expect(newRun(11, 1, 3, emptyMeta()).heat).toBe(0);
    expect(newRun(11, 1, 3, emptyMeta(), 'warden', 9).heat).toBe(5);
    expect(newRun(11, 1, 3, emptyMeta(), 'warden', -2).heat).toBe(0);
  });

  it('heat multiplies Embers and Sparks rewards', () => {
    const play = (heat: number): { run: RunState; sparks: number } => {
      const meta = emptyMeta();
      let run = newRun(31, 1, 20, meta, 'warden', heat);
      let sparks = 0;
      let guard = 0;
      while (run.result === 'active' && guard < 500) {
        guard += 1;
        const out = stepRun(run, mkCtx(meta, { oil: 999 }));
        run = out.run;
        sparks += out.ledger.reduce((s, e) => s + e.sparks, 0);
      }
      return { run, sparks };
    };
    const h0 = play(0);
    const h5 = play(5);
    expect(h0.run.result).toBe('cleared');
    expect(h5.run.result).toBe('cleared');
    expect(h0.sparks).toBe(16); // 6 floor events (1 each) + 1 clear (10)
    expect(h5.sparks).toBe(27); // 6 x 2 + 15
    expect(h5.run.embersEarned).toBeGreaterThan(h0.run.embersEarned * 1.4);
    expect(h5.run.embersEarned).toBeLessThan(h0.run.embersEarned * 1.6);
  });
});

describe('heat map modifiers', () => {
  it('heat 2 spawns more elites and heat 4 fewer rest rooms', () => {
    // Count only middle rows: the last row of non-boss floors is always a Rest room.
    const tally = (heat: number) => {
      let elites = 0;
      let rests = 0;
      for (let seed = 1; seed <= 100; seed++) {
        for (const floor of [4, 5]) {
          const plan = generateFloor(seed, 1, floor, heat);
          for (let r = 0; r < plan.rows.length - 1; r++) {
            for (const room of plan.rows[r]!) {
              if (room.kind === 'elite') elites += 1;
              if (room.kind === 'rest') rests += 1;
            }
          }
        }
      }
      return { elites, rests };
    };
    const h0 = tally(0);
    const h2 = tally(2);
    const h4 = tally(4);
    expect(h2.elites).toBeGreaterThan(h0.elites * 1.4);
    expect(h4.rests).toBeLessThan(h0.rests * 0.6);
  });
});

describe('heat combat modifiers', () => {
  it('heat 1 raises enemy attack by 10%', () => {
    const maxHit = (heat: number) => {
      const run = newRun(11, 1, 1, emptyMeta(), 'warden', heat);
      const mods = computeModifiers(run, {}, zeroBuffs());
      const res = runCombat(run, { enemies: ['tollbug'] }, mods, 1);
      const hits = res.log
        .filter((l) => l.text.startsWith('Tollbug hits for'))
        .map((l) => Number(/hits for (\d+)/.exec(l.text)![1]));
      return Math.max(...hits);
    };
    expect(maxHit(1)).toBe(maxHit(0) + 1); // 9 -> 10 ATK against 4 DEF
  });

  it('heat 3 gives bosses an extra final phase', () => {
    const found = (heat: number) => {
      for (let seed = 1; seed <= 200; seed++) {
        const run = newRun(seed, 1, 12, emptyMeta(), 'warden', heat);
        const mods = computeModifiers(run, {}, zeroBuffs());
        const res = runCombat(run, { enemies: ['thorncrown'] }, mods, 6, [], ['thorncrown']);
        if (res.log.some((l) => l.text.includes('enters Lantern Eater'))) return true;
      }
      return false;
    };
    expect(found(3)).toBe(true);
    expect(found(0)).toBe(false);
  });
});

describe('heat shop prices', () => {
  it('heat 5 raises shop prices by 25%', () => {
    const meta = emptyMeta();
    const priceOf = (heat: number) => {
      const out = stepRun(singleRowRun('shop', { heat }), mkCtx(meta, { policy: CAMP_POLICY }));
      expect(out.run.pendingChoice?.kind).toBe('shop');
      return out.run.pendingChoice!.options.find((o) => o.id === 'heal')!.label;
    };
    expect(priceOf(0)).toContain('40g');
    expect(priceOf(5)).toContain('50g');
  });
});
