/**
 * The four combat elements. Damage multiplies by 1.25 against a weakness and 0.75 against a
 * resistance. Weaknesses are hidden until the codex reveals them (mastery), so the bonus only
 * applies when the attacker knows the target's weakness; resistances are always in force.
 *
 * The `elements-invert` floor rule (§8 E.1) trades the two: a known weakness becomes a liability
 * and a resistance becomes a real weakness. The inversion happens here, in the one multiplier both
 * the fight and every pricing panel read, so a preview and a landed hit always agree.
 */

export type Element = 'ember' | 'frost' | 'gale' | 'umbra';

export const ELEMENTS: Record<Element, { id: Element; name: string }> = {
  ember: { id: 'ember', name: 'Ember' },
  frost: { id: 'frost', name: 'Frost' },
  gale: { id: 'gale', name: 'Gale' },
  umbra: { id: 'umbra', name: 'Umbra' },
};

export const WEAKNESS_MULT = 1.25;
export const RESIST_MULT = 0.75;

export function elementMultiplier(
  attack: Element,
  weakness: Element,
  resistance: Element,
  weaknessKnown = true,
  inverted = false,
): number {
  if (inverted) {
    if (attack === resistance) return WEAKNESS_MULT;
    if (attack === weakness && weaknessKnown) return RESIST_MULT;
    return 1;
  }
  if (attack === weakness && weaknessKnown) return WEAKNESS_MULT;
  if (attack === resistance) return RESIST_MULT;
  return 1;
}
