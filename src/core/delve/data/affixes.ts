/**
 * Enemy affix table (SPEC §6.11 D). Eight affixes modify an enemy's stats or behavior in
 * combat; the floor plan carries affix ids on rooms so the map can show them before you
 * commit. Placement rules: no affixes on floors 1-3, at most 1 on an ordinary enemy after
 * floor 3, up to 2 on elites, none on bosses.
 */

export interface AffixDef {
  id: string;
  name: string;
  effect: string;
}

export const AFFIXES: readonly AffixDef[] = [
  { id: 'armored', name: 'Armored', effect: '+30% DEF.' },
  { id: 'swift', name: 'Swift', effect: '+2 SPD, acting earlier.' },
  { id: 'vampiric', name: 'Vampiric', effect: 'Heals for half the damage it deals.' },
  {
    id: 'splitting',
    name: 'Splitting',
    effect: 'On death, spawns one copy at half HP (once).',
  },
  { id: 'enraged', name: 'Enraged', effect: 'Below 30% HP it hits 50% harder.' },
  { id: 'thorned', name: 'Thorned', effect: 'Attackers take 2 damage per hit.' },
  { id: 'warded', name: 'Warded', effect: 'Starts combat with 8 Shield.' },
  { id: 'frenzied', name: 'Frenzied', effect: 'Strikes twice per round.' },
];

export function affixById(id: string): AffixDef | undefined {
  return AFFIXES.find((a) => a.id === id);
}
