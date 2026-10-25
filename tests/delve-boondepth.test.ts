import { describe, expect, it } from 'vitest';
import {
  BOONS,
  FUSIONS,
  MAX_BOON_LEVEL,
  buildBoonOffer,
  computeModifiers,
  emptyMeta,
  forgeTotals,
  fusionRecipesFor,
  newRun,
  resolveChoice,
  stepRun,
  topTag,
  type RunState,
} from '../src/core/delve';
import { CAMP_POLICY, POLICY, mkCtx, singleRowRun } from './delve-helpers';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

describe('boon levels', () => {
  it('scales boon effects by level in computeModifiers', () => {
    const run: RunState = {
      ...newRun(11, 1, 3, emptyMeta()),
      boons: ['fury-sharpquill'],
      boonLevels: { 'fury-sharpquill': 2 },
    };
    const m = computeModifiers(run, {}, zeroBuffs());
    expect(m.atk).toBe(2); // +1 ATK at level 1, +2 at level 2
  });

  it('re-picking a held boon upgrades it instead of duplicating it', () => {
    const meta = emptyMeta();
    const run: RunState = {
      ...singleRowRun('rest', {
        boons: ['guard-ironhide'],
        boonLevels: { 'guard-ironhide': 1 },
      }),
      pendingChoice: {
        kind: 'boon',
        options: [{ id: 'guard-ironhide', label: 'Ironhide', detail: '+10 max HP' }],
        reason: 'Choose a boon.',
        stepIndex: 0,
      },
    };
    const out = resolveChoice(run, mkCtx(meta, { policy: CAMP_POLICY }), 'guard-ironhide');
    expect(out.run.boons).toEqual(['guard-ironhide']);
    expect(out.run.boonLevels['guard-ironhide']).toBe(2);
    expect(out.run.log.some((l) => l.text.includes('upgraded to level 2'))).toBe(true);
  });

  it('caps boons at level 3', () => {
    const meta = emptyMeta();
    const run: RunState = {
      ...singleRowRun('rest', {
        boons: ['guard-ironhide'],
        boonLevels: { 'guard-ironhide': 3 },
      }),
      pendingChoice: {
        kind: 'boon',
        options: [{ id: 'guard-ironhide', label: 'Ironhide', detail: '+10 max HP' }],
        reason: 'Choose a boon.',
        stepIndex: 0,
      },
    };
    const out = resolveChoice(run, mkCtx(meta, { policy: CAMP_POLICY }), 'guard-ironhide');
    expect(out.run.boonLevels['guard-ironhide']).toBe(3);
    expect(MAX_BOON_LEVEL).toBe(3);
  });

  it('never offers a boon already at max level', () => {
    const run: RunState = {
      ...newRun(11, 1, 3, emptyMeta()),
      boons: ['guard-ironhide'],
      boonLevels: { 'guard-ironhide': 3 },
    };
    for (let step = 0; step < 60; step++) {
      const { offer } = buildBoonOffer({ ...run, stepIndex: step }, 3);
      expect(offer.some((b) => b.id === 'guard-ironhide')).toBe(false);
    }
  });
});

describe('fusion recipes', () => {
  it('defines 10 unique fusions from real boons of different tags', () => {
    expect(FUSIONS).toHaveLength(10);
    expect(new Set(FUSIONS.map((f) => f.id)).size).toBe(10);
    for (const f of FUSIONS) {
      const a = BOONS.find((b) => b.id === f.from[0]);
      const b = BOONS.find((b) => b.id === f.from[1]);
      expect(a, `ingredient ${f.from[0]}`).toBeDefined();
      expect(b, `ingredient ${f.from[1]}`).toBeDefined();
      expect(a!.tag).not.toBe(b!.tag);
      expect(BOONS.some((x) => x.id === f.id)).toBe(false);
    }
  });

  it('finds recipes only when both ingredients are held', () => {
    const run: RunState = {
      ...newRun(11, 1, 3, emptyMeta()),
      boons: ['guard-ironhide', 'fury-emberfist'],
      boonLevels: { 'guard-ironhide': 1, 'fury-emberfist': 1 },
    };
    const recipes = fusionRecipesFor(run);
    expect(recipes.some((r) => r.id === 'fuse-warchest')).toBe(true);
    expect(fusionRecipesFor({ ...run, boons: ['guard-ironhide'] })).toHaveLength(0);
  });

  it('offers Fuse in a camp-mode rest room', () => {
    const meta = emptyMeta();
    const run = singleRowRun('rest', {
      boons: ['guard-ironhide', 'fury-emberfist'],
      boonLevels: { 'guard-ironhide': 1, 'fury-emberfist': 1 },
    });
    const out = stepRun(run, mkCtx(meta, { policy: CAMP_POLICY }));
    expect(out.run.pendingChoice?.kind).toBe('rest');
    expect(out.run.pendingChoice!.options.some((o) => o.id === 'fuse:fuse-warchest')).toBe(true);
  });

  it('fusing consumes both ingredients and grants the fused boon', () => {
    const meta = emptyMeta();
    const run = singleRowRun('rest', {
      boons: ['guard-ironhide', 'fury-emberfist'],
      boonLevels: { 'guard-ironhide': 2, 'fury-emberfist': 1 },
    });
    const entered = stepRun(run, mkCtx(meta, { policy: CAMP_POLICY }));
    const out = resolveChoice(
      entered.run,
      mkCtx(meta, { policy: CAMP_POLICY }),
      'fuse:fuse-warchest',
    );
    expect(out.run.boons).toEqual(['fuse-warchest']);
    expect(out.run.boonLevels['fuse-warchest']).toBe(1);
    expect(out.run.pendingChoice).toBeNull();
    expect(out.run.log.some((l) => l.text.includes('Fused Ironhide + Ember Fist'))).toBe(true);
  });

  it('offers no fusion when the ingredients are not held', () => {
    const meta = emptyMeta();
    const entered = stepRun(singleRowRun('rest'), mkCtx(meta, { policy: CAMP_POLICY }));
    expect(entered.run.pendingChoice?.kind).toBe('rest');
    expect(entered.run.pendingChoice!.options.some((o) => o.id.startsWith('fuse:'))).toBe(false);
  });

  it('greedy autopilot fuses at a rest room', () => {
    const meta = emptyMeta();
    const greedy = { ...POLICY, route: 'greedy' as const };
    const run = singleRowRun('rest', {
      boons: ['guard-ironhide', 'fury-emberfist'],
      boonLevels: { 'guard-ironhide': 1, 'fury-emberfist': 1 },
    });
    const out = stepRun(run, mkCtx(meta, { policy: greedy }));
    expect(out.run.boons).toContain('fuse-warchest');
    expect(out.run.boons).not.toContain('guard-ironhide');
    expect(out.run.log.some((l) => l.text.includes('Fused'))).toBe(true);
  });
});

describe('fair offers', () => {
  it('never produces empty or duplicate offers', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const base: RunState = { ...newRun(seed, 1, 3, emptyMeta()), stepIndex: seed % 37 };
      for (let i = 0; i < 4; i++) {
        const { offer } = buildBoonOffer({ ...base, stepIndex: base.stepIndex + i * 11 }, 4);
        expect(offer).toHaveLength(4);
        expect(new Set(offer.map((b) => b.id)).size).toBe(4);
      }
    }
  });

  it('bad-luck protection: never more than two consecutive offers missing the top tag', () => {
    let run: RunState = newRun(11, 1, 3, emptyMeta());
    let streak = 0;
    let worst = 0;
    for (let step = 0; step < 120; step++) {
      run = { ...run, stepIndex: step };
      const { offer, offerStreak } = buildBoonOffer(run, 3);
      const hasTop = offer.some((b) => b.tag === topTag(run));
      streak = hasTop ? 0 : streak + 1;
      worst = Math.max(worst, streak);
      const pick = offer[0]!;
      const lvl = run.boonLevels[pick.id] ?? 0;
      run = {
        ...run,
        offerStreak,
        boons: run.boons.includes(pick.id) ? run.boons : [...run.boons, pick.id],
        boonLevels: { ...run.boonLevels, [pick.id]: lvl + 1 },
      };
      if (run.boons.length >= 8) break; // real flow stops offering at the boon cap
    }
    expect(worst).toBeLessThanOrEqual(2);
  });
});

describe('Forge rerolls', () => {
  it('forgeTotals exposes rerolls from the Forge tree', () => {
    expect(forgeTotals({ reroll: 2 }).rerolls).toBe(2);
    expect(forgeTotals({}).rerolls).toBe(0);
  });

  it('newRun snapshots rerolls from the Forge', () => {
    const meta = { ...emptyMeta(), forge: { reroll: 2 } };
    expect(newRun(11, 1, 3, meta).rerollsLeft).toBe(2);
  });

  it('offers a reroll option in camp-mode boon choices while rerolls remain', () => {
    let found = false;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      const meta = { ...emptyMeta(), forge: { reroll: 2 } };
      const run: RunState = {
        ...newRun(seed, 1, 3, meta),
        floorPlan: {
          floor: 1,
          rows: [[{ id: 'x', kind: 'skirmish', enemies: ['tollbug'], optionSeed: 0 }]],
        },
      };
      const out = stepRun(run, mkCtx(meta, { policy: CAMP_POLICY }));
      if (out.run.pendingChoice?.kind === 'boon') {
        found = true;
        expect(out.run.pendingChoice.options.some((o) => o.id === 'reroll')).toBe(true);
      }
    }
    expect(found).toBe(true);
  });

  it('rerolling redraws the offer and consumes one reroll', () => {
    const meta = emptyMeta();
    const run: RunState = {
      ...singleRowRun('skirmish', { rerollsLeft: 2 }),
      pendingChoice: {
        kind: 'boon',
        options: [
          { id: 'guard-ironhide', label: 'Ironhide', detail: '+10 max HP' },
          { id: 'fury-sharpquill', label: 'Sharp Quill', detail: '+3 ATK' },
          { id: 'fortune-glimmer', label: 'Glimmer Pouch', detail: '+10 starting Glint' },
          { id: 'reroll', label: 'Reroll offer (2 left)' },
        ],
        reason: 'Choose a boon.',
        stepIndex: 0,
      },
    };
    const out = resolveChoice(run, mkCtx(meta, { policy: CAMP_POLICY }), 'reroll');
    expect(out.oilSpent).toBe(0);
    expect(out.ended).toBe(false);
    expect(out.run.rerollsLeft).toBe(1);
    expect(out.run.pendingChoice?.kind).toBe('boon');
    const opts = out.run.pendingChoice!.options;
    expect(opts).toHaveLength(4);
    expect(new Set(opts.map((o) => o.id)).size).toBe(4);
    expect(opts.some((o) => o.id === 'reroll')).toBe(true);
  });

  it('cannot reroll with no rerolls left', () => {
    const meta = emptyMeta();
    const run: RunState = {
      ...singleRowRun('skirmish', { rerollsLeft: 0 }),
      pendingChoice: {
        kind: 'boon',
        options: [{ id: 'guard-ironhide', label: 'Ironhide', detail: '+10 max HP' }],
        reason: 'Choose a boon.',
        stepIndex: 0,
      },
    };
    const out = resolveChoice(run, mkCtx(meta, { policy: CAMP_POLICY }), 'reroll');
    expect(out.oilSpent).toBe(0);
    expect(out.run).toEqual(run);
  });
});
