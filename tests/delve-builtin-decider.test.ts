/**
 * The built-in headless decider (DELVE_REDESIGN §5). The player-facing Habit Cards feature is gone;
 * this is the one fixed policy the fuzz, golden and simulation suites play through, so its contract
 * — a legal TurnOrder every round, no randomness — is what these tests pin.
 */

import { describe, expect, it } from 'vitest';
import {
  BUILTIN_DECK,
  buildById,
  builtinDecider,
  evaluateCards,
  type TurnState,
} from '../src/core/delve';

const warden = buildById('warden')!.skills.filter(
  (s): s is TurnState['actives'][number] => s.kind === 'active',
);

function state(over: Partial<TurnState> = {}): TurnState {
  return {
    round: 3,
    energy: 8,
    hp: 60,
    maxHp: 100,
    cooldowns: {},
    actives: warden,
    targets: [{ hp: 50, maxHp: 100, marked: false, weakness: 'frost' }],
    ...over,
  };
}

describe('built-in deck', () => {
  it('is one small fixed deck with unique ids and readable rules', () => {
    expect(BUILTIN_DECK).toHaveLength(3);
    expect(new Set(BUILTIN_DECK.map((c) => c.id)).size).toBe(BUILTIN_DECK.length);
    for (const card of BUILTIN_DECK) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.effect.length).toBeGreaterThan(0);
      expect(card.condition).toBeDefined();
      expect(card.action).toBeDefined();
    }
  });

  it('braces below 35% HP by casting the guard skill', () => {
    expect(evaluateCards(BUILTIN_DECK, state({ hp: 34 })).fired?.id).toBe('rainy-day');
    expect(builtinDecider(state({ hp: 34 })).skillId).toBe('warden-bastion');
    expect(evaluateCards(BUILTIN_DECK, state({ hp: 35 })).fired?.id).not.toBe('rainy-day');
  });

  it('opens round one with the strongest ready skill', () => {
    const order = builtinDecider(state({ round: 1 }));
    expect(order.skillId).toBe('warden-shieldbash');
  });

  it('falls back to the basic attack when nothing is ready', () => {
    const order = builtinDecider(state({ energy: 0 }));
    expect(order).toEqual({ skillId: null, targetIndex: 0, guard: false });
  });

  it('never braces and always names a target the room has', () => {
    const states = [
      state({ round: 1 }),
      state({ hp: 10 }),
      state({ energy: 0 }),
      state({
        cooldowns: { 'warden-bastion': 2, 'warden-shieldbash': 2 },
      }),
      state({ targets: [] }),
    ];
    for (const s of states) {
      const order = builtinDecider(s);
      expect(order.guard).toBe(false);
      expect(order.consumableId).toBeUndefined();
      if (s.targets.length > 0) {
        expect(order.targetIndex).toBeGreaterThanOrEqual(0);
        expect(order.targetIndex).toBeLessThan(s.targets.length);
      }
    }
  });
});
