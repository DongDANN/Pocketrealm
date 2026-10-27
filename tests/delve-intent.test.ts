/**
 * Gate 7a — enemy intent.
 *
 * The complaint the redesign answers is that a room resolves and a number moves with nothing saying
 * how. Half of that is the damage sum; the other half is knowing what the enemy was about to do.
 * These tests pin `enemyIntent` as a *prediction*: the number it prints must be the number the engine
 * later resolves, so the two are compared directly — once against the builder it is supposed to use,
 * and once against real combat logs.
 */

import { describe, expect, it } from 'vitest';
import {
  BOSSES,
  ELITES,
  ENEMIES,
  computeModifiers,
  emptyMeta,
  enemyById,
  enemyIntent,
  hitOf,
  incomingBreakdown,
  mechanicArmed,
  newRun,
  runCombat,
  scaledStats,
  type EnemyIntent,
  type IncomingInput,
  type IntentDefence,
  type IntentEnemy,
} from '../src/core/delve';

const defence: IntentDefence = { def: 4, hp: 60 };

/** A snapshot of an enemy as it would appear at the start of a floor-1 fight. */
function foe(speciesId: string, over: Partial<IntentEnemy> = {}): IntentEnemy {
  const def = enemyById(speciesId)!;
  const elite = ELITES.some((e) => e.id === speciesId);
  const boss = BOSSES.find((e) => e.id === speciesId);
  const s = scaledStats(def, 1, elite, boss !== undefined);
  return {
    name: def.name,
    species: def.id,
    atk: s.atk,
    hp: s.hp,
    maxHp: s.hp,
    turn: 0,
    affixes: [],
    statuses: [],
    bossId: boss?.id,
    phaseIndex: 0,
    ...over,
  };
}

describe('every enemy has an intent', () => {
  /** The damage a floor-1 fight lands on a level-1 companion (DEF 4) for each of the 16 species. */
  const EXPECTED: Record<string, number> = {
    tollbug: 5,
    mossbite: 4,
    rootsnarl: 8,
    sparkmoth: 9,
    cinderbeetle: 6,
    emberjaw: 8,
    smolderhusk: 5,
    shadewisp: 8,
    umbraclaw: 9,
    voidveil: 8,
    thornheart: 5,
    cindermaw: 8,
    veilweaver: 8,
    thorncrown: 5,
    ashwrought: 7,
    umbralmonarch: 9,
  };

  it('covers the whole bestiary', () => {
    expect(Object.keys(EXPECTED)).toHaveLength([...ENEMIES, ...ELITES, ...BOSSES].length);
  });

  for (const id of Object.keys(EXPECTED)) {
    it(`${EXPECTED[id]} from ${id} on its opening action`, () => {
      const intent = enemyIntent(foe(id), defence);
      expect(intent.next.kind).toBe('strike');
      expect(intent.next.damage!.likely).toBe(EXPECTED[id]);
      expect(intent.next.damage!.min).toBe(EXPECTED[id] - 1);
      expect(intent.next.damage!.max).toBe(EXPECTED[id] + 1);
      expect(intent.next.label).not.toBe('');
    });
  }

  it('names the companion-defence numbers the same way the engine does', () => {
    const intent = enemyIntent(foe('tollbug'), defence);
    expect(intent.next.sum).toEqual(incomingBreakdown(intent.next.input!));
    expect(intent.next.input).toEqual<IncomingInput>({
      atk: 9,
      def: 4,
      variance: 0,
      damageReduction: 0,
      shield: 0,
      hp: 60,
    });
  });

  it('spreads the swing by the −1 / 0 / +1 variance and nothing else', () => {
    const intent = enemyIntent(foe('tollbug'), defence);
    for (const variance of [-1, 0, 1]) {
      expect(incomingBreakdown({ ...intent.next.input!, variance }).dealt).toBe(
        variance === -1 ? 4 : variance === 0 ? 5 : 6,
      );
    }
  });

  it('reports 0 when a shield pool soaks the whole hit', () => {
    const intent = enemyIntent(foe('tollbug'), { ...defence, shield: 6 });
    expect(intent.next.damage!.likely).toBe(0);
    expect(intent.next.sum!.absorbed).toBe(5);
    expect(intent.next.sum!.damage).toBe(5);
  });

  it('shows the minimum the engine floors a worthless attack at', () => {
    const intent = enemyIntent(foe('tollbug', { atk: 3 }), { def: 10, hp: 60 });
    expect(intent.next.damage!.likely).toBe(1);
    expect(intent.next.sum!.clamped).toBe(true);
  });

  it('applies damage reduction to the number it prints', () => {
    const intent = enemyIntent(foe('tollbug'), { ...defence, damageReduction: 20 });
    expect(intent.next.damage!.likely).toBe(4);
  });
});

describe('affix behaviour in the intent', () => {
  it('scales an enraged enemy over its HP threshold, same rule as the engine', () => {
    // The engine enrages below 30% max HP: rootsnarl at 9/33 hits with 12 × 1.5 = 18.
    const low = enemyIntent(foe('rootsnarl', { hp: 9, affixes: ['enraged'] }), defence);
    expect(low.next.damage!.likely).toBe(14);
    const high = enemyIntent(foe('rootsnarl', { hp: 10, affixes: ['enraged'] }), defence);
    expect(high.next.damage!.likely).toBe(8);
  });

  it('promises the second swing of a frenzied enemy at 60% ATK', () => {
    const intent = enemyIntent(foe('tollbug', { affixes: ['frenzied'] }), defence);
    expect(intent.next.kind).toBe('strike');
    expect(intent.then!.kind).toBe('double');
    expect(intent.then!.damage!.likely).toBe(1);
  });

  it('keeps a frenzied second swing at 1 even against a high DEF', () => {
    const intent = enemyIntent(foe('tollbug', { atk: 4, affixes: ['frenzied'] }), {
      def: 10,
      hp: 60,
    });
    expect(intent.next.damage!.likely).toBe(1);
    expect(intent.then!.damage!.likely).toBe(1);
  });

  it('says how much a vampiric enemy would drink back', () => {
    const intent = enemyIntent(foe('tollbug', { affixes: ['vampiric'] }), defence);
    const drain = intent.traits.find((t) => t.id === 'vampiric')!;
    expect(drain.detail).toContain('3');
  });

  it('warns about thorns before the player commits', () => {
    const intent = enemyIntent(foe('tollbug', { affixes: ['thorned'] }), defence);
    expect(intent.traits.find((t) => t.id === 'thorned')!.detail).toContain('2');
  });

  it('counts the shield a warded enemy still has', () => {
    const intent = enemyIntent(
      foe('tollbug', {
        affixes: ['warded'],
        statuses: [{ id: 'shield', stacks: 5, duration: 99 }],
      }),
      defence,
    );
    expect(intent.traits.find((t) => t.id === 'warded')!.detail).toContain('5');
  });

  it('gives the HP of the copy a splitting enemy leaves behind', () => {
    const intent = enemyIntent(foe('tollbug', { affixes: ['splitting'] }), defence);
    expect(intent.traits.find((t) => t.id === 'splitting')!.detail).toContain('13');
  });

  it('leaves the strike intent untouched on a plain enemy', () => {
    expect(enemyIntent(foe('tollbug'), defence).traits).toEqual([]);
  });
});

describe('boss cadence', () => {
  const thorncrown = BOSSES.find((b) => b.id === 'thorncrown')!;

  it('telegraphs on the first mechanic beat and lands it on the next', () => {
    const t3 = enemyIntent(foe('thorncrown', { turn: 3 }), defence);
    expect(t3.next.kind).toBe('telegraph');
    expect(t3.next.damage).toBeNull();
    expect(t3.then!.kind).toBe('mechanic');

    // Between the two, the boss still swings normally — the engine's real rhythm.
    expect(enemyIntent(foe('thorncrown', { turn: 4 }), defence).next.kind).toBe('strike');

    const t7 = enemyIntent(foe('thorncrown', { turn: 7 }), defence);
    expect(t7.next.kind).toBe('mechanic');
  });

  it('lands the mechanic with no variance, so the promise is exact', () => {
    const intent = enemyIntent(foe('thorncrown', { turn: 7 }), defence);
    // round(9 × 1.3) + 2 − 4 DEF = 10, and a mechanic never rolls variance.
    expect(intent.next.damage).toEqual({ min: 10, likely: 10, max: 10 });
    expect(intent.next.input!.variance).toBe(0);
    expect(intent.next.input!.mechanic).toEqual({ multiplier: 1.3, guard: false });
  });

  it('shows the guarded number too, because guard is the counter the player chooses', () => {
    const intent = enemyIntent(foe('thorncrown', { turn: 7 }), defence);
    expect(intent.next.damage!.likely).toBe(10);
    expect(intent.next.guarded).toBe(5);
    const braced = enemyIntent(foe('thorncrown', { turn: 7 }), { ...defence, guard: true });
    expect(braced.next.damage!.likely).toBe(5);
  });

  it('uses the multiplier of the phase the boss has entered', () => {
    const phase1 = enemyIntent(foe('thorncrown', { turn: 7, phaseIndex: 1 }), defence);
    expect(phase1.next.input!.mechanic!.multiplier).toBe(1.5);
    expect(phase1.next.damage!.likely).toBe(12);
    const phase2 = enemyIntent(foe('thorncrown', { turn: 7, phaseIndex: 2 }), defence);
    expect(phase2.next.input!.mechanic!.multiplier).toBe(1.8);
  });

  it('appends the Heat 3 phase to the cadence', () => {
    const intent = enemyIntent(foe('thorncrown', { turn: 7, phaseIndex: 3 }), defence, { heat: 3 });
    expect(intent.next.input!.mechanic!.multiplier).toBe(2.1);
  });

  it('names the mechanic for a studied boss and hides it otherwise', () => {
    const studied = enemyIntent(foe('thorncrown', { turn: 7 }), defence, { studied: true });
    expect(studied.next.label).toBe('Thorn Barrage');
    const unknown = enemyIntent(foe('thorncrown', { turn: 7 }), defence, { studied: false });
    expect(unknown.next.label).toBe('A heavy blow');
    expect(unknown.next.detail).not.toContain('Thorn Barrage');
  });

  it('keeps the same rhythm for the other two bosses', () => {
    for (const boss of BOSSES) {
      const every = boss.mechanicEvery;
      expect(enemyIntent(foe(boss.id, { turn: every - 1 }), defence).next.kind).toBe('telegraph');
      expect(enemyIntent(foe(boss.id, { turn: 2 * every - 1 }), defence).next.kind).toBe(
        'mechanic',
      );
    }
  });

  it('derives the armed flag from the beat number', () => {
    expect(mechanicArmed(4, thorncrown)).toBe(false);
    expect(mechanicArmed(8, thorncrown)).toBe(true);
    expect(mechanicArmed(12, thorncrown)).toBe(false);
    expect(mechanicArmed(5, thorncrown)).toBe(false);
  });
});

describe('statuses change the intent', () => {
  it('says a stunned enemy loses its action', () => {
    const intent = enemyIntent(
      foe('tollbug', { statuses: [{ id: 'stun', stacks: 1, duration: 1 }] }),
      defence,
    );
    expect(intent.next.kind).toBe('stunned');
    expect(intent.next.damage).toBeNull();
    expect(intent.then).toBeNull();
  });

  it('cancels an armed mechanic when the boss is stunned before it lands', () => {
    const intent = enemyIntent(
      foe('thorncrown', {
        turn: 7,
        statuses: [{ id: 'stun', stacks: 1, duration: 1 }],
      }),
      defence,
    );
    expect(intent.next.kind).toBe('stunned');
    expect(intent.then).toBeNull();
  });

  it('honours an explicit armed flag, since a stun or an interrupt can break the alternation', () => {
    // A mechanic interrupted before it lands re-arms on the following beat: the flag, not the parity,
    // is the truth mid-fight.
    expect(
      enemyIntent(foe('thorncrown', { turn: 3 }), defence, { telegraphArmed: true }).next.kind,
    ).toBe('mechanic');
    expect(
      enemyIntent(foe('thorncrown', { turn: 7 }), defence, { telegraphArmed: false }).next.kind,
    ).toBe('telegraph');
  });
});

describe('the intent matches the fight the engine actually runs', () => {
  function fight(species: string, kind: string, seed: number) {
    const run = newRun(seed, 1, 1, emptyMeta());
    const mods = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
    return { run, res: runCombat(run, { kind, enemies: [species] }, mods, 1) };
  }

  it('predicts an opening strike to the hit point', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const { run, res } = fight('tollbug', 'skirmish', seed);
      const hit = res.log.map(hitOf).find((h) => h !== null && h.side === 'enemy');
      if (!hit) continue;
      const input = hit.input as IncomingInput;
      // The seeded stream only sometimes rolls the middle of the swing, and a swing is the one part
      // of a hit a forecast cannot pin. Where it did, the forecast and the engine must agree exactly.
      if (input.variance !== 0) continue;
      const intent = enemyIntent(foe('tollbug'), {
        // DEF and reduction are fixed for the fight, so the forecast predicts them; the shield pool
        // and HP are whatever the round had already spent, so they come from the record.
        def: input.def,
        hp: input.hp,
        shield: input.shield,
        damageReduction: input.damageReduction,
      });
      expect(input.def, 'companion DEF the forecast predicts').toBe(4);
      expect(input.damageReduction).toBe(0);
      expect(input.hp, 'the companion takes its first hit of the fight').toBe(run.unit.hp);
      expect(intent.next.input).toEqual(input);
      expect(intent.next.sum).toEqual(hit.sum);
      expect(intent.next.damage!.likely).toBe(hit.sum.dealt);
      checked += 1;
    }
    expect(checked, 'expected a middle-of-the-swing opening hit in 40 seeds').toBeGreaterThan(0);
  });

  it('lands the boss mechanic on the beat it promised, for the damage it promised', () => {
    const { res } = fight('thorncrown', 'boss', 7);
    const mechanic = res.log
      .map(hitOf)
      .filter((h) => h !== null && h.side === 'enemy' && (h.input as IncomingInput).mechanic)[0]!;
    expect(mechanic, 'expected the boss to land a mechanic').toBeTruthy();
    const input = mechanic.input as IncomingInput;
    expect(mechanic.round % thorncrown().mechanicEvery).toBe(0);
    const intent = enemyIntent(foe('thorncrown', { turn: mechanic.round - 1 }), {
      def: input.def,
      hp: input.hp,
      shield: input.shield,
      damageReduction: input.damageReduction,
      guard: !!input.mechanic?.guard,
    });
    expect(intent.next.kind).toBe('mechanic');
    expect(intent.next.input).toEqual(input);
    expect(intent.next.sum).toEqual(mechanic.sum);
    expect(intent.next.damage!.likely).toBe(mechanic.sum.dealt);
  });

  it('never lets the telegraph drift from the beat the engine used', () => {
    const boss = thorncrown();
    const landed: number[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { res } = fight('thorncrown', 'boss', seed);
      // A stun or an interrupted telegraph shifts the alternation by one beat, which is the engine's
      // own state rather than a forecastable rhythm — those fights are excluded, not averaged away.
      if (res.log.some((l) => /stun|interrupt/i.test(l.text))) continue;
      for (const h of res.log.map(hitOf)) {
        if (h && h.side === 'enemy' && (h.input as IncomingInput).mechanic) landed.push(h.round);
      }
    }
    expect(landed.length).toBeGreaterThan(0);
    for (const round of landed) {
      expect(round % boss.mechanicEvery, `round ${round}`).toBe(0);
      expect(mechanicArmed(round, boss), `round ${round}`).toBe(true);
    }
  });

  function thorncrown() {
    return BOSSES.find((b) => b.id === 'thorncrown')!;
  }
});

describe('the intent reads as one line the player can act on', () => {
  it('states the swing and the number', () => {
    const intent: EnemyIntent = enemyIntent(foe('tollbug'), defence);
    expect(intent.name).toBe('Tollbug');
    expect(intent.next.detail).toContain('5');
  });

  it('states the threat of a telegraph before the damage exists', () => {
    const intent = enemyIntent(foe('ashwrought', { turn: 4 }), defence, { studied: true });
    expect(intent.next.detail).toContain('next');
    expect(intent.then!.damage!.likely).toBeGreaterThan(0);
  });
});
