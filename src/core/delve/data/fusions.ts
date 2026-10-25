/**
 * Fusion boons: holding two specific boons from different tags lets a Rest or Event room offer
 * "Fuse" into one stronger boon with a new effect (SPEC 6.11 E). Recipes are shown in the codex
 * once discovered. Fusion boons join the offer pool like any boon and can also reach level 3.
 */

import { BOONS, boonById, type BoonLike } from './boons';

export interface FusionDef extends BoonLike {
  /** Two boon ids (different tags) consumed to create this fusion. */
  from: [string, string];
}

const fusion = (
  id: string,
  name: string,
  tag: BoonLike['tag'],
  rarity: BoonLike['rarity'],
  fx: BoonLike['fx'],
  effect: string,
  from: [string, string],
): FusionDef => ({ id, name, tag, rarity, fx, effect, from });

export const FUSIONS: readonly FusionDef[] = [
  fusion(
    'fuse-warchest',
    'War Chest',
    'guard',
    'epic',
    { kind: 'stat', stat: 'maxHp', add: 12 },
    '+24 max HP',
    ['guard-ironhide', 'fury-emberfist'],
  ),
  fusion(
    'fuse-hearth',
    'Hearth',
    'vigor',
    'epic',
    { kind: 'healAfterCombat', percent: 12 },
    'Heal 20% HP after each combat',
    ['guard-rootshell', 'vigor-canteen'],
  ),
  fusion(
    'fuse-overdraft',
    'Overdraft',
    'fury',
    'epic',
    { kind: 'critDamage', mult: 0.5 },
    'Crits hit 50% harder',
    ['fury-doubledown', 'thrift-coupon'],
  ),
  fusion(
    'fuse-dividend',
    'Dividend',
    'fortune',
    'epic',
    { kind: 'embersBonus', percent: 15 },
    '+25% Embers earned',
    ['fortune-interest', 'thrift-rainyday'],
  ),
  fusion(
    'fuse-insurance',
    'Insurance',
    'guard',
    'epic',
    { kind: 'damageReduction', percent: 12 },
    'Take 20% less damage',
    ['guard-doorstop', 'fortune-luckyclover'],
  ),
  fusion(
    'fuse-bonus',
    'Year-End Bonus',
    'fury',
    'epic',
    { kind: 'stat', stat: 'atk', add: 5 },
    '+10 ATK',
    ['fury-sundown', 'fortune-shiny'],
  ),
  fusion(
    'fuse-allowance',
    'Allowance',
    'thrift',
    'epic',
    { kind: 'startGlint', amount: 18 },
    '+35 starting Glint per floor',
    ['thrift-sparechange', 'vigor-freshair'],
  ),
  fusion(
    'fuse-safety',
    'Safety Net',
    'guard',
    'epic',
    { kind: 'roomShield', amount: 8 },
    'Start each room with a 16 HP shield',
    ['guard-lanternbuckler', 'vigor-bandaid'],
  ),
  fusion(
    'fuse-audit',
    'Deep Audit',
    'fortune',
    'epic',
    { kind: 'stat', stat: 'luck', add: 6 },
    '+12 LUCK',
    ['fortune-fourleaf', 'thrift-wholesale'],
  ),
  fusion(
    'fuse-compound',
    'Compounding',
    'vigor',
    'epic',
    { kind: 'stat', stat: 'maxHp', add: 16 },
    '+32 max HP',
    ['vigor-secondwind', 'fortune-glimmer'],
  ),
];

export function fusionById(id: string): FusionDef | undefined {
  return FUSIONS.find((f) => f.id === id);
}

/** Look up a boon or a fusion boon by id. */
export function anyBoonById(id: string): BoonLike | undefined {
  return boonById(id) ?? fusionById(id);
}

/** Recipes whose two ingredients are both held (order = FUSIONS order). */
export function fusionRecipesFor(run: { boons: readonly string[] }): FusionDef[] {
  return FUSIONS.filter((f) => f.from.every((id) => run.boons.includes(id)));
}

/** Guard: fusion ingredients must be real distinct boons from different tags. */
export function fusionIngredientsValid(): boolean {
  return FUSIONS.every((f) => {
    const a = boonById(f.from[0]);
    const b = boonById(f.from[1]);
    return (
      !!a && !!b && a.tag !== b.tag && f.from[0] !== f.from[1] && !BOONS.some((x) => x.id === f.id)
    );
  });
}
