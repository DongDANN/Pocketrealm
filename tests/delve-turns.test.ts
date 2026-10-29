/**
 * Gate 7b-2 — the decide seam.
 *
 * The turn loop used to choose for the player: ready skills, most expensive first. §4 A.1 hands that
 * choice back, and these tests pin the contract `runCombat` offers a player-driven room — every
 * companion action comes from a `TurnOrder`, an order the rules cannot honour stops the fight instead
 * of being swapped for one they can, and a paused room is rebuilt by replaying the orders already
 * acted on against the same seed. That last property is the only reason a saved run may carry orders
 * instead of a pile of mutable state (§4 A.2), so it is tested as an equality, not a smoke test.
 */

import { describe, expect, it } from 'vitest';
import {
  computeModifiers,
  emptyMeta,
  hitOf,
  incomingBreakdown,
  newRun,
  runCombat,
  type CombatResult,
  type IncomingInput,
  type TurnDecider,
  type TurnOrder,
} from '../src/core/delve';
import { NEUTRAL_RULE } from './delve-helpers';

const basic: TurnOrder = { skillId: null, targetIndex: 0, guard: false };

/** A floor-1 skirmish against the Warden's default build, on a floor whose rule touches nothing. */
function fight(decide: TurnDecider, enemies: string[] = ['tollbug']): CombatResult {
  const run = { ...newRun(7, 1, 1, emptyMeta()), floorRule: NEUTRAL_RULE };
  const modifiers = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
  return runCombat(run, { kind: 'skirmish', enemies }, modifiers, 1, [], [], {}, decide);
}

type Hit = NonNullable<ReturnType<typeof hitOf>>;

function hits(res: CombatResult, side: Hit['side']): Hit[] {
  return res.log.map(hitOf).filter((h): h is Hit => h !== null && h.side === side);
}

/** Fire Bastion the moment it is affordable, otherwise swing. */
const wardenPolicy: TurnDecider = (s) =>
  (s.cooldowns['warden-bastion'] ?? 0) <= 0 && s.energy >= 4
    ? { skillId: 'warden-bastion', targetIndex: 0, guard: false }
    : basic;

describe('a turn order is the whole of the companion action', () => {
  it('fires exactly the skill the order named, and records every order acted on', () => {
    const res = fight(wardenPolicy);

    expect(res.pause).toBeUndefined();
    expect(res.won).toBe(true);
    const bastions = hits(res, 'player').filter((h) => h.skillId === 'warden-bastion');
    expect(bastions).toHaveLength(1);
    // Bastion's power, not the basic swing's 1 — the engine did what the order said.
    expect(bastions[0]!.input).toMatchObject({ power: 1.05 });
    // One order per companion action, and the last one is the one that finished the fight.
    expect(res.orders).toHaveLength(res.rounds);
    expect(res.orders.at(-1)).toEqual({
      skillId: 'warden-bastion',
      targetIndex: 0,
      guard: false,
    });
  });

  it('strikes the enemy the index names, and only that one', () => {
    // Mossbite out-speeds the Warden at 8, so this fight also proves the index is looked up in the
    // living roster rather than in whatever order the actors happened to swing.
    const res = fight(
      (s) => (s.round === 1 ? { skillId: null, targetIndex: 1, guard: false } : null),
      ['tollbug', 'mossbite'],
    );

    const [first] = hits(res, 'player');
    expect(first!.target).toBe('Mossbite');
    expect(res.orders).toEqual([{ skillId: null, targetIndex: 1, guard: false }]);

    const pause = res.pause!;
    expect(pause.enemies[0]!.hp, 'the Tollbug was not the target').toBe(pause.enemies[0]!.maxHp);
    expect(pause.enemies[1]!.hp).toBeLessThan(pause.enemies[1]!.maxHp);
  });

  it('a brace is the round, and halves what lands at the mechanic guard’s own factor', () => {
    const braced = fight((s) =>
      s.round === 1 ? { skillId: null, targetIndex: 0, guard: true } : basic,
    );

    expect(braced.orders[0]).toEqual({ skillId: null, targetIndex: 0, guard: true });
    const first = hits(braced, 'enemy')[0]!;
    expect(first.round).toBe(1);
    const input = first.input as IncomingInput;
    expect(input.guard).toBe(true);
    expect(first.sum.terms.some((t) => t.label === 'Guard')).toBe(true);
    // The same blow without the brace: the halving is the only difference, and it is one halving.
    const open = incomingBreakdown({ ...input, guard: false });
    expect(first.sum.damage).toBe(Math.round(open.damage / 2));

    // A brace covers its own round and nothing after it.
    const second = hits(braced, 'enemy').find((h) => h.round === 2)!;
    expect('guard' in (second.input as IncomingInput)).toBe(false);
  });

  it('an unbraced hit carries no guard key at all, so the intent forecast is the record', () => {
    // The forecast builds an `IncomingInput` without the optional key; the engine must not add one
    // for a hit that was never braced, or the two objects stop being comparable.
    for (const h of hits(
      fight(() => basic),
      'enemy',
    )) {
      expect('guard' in (h.input as IncomingInput)).toBe(false);
    }
  });
});

describe('the loop asks rather than guesses', () => {
  it('a null order pauses the room and hands back the menu', () => {
    const res = fight((s) => (s.round <= 2 ? basic : null));

    expect(res.won).toBe(false);
    expect(res.fled).toBe(false);
    expect(res.orders).toEqual([basic, basic]);

    const pause = res.pause!;
    expect(pause.state.round).toBe(3);
    expect(pause.state.hp).toBe(res.hpAfter);
    expect(pause.state.targets).toHaveLength(pause.enemies.filter((e) => e.hp > 0).length);
    expect(pause.orders).toEqual([basic, basic]);
    // A paused room credits nothing: the replay that finishes it reports the kills, once.
    expect(res.kills).toEqual([]);
  });

  const REFUSED: [string, TurnOrder][] = [
    [
      'a skill that costs more energy than the round has',
      { skillId: 'warden-bastion', targetIndex: 0, guard: false },
    ],
    ['a target index that is not in the room', { skillId: null, targetIndex: 4, guard: false }],
    ['a skill the build does not have', { skillId: 'no-such-skill', targetIndex: 0, guard: false }],
    ['a brace that also names a swing', { skillId: 'warden-bastion', targetIndex: 0, guard: true }],
    [
      'an item, which has no in-round rules yet',
      { skillId: null, targetIndex: 0, guard: false, consumableId: 'fire-oil' },
    ],
  ];

  for (const [why, order] of REFUSED) {
    it(`asks again instead of substituting: ${why}`, () => {
      const res = fight(() => order);

      expect(res.pause).toBeDefined();
      expect(res.pause!.state.round).toBe(1);
      expect(res.orders).toEqual([]);
      expect(res.pause!.orders).toEqual([]);
      // Nothing happened on the companion's behalf: no swing, no damage taken, full health.
      expect(hits(res, 'player')).toEqual([]);
      expect(res.pause!.enemies[0]!.hp).toBe(res.pause!.enemies[0]!.maxHp);
      expect(res.pause!.state.hp).toBe(60);
    });
  }

  it('refuses a skill still on cooldown, even when the energy is there', () => {
    // Three Tollbugs buy the energy for Bastion by round 2 and then keep the fight alive long enough
    // to try it again in round 3, when the cooldown is still running.
    const res = fight(
      (s) => (s.round <= 1 ? basic : { skillId: 'warden-bastion', targetIndex: 0, guard: false }),
      ['tollbug', 'tollbug', 'tollbug'],
    );

    expect(res.pause).toBeDefined();
    expect(res.pause!.state.round).toBe(3);
    expect(res.orders).toHaveLength(2);
    expect(res.orders[1]!.skillId).toBe('warden-bastion');
    expect(res.pause!.state.cooldowns['warden-bastion']).toBeGreaterThan(0);
  });
});

describe('a paused room is rebuilt, not resumed', () => {
  it('replaying the orders already taken reproduces the fight line for line', () => {
    const full = fight(wardenPolicy);

    const paused = fight((s) => (s.round <= 2 ? wardenPolicy(s) : null));
    expect(paused.pause).toBeDefined();
    expect(paused.orders).toEqual(full.orders.slice(0, 2));

    // The UI's resume: hand back the orders it has, then let the policy answer again. Same seed, same
    // orders in, same fight out — including the whole log, not just the result.
    const replay = [...paused.orders];
    const replayed = fight((s) => replay.shift() ?? wardenPolicy(s));

    expect(replayed.pause).toBeUndefined();
    expect(replayed.won).toBe(full.won);
    expect(replayed.rounds).toBe(full.rounds);
    expect(replayed.hpAfter).toBe(full.hpAfter);
    expect(replayed.orders).toEqual(full.orders);
    expect(replayed.log.map((e) => e.text)).toEqual(full.log.map((e) => e.text));
    // And the replay's log starts with the paused fight's log, verbatim.
    expect(replayed.log.slice(0, paused.log.length).map((e) => e.text)).toEqual(
      paused.log.map((e) => e.text),
    );
  });
});
