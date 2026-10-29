/**
 * Gate 7d — the ten floor rules and the five boss rules, tested where they change an outcome.
 *
 * `delve-rules.test.ts` pins the helper arithmetic. This suite proves each rule reaches the engine:
 * a shop charges double, a rest heals nothing, a brace gives damage back, a Mark fades before the
 * next menu, a leader cannot be struck, and so on. Every floor-rule test pairs a ruled run with an
 * unruled one built from the same seed, so the difference asserted is the rule's and nothing else.
 *
 * The boss half drives real fights against the three Hollow bosses with basic swings at pinned
 * levels; each phase's rule is observed in the log after the phase line, not merely declared in the
 * data (that declaration is `delve-bosses.test.ts`'s job).
 */

import { describe, expect, it } from 'vitest';
import {
  builtinDecider,
  computeModifiers,
  emptyMeta,
  floorRuleFor,
  hitOf,
  newRun,
  resolveChoice,
  ruleDetail,
  ruleLabel,
  runCombat,
  spawnEnemies,
  stepRun,
  turnMenu,
  type AttackInput,
  type DelveMeta,
  type HitRecord,
  type RunState,
  type StepOutcome,
  type TurnOrder,
} from '../src/core/delve';
import { mkCtx, NO_SIGNALS, singleRowRun } from './delve-helpers';

const BASIC: TurnOrder = { skillId: null, targetIndex: 0, guard: false };
const GUARD: TurnOrder = { skillId: null, targetIndex: 0, guard: true };
const BASTION: TurnOrder = { skillId: 'warden-bastion', targetIndex: 0, guard: false };

/** The one-row room from the helpers, with its roster replaced. */
function roomWith(enemies: string[], over: Partial<RunState> = {}): RunState {
  const base = singleRowRun('skirmish', over);
  const room = base.floorPlan.rows[0]![0]!;
  return { ...base, floorPlan: { ...base.floorPlan, rows: [[{ ...room, enemies }]] } };
}

function open(run: RunState): { meta: DelveMeta; entry: StepOutcome } {
  const meta = emptyMeta();
  const entry = stepRun(run, mkCtx(meta));
  expect(entry.pause).toBeDefined();
  return { meta, entry };
}

function answer(meta: DelveMeta, from: StepOutcome, order: TurnOrder): StepOutcome {
  return stepRun(from.run, mkCtx(meta, { order }));
}

/** Play a one-room run to its end with basic swings and report the run as it settles. */
function playFight(run: RunState): RunState {
  const meta = emptyMeta();
  let out = stepRun(run, mkCtx(meta));
  for (let i = 0; i < 200 && out.pause; i++) out = stepRun(out.run, mkCtx(meta, { order: BASIC }));
  expect(out.pause).toBeUndefined();
  return out.run;
}

describe('a floor rule is announced and stored, then the next one replaces it', () => {
  it('prints floor one at run start and the new rule when the floor turns over', () => {
    const meta = emptyMeta();
    const start = singleRowRun('rest');
    const first = start.floorRule!;
    expect(start.log[0]!.text).toBe(`Floor 1 rule: ${ruleLabel(first)} — ${ruleDetail(first)}.`);

    const entered = stepRun(start, mkCtx(meta));
    const rested = resolveChoice(entered.run, mkCtx(meta), 'rest');
    expect(rested.run.floor).toBe(2);
    const second = rested.run.floorRule!;
    expect(second).toBe(floorRuleFor(rested.run.userSeed, rested.run.hollowId, 2));
    expect(
      rested.run.log.some(
        (line) => line.text === `Floor 2 rule: ${ruleLabel(second)} — ${ruleDetail(second)}.`,
      ),
    ).toBe(true);
  });
});

describe('floor rules change what the engine does', () => {
  it('no-rest-heal leaves a hurt companion at the door where a normal floor heals', () => {
    const hurt = {
      id: 'c',
      kind: 'companion',
      name: 'Warden',
      hp: 40,
      maxHp: 72,
      atk: 14,
      def: 5,
      spd: 8,
      luck: 5,
    };
    const rest = (rule: string | null) => {
      const meta = emptyMeta();
      const run = singleRowRun('rest', { floorRule: rule, unit: { ...hurt } });
      const entered = stepRun(run, mkCtx(meta));
      return resolveChoice(entered.run, mkCtx(meta), 'rest').run;
    };

    expect(rest(null).unit.hp).toBe(69);
    const ruled = rest('no-rest-heal');
    expect(ruled.unit.hp).toBe(40);
    expect(
      ruled.log.some((line) => line.text === 'Rested, but this floor offers no healing.'),
    ).toBe(true);
  });

  it('skills-cost-two lets a four-energy skill fire on the two energy a brace leaves', () => {
    const ruled = open(roomWith(['tollbug'], { floorRule: 'skills-cost-two' }));
    const pause = ruled.entry.pause!;
    expect(pause.state.energyCosts?.['warden-bastion']).toBe(2);
    const menu = turnMenu(ruled.entry.run, ruled.meta, NO_SIGNALS, pause);
    expect(menu.skills.find((skill) => skill.id === 'warden-bastion')!.cost).toBe('2 energy');

    const braced = answer(ruled.meta, ruled.entry, GUARD);
    // One from the new round, one from the enemy's swing: the brace itself costs nothing.
    expect(braced.pause!.state.energy).toBe(3);
    const cast = answer(ruled.meta, braced, BASTION);
    expect(cast.pause!.state.round).toBe(3);
    expect(cast.pause!.orders).toEqual([GUARD, BASTION]);
    expect(cast.pause!.log.some((line) => line.text.includes('use Bastion'))).toBe(true);

    const control = open(roomWith(['tollbug']));
    const controlBraced = answer(control.meta, control.entry, GUARD);
    const refused = answer(control.meta, controlBraced, BASTION);
    expect(refused.pause!.state.round).toBe(2);
    expect(refused.pause!.orders).toEqual([GUARD]);
  });

  it('crits-heal pays the enemy instead of doubling the blow', () => {
    const fight = (seed: number, rule: string | null) => {
      const run = { ...newRun(seed, 1, 8, emptyMeta()), floorRule: rule };
      const mods = {
        ...computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 }),
        critChance: 100,
      };
      const result = runCombat(run, { enemies: ['thorncrown'] }, mods, 6, [], [], {}, () => BASIC);
      const crit = result.log
        .map(hitOf)
        .find(
          (hit): hit is HitRecord =>
            hit !== null && hit.side === 'player' && hit.sum.crit && hit.round <= 2,
        );
      return { result, crit };
    };

    let seed = 0;
    let normal: { result: ReturnType<typeof runCombat>; crit: HitRecord | undefined } | undefined;
    for (let candidate = 1; candidate <= 120 && !normal; candidate++) {
      const attempt = fight(candidate, null);
      if (attempt.crit) {
        seed = candidate;
        normal = attempt;
      }
    }
    expect(normal).toBeDefined();
    const ruled = fight(seed, 'crits-heal');
    expect(ruled.crit).toBeDefined();

    expect((normal!.crit!.input as AttackInput).critMult).toBe(1.5);
    expect((ruled.crit!.input as AttackInput).critMult).toBe(1);
    expect(ruled.crit!.sum.dealt).toBeLessThan(normal!.crit!.sum.dealt);
    expect(ruled.result.log.some((line) => line.text.includes('drinks back'))).toBe(true);
    expect(normal!.result.log.some((line) => line.text.includes('drinks back'))).toBe(false);
  });

  it('leader-guarded refuses the leader in the menu and in the engine, and the escort is legal', () => {
    const opened = open(roomWith(['tollbug', 'mossbite'], { floorRule: 'leader-guarded' }));
    const pause = opened.entry.pause!;
    expect(pause.state.targets.map((target) => target.guarded)).toEqual([true, false]);

    const menu = turnMenu(opened.entry.run, opened.meta, NO_SIGNALS, pause);
    expect(menu.attack.targets[0]!.refused).toBe('The leader is guarded while its escort stands.');
    expect(menu.attack.targets[1]!.refused).toBe('');
    expect(builtinDecider(pause.state).targetIndex).toBe(1);

    const blocked = answer(opened.meta, opened.entry, BASIC);
    expect(blocked.pause!.state.round).toBe(1);
    expect(blocked.run.orders).toEqual([]);

    const escort = { ...BASIC, targetIndex: 1 };
    const swung = answer(opened.meta, opened.entry, escort);
    expect(swung.pause!.state.round).toBe(2);
    expect(swung.run.orders).toEqual([escort]);
  });

  it('mark-one-round fades a skill’s Mark before the next menu can price it', () => {
    const cast = (rule: string | null) => {
      const meta = emptyMeta();
      const run = singleRowRun('skirmish', { floorRule: rule, moveset: ['broker-marktrade'] });
      let out = stepRun(run, mkCtx(meta));
      out = answer(meta, out, GUARD);
      out = answer(meta, out, GUARD);
      out = answer(meta, out, { skillId: 'broker-marktrade', targetIndex: 0, guard: false });
      return out.pause!;
    };

    const control = cast(null);
    const ruled = cast('mark-one-round');
    expect(control.enemies[0]!.statuses.find((status) => status.id === 'mark')?.duration).toBe(1);
    expect(control.state.targets[0]!.marked).toBe(true);
    expect(ruled.enemies[0]!.statuses.some((status) => status.id === 'mark')).toBe(false);
    expect(ruled.state.targets[0]!.marked).toBe(false);
  });

  it('swift-weak spawns a faster, weaker roster from the one spawn function both views use', () => {
    const normal = spawnEnemies({ enemies: ['tollbug'] }, 1, 0, null)[0]!;
    const swift = spawnEnemies({ enemies: ['tollbug'] }, 1, 0, 'swift-weak')[0]!;
    expect(swift.spd).toBe(normal.spd + 4);
    expect(swift.atk).toBe(Math.max(1, normal.atk - 2));
  });

  it('market-flip doubles the shop’s prices and a won fight’s material drops', () => {
    const shop = (rule: string | null) => {
      const meta = emptyMeta();
      // A second row keeps the floor from ending on the purchase, so the price is the only thing the
      // run's Glint loses; floor-end interest is a different mechanic's line.
      const run = singleRowRun('shop', {
        floorRule: rule,
        glint: 100,
        floorPlan: {
          floor: 1,
          rows: [
            [{ id: 'x0r0c0', kind: 'shop', enemies: [], optionSeed: 0 }],
            [{ id: 'x0r1c0', kind: 'rest', enemies: [], optionSeed: 0 }],
          ],
        },
      });
      const entered = stepRun(run, mkCtx(meta));
      const bought = resolveChoice(entered.run, mkCtx(meta), 'heal');
      return 100 - bought.run.glint;
    };
    expect(shop(null)).toBe(40);
    expect(shop('market-flip')).toBe(80);

    const normal = playFight(singleRowRun('skirmish')).materials;
    const flip = playFight(singleRowRun('skirmish', { floorRule: 'market-flip' })).materials;
    expect(normal.ore + normal.herb + normal.echo).toBeGreaterThan(0);
    expect(flip).toEqual({
      ore: normal.ore * 2,
      herb: normal.herb * 2,
      echo: normal.echo * 2,
    });
  });

  it('guard-reflects gives a quarter of a braced blow back to the enemy', () => {
    const opened = open(roomWith(['tollbug'], { floorRule: 'guard-reflects' }));
    const pause = opened.entry.pause!;
    const menu = turnMenu(opened.entry.run, opened.meta, NO_SIGNALS, pause);
    expect(menu.guard.reflect).toBeGreaterThan(0);

    const before = pause.enemies[0]!.hp;
    const braced = answer(opened.meta, opened.entry, GUARD);
    const line = braced.pause!.log.find((entry) => entry.text.includes('from your guard'));
    expect(line).toBeDefined();
    const reflected = Number(line!.text.match(/takes (\d+) from your guard/)![1]);
    expect(reflected).toBe(Math.max(1, Math.round(menu.guard.reflect)));
    expect(braced.pause!.enemies[0]!.hp).toBe(before - reflected);

    const control = open(roomWith(['tollbug']));
    const plain = answer(control.meta, control.entry, GUARD);
    expect(plain.pause!.log.some((entry) => entry.text.includes('from your guard'))).toBe(false);
  });

  it('elements-invert trades a resisted frost strike for a weakness bonus', () => {
    const cast = (rule: string | null) => {
      const meta = emptyMeta();
      const run = roomWith(['mossbite'], { floorRule: rule });
      let out = stepRun(run, mkCtx(meta));
      for (let i = 0; i < 3; i++) out = answer(meta, out, GUARD);
      out = answer(meta, out, BASTION);
      const hit = out
        .pause!.log.map(hitOf)
        .find(
          (record): record is HitRecord =>
            record !== null && record.side === 'player' && record.skillId === 'warden-bastion',
        );
      return { pause: out.pause!, hit };
    };

    const normal = cast(null);
    const inverted = cast('elements-invert');
    expect(normal.hit).toBeDefined();
    expect(inverted.hit).toBeDefined();
    expect((normal.hit!.input as AttackInput).elementMult).toBe(0.75);
    expect((inverted.hit!.input as AttackInput).elementMult).toBe(1.25);
    expect(inverted.hit!.sum.dealt).toBeGreaterThan(normal.hit!.sum.dealt);
    expect(inverted.pause.log.some((entry) => entry.text.startsWith('Inverted elements!'))).toBe(
      true,
    );
    expect(normal.pause.log.some((entry) => entry.text.startsWith('Inverted elements!'))).toBe(
      false,
    );
  });
});

describe('boss phases add rules the fight can see', () => {
  function fight(
    boss: 'thorncrown' | 'ashwrought' | 'umbralmonarch',
  ): ReturnType<typeof runCombat> {
    const hollow = boss === 'thorncrown' ? 1 : boss === 'ashwrought' ? 2 : 3;
    const level = boss === 'umbralmonarch' ? 12 : 10;
    const run = { ...newRun(4242, hollow, level, emptyMeta()), floorRule: null };
    return runCombat(
      run,
      { enemies: [boss] },
      computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 }),
      6,
      [],
      [boss],
      {},
      () => BASIC,
    );
  }

  const indexOf = (log: ReturnType<typeof runCombat>['log'], needle: string): number =>
    log.findIndex((line) => line.text.includes(needle));

  it('thorns cuts the companion after Bramble Armor, never before it', () => {
    const result = fight('thorncrown');
    const phase = indexOf(result.log, 'enters Bramble Armor');
    const firstThorn = indexOf(result.log, 'thorns cut you for 2.');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(firstThorn).toBeGreaterThan(phase);
    for (const line of result.log.filter((entry) => entry.text.includes('thorns cut you'))) {
      expect(line.text).toContain('thorns cut you for 2.');
    }
  });

  it('shields-itself puts eight Shield up at Molten Shell and the next hit eats it', () => {
    const result = fight('ashwrought');
    const phase = indexOf(result.log, 'enters Molten Shell');
    const absorbed = indexOf(result.log, 'shield absorbs 8.');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(absorbed).toBeGreaterThan(phase);
    expect(result.log.some((line) => line.text.includes('−8 Shield'))).toBe(true);
  });

  it('strikes-twice adds a second blow only once Cold Forge begins', () => {
    const result = fight('ashwrought');
    const phase = indexOf(result.log, 'enters Cold Forge');
    const second = indexOf(result.log, 'strikes again for');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(phase);
    expect(result.log.slice(0, phase).some((line) => line.text.includes('strikes again'))).toBe(
      false,
    );
    expect(result.log.filter((line) => line.text.includes('strikes again')).length).toBeGreaterThan(
      1,
    );
  });

  it('marks-you leaves the companion Marked after Starless Crown, raising later blows', () => {
    const result = fight('umbralmonarch');
    const phase = indexOf(result.log, 'enters Starless Crown');
    const mark = indexOf(result.log, 'marks you.');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(mark).toBeGreaterThan(phase);
    expect(result.log.some((line) => line.text.includes('×1.25 Mark'))).toBe(true);
  });

  it('drains drinks back HP after Devouring Dark', () => {
    const result = fight('umbralmonarch');
    const phase = indexOf(result.log, 'enters Devouring Dark');
    const drain = indexOf(result.log, 'drains');
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(drain).toBeGreaterThan(phase);
    expect(result.log.filter((line) => line.text.includes('drains')).length).toBeGreaterThan(1);
  });
});
