/**
 * Gate 7g — the pure models behind the Pokémon-shaped battle screen.
 *
 * Nothing here draws. These functions decide what the plates say, how many cells a bar fills and
 * which window is open; the screen only places the result. That split matters for the same reason
 * `delveCollection.ts` has one: the numbers on a plate must be the numbers the engine priced, and a
 * colour zone must be a rule rather than a guess in JSX.
 */

import { describe, expect, it } from 'vitest';
import type {
  TurnAction,
  TurnIntentView,
  TurnMenu,
  TurnTargetView,
} from '../../src/core/delve/turn';
import {
  attackBreakdown,
  damageSumText,
  type AttackInput,
  type DamageBreakdown,
} from '../../src/core/delve/damage';
import type { RecapRow } from '../../src/ui/lib/delveReadout';
import {
  allyPlate,
  dialogQueue,
  enemyPlate,
  hpBar,
  hpZone,
  typedShown,
} from '../../src/ui/lib/battleHud';
import {
  BATTLE_COMMANDS,
  backFocus,
  initialFocus,
  openCommand,
  viewRows,
  viewTitle,
  type BattleCommand,
} from '../../src/ui/lib/battleMenu';

/** A real priced roll, so the sum text in these tests is the engine's own arithmetic. */
const INPUT: AttackInput = {
  atk: 10,
  power: 1,
  def: 3,
  variance: 0,
  crit: false,
  critMult: 1.5,
  burningBonus: 0,
  targetBurning: false,
  markMult: 1,
  elementMult: 1,
  masteryLvl: 0,
  eliteBonus: 0,
  targetElite: false,
  shield: 0,
  hp: 20,
};
const BREAKDOWN: DamageBreakdown = attackBreakdown(INPUT);
const SUM = damageSumText(BREAKDOWN);

function target(over: Partial<TurnTargetView> = {}): TurnTargetView {
  return {
    index: 0,
    name: 'Tollbug',
    hp: 12,
    maxHp: 20,
    def: 3,
    marked: false,
    weakness: 'ember',
    ...over,
  };
}

function intent(over: Partial<TurnIntentView> = {}): TurnIntentView {
  return {
    targetIndex: 0,
    label: 'It will bite',
    detail: 'Bite',
    span: '5 (4–6)',
    sum: SUM,
    traits: [],
    ...over,
  };
}

function action(over: Partial<TurnAction> = {}): TurnAction {
  return {
    kind: 'skill',
    id: 'ember-jab',
    name: 'Ember Jab',
    cost: '1 energy',
    ready: true,
    reason: '',
    targets: [
      {
        targetIndex: 0,
        name: 'Tollbug',
        hp: 12,
        likely: 9,
        min: 8,
        max: 10,
        afterHp: 3,
        sum: BREAKDOWN,
        sumText: SUM,
        notes: [],
      },
    ],
    ...over,
  };
}

function menu(over: Partial<TurnMenu> = {}): TurnMenu {
  return {
    round: 2,
    energy: 3,
    hp: 18,
    maxHp: 24,
    shield: 0,
    targets: [target()],
    intents: [intent()],
    skills: [action()],
    attack: action({ kind: 'attack', id: null, name: 'Strike', cost: 'free' }),
    guard: { lines: [], unbraced: 5, braced: 3 },
    items: [],
    ...over,
  };
}

describe('the HP bar', () => {
  it('fills whole cells only, so the bar cannot blur between pixels', () => {
    const bar = hpBar(12, 20, 10);
    expect(bar.pct).toBe(60);
    expect(bar.cells).toBe(10);
    expect(bar.filled).toBe(6);
    expect(bar.label).toBe('12/20 HP');
  });

  it('rounds a part-full cell down, never up', () => {
    // 19/20 is 95% — 9.5 cells, and a half cell is not a pixel.
    expect(hpBar(19, 20, 10).filled).toBe(9);
    expect(hpBar(1, 20, 10).filled).toBe(0);
  });

  it('shows an empty bar rather than dividing by zero', () => {
    expect(hpBar(0, 0, 10)).toMatchObject({ pct: 0, filled: 0, zone: 'danger' });
  });

  it('changes zone at the classic two thresholds', () => {
    expect(hpZone(100)).toBe('ok');
    expect(hpZone(50)).toBe('ok');
    expect(hpZone(49)).toBe('warn');
    expect(hpZone(20)).toBe('warn');
    expect(hpZone(19)).toBe('danger');
    expect(hpZone(0)).toBe('danger');
  });

  it('takes the zone from the bar it belongs to', () => {
    expect(hpBar(3, 20).zone).toBe('danger');
    expect(hpBar(9, 20).zone).toBe('warn');
    expect(hpBar(15, 20).zone).toBe('ok');
  });
});

describe('the enemy plate', () => {
  it('prints the name, the HP bar and the defence line the fight priced', () => {
    const plate = enemyPlate(target(), intent(), false);
    expect(plate.name).toBe('Tollbug');
    expect(plate.tag).toBe('');
    expect(plate.bar.label).toBe('12/20 HP');
    expect(plate.defLine).toBe('DEF 3 · Weak to ember');
    expect(plate.intent).toBe('It will bite for 5 (4–6)');
    expect(plate.sum).toBe(SUM);
    expect(plate.traits).toEqual([]);
    expect(plate.boss).toBe(false);
  });

  it('marks a boss as one and keeps its third line intact', () => {
    const plate = enemyPlate(target({ name: 'The Toll Warden' }), intent(), true);
    expect(plate.boss).toBe(true);
    expect(plate.tag).toBe('BOSS');
  });

  it('prints an intent with no span as the label alone', () => {
    const plate = enemyPlate(target(), intent({ span: '', sum: '' }), false);
    expect(plate.intent).toBe('It will bite');
    expect(plate.sum).toBe('');
  });

  it('carries the marks and traits the engine flagged', () => {
    const plate = enemyPlate(
      target({ marked: true }),
      intent({ traits: ['Burning', 'Enraged'] }),
      false,
    );
    expect(plate.defLine).toBe('DEF 3 · Weak to ember · Marked');
    expect(plate.traits).toEqual(['Burning', 'Enraged']);
  });
});

describe('the ally plate', () => {
  it('prints the companion as a Pokémon party member would be', () => {
    const plate = allyPlate({
      name: 'Warden',
      level: 7,
      hp: 18,
      maxHp: 24,
      shield: 4,
      energy: 3,
    });
    expect(plate.name).toBe('Warden');
    expect(plate.levelLabel).toBe('Lv 7');
    expect(plate.bar.label).toBe('18/24 HP');
    expect(plate.chips).toEqual(['Shield 4', '3 energy']);
  });

  it('leaves the shield chip out when there is no shield', () => {
    expect(
      allyPlate({ name: 'Spark', level: 1, hp: 24, maxHp: 24, shield: 0, energy: 2 }).chips,
    ).toEqual(['2 energy']);
  });
});

describe('the dialog queue', () => {
  function row(over: Partial<RecapRow> = {}): RecapRow {
    return {
      round: 1,
      actor: 'Warden',
      target: 'Tollbug',
      sum: SUM,
      dealt: BREAKDOWN.dealt,
      crit: false,
      side: 'player',
      ...over,
    };
  }

  it('turns each landed hit into one spoken line', () => {
    const queue = dialogQueue({ rows: [row()], omitted: 0 });
    expect(queue).toHaveLength(1);
    expect(queue[0]!.text).toBe(`Warden → Tollbug · ${SUM}`);
    expect(queue[0]!.tone).toBe('player');
  });

  it('says CRIT before a line that crit, and keeps the enemy side rose', () => {
    const queue = dialogQueue({
      rows: [row({ crit: true, side: 'enemy', actor: 'Tollbug', target: 'Warden' })],
      omitted: 0,
    });
    expect(queue[0]!.text.startsWith('CRIT Tollbug → Warden')).toBe(true);
    expect(queue[0]!.tone).toBe('enemy');
  });

  it('opens with the beats the recap left out, so nothing silently vanishes', () => {
    const queue = dialogQueue({ rows: [row()], omitted: 3 });
    expect(queue[0]!.tone).toBe('system');
    expect(queue[0]!.text).toBe('3 earlier blows not shown.');
  });

  it('is empty when nothing has landed yet', () => {
    expect(dialogQueue({ rows: [], omitted: 0 })).toEqual([]);
  });
});

describe('the typewriter', () => {
  it('shows nothing at zero and everything at the end', () => {
    expect(typedShown('Hello', 0, 20)).toEqual({ shown: '', done: false });
    expect(typedShown('Hello', 250, 20)).toEqual({ shown: 'Hello', done: true });
  });

  it('counts in whole characters', () => {
    // 20 chars per second over 125ms is 2.5 characters — the field shows two.
    expect(typedShown('Hello', 125, 20)).toEqual({ shown: 'He', done: false });
  });

  it('treats an empty line as already done', () => {
    expect(typedShown('', 0, 20)).toEqual({ shown: '', done: true });
  });
});

describe('the command window', () => {
  it('opens on four commands, in the order a battle screen uses', () => {
    expect(BATTLE_COMMANDS.map((c) => c.label)).toEqual(['SKILL', 'STRIKE', 'GUARD', 'ITEM']);
    expect(initialFocus()).toEqual({ view: 'root', skillId: null });
  });

  it('swaps a window in place and can step back to the root', () => {
    const moves = openCommand(initialFocus(), 'skills');
    expect(moves.view).toBe('moves');
    expect(backFocus(moves)).toEqual({ view: 'root', skillId: null });
  });

  it('remembers which skill a target list belongs to', () => {
    const targets = openCommand(openCommand(initialFocus(), 'skills'), 'skill:ember-jab');
    expect(targets).toEqual({ view: 'targets', skillId: 'ember-jab' });
    expect(backFocus(targets).view).toBe('moves');
  });

  it('back from a root-level window returns to the root', () => {
    const items = openCommand(initialFocus(), 'items');
    expect(backFocus(items).view).toBe('root');
  });

  it('prints the round in the root title', () => {
    expect(viewTitle(initialFocus(), menu())).toBe('Round 2 · Choose an order.');
    expect(viewTitle({ view: 'moves', skillId: null }, menu())).toBe(
      'Choose a skill, Strike or Guard.',
    );
    expect(viewTitle({ view: 'targets', skillId: 'ember-jab' }, menu())).toBe(
      'Ember Jab · choose a target.',
    );
    expect(viewTitle({ view: 'items', skillId: null }, menu())).toBe('Bag.');
  });

  it('lists the four commands as rows that always open', () => {
    const rows = viewRows(initialFocus(), menu());
    expect(rows.map((r) => r.id)).toEqual(['skills', 'strike', 'guard', 'items']);
    expect(rows.every((r) => !r.disabled)).toBe(true);
  });

  it('prices every move row from the menu it was handed', () => {
    const rows = viewRows({ view: 'moves', skillId: null }, menu());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Ember Jab');
    expect(rows[0]!.detail).toBe('1 energy · likely 9 (8–10)');
    expect(rows[0]!.disabled).toBe(false);
    // Picking a move opens the target window; it cannot commit a target on its own.
    expect(rows[0]!.order).toBe(null);
  });

  it('keeps a refused move visible with the reason the engine gave', () => {
    const rows = viewRows(
      { view: 'moves', skillId: null },
      menu({ skills: [action({ ready: false, reason: 'Needs 2 energy' })] }),
    );
    expect(rows[0]!.disabled).toBe(true);
    expect(rows[0]!.detail).toBe('1 energy · Needs 2 energy · likely 9 (8–10)');
  });

  it('offers a target row per enemy, with the likely number and the HP after', () => {
    const rows = viewRows({ view: 'targets', skillId: 'ember-jab' }, menu());
    expect(rows[0]!.label).toBe('Tollbug');
    expect(rows[0]!.detail).toBe('likely 9 (8–10) · 3 HP after');
    expect(rows[0]!.sum).toBe(SUM);
    expect(rows[0]!.order).toEqual({ skillId: 'ember-jab', targetIndex: 0, guard: false });
  });

  it('carries the notes that explain a price, without rewriting the sum', () => {
    const target = action().targets[0]!;
    const noted = action({
      targets: [{ ...target, notes: ['Weakness ×1.5', '2 Shield first'] }],
    });
    const rows = viewRows({ view: 'targets', skillId: 'ember-jab' }, menu({ skills: [noted] }));
    expect(rows[0]!.notes).toEqual(['Weakness ×1.5', '2 Shield first']);
    // The notes say why the number is what it is; the number stays the engine's own string.
    expect(rows[0]!.sum).toBe(SUM);
  });

  it('names the strike as the attack when the targets belong to it', () => {
    const strike = openCommand(initialFocus(), 'strike');
    const rows = viewRows(strike, menu());
    expect(viewTitle(strike, menu())).toBe('Strike · choose a target.');
    expect(rows[0]!.order).toEqual({ skillId: null, targetIndex: 0, guard: false });
  });

  it('gives the guard window one row and its printed totals', () => {
    const focus = openCommand(initialFocus(), 'guard');
    const rows = viewRows(focus, menu());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('Brace');
    expect(rows[0]!.detail).toBe('5 → 3 incoming');
    expect(rows[0]!.order).toEqual({ skillId: null, targetIndex: 0, guard: true });
  });

  it('prints the bag rows the turn menu holds, all refused with their reasons', () => {
    const items = [
      action({
        kind: 'item',
        id: 'draught',
        name: 'Healing Draught',
        cost: '',
        ready: false,
        reason: 'Items have no rules mid-round yet',
        targets: [],
      }),
    ];
    const rows = viewRows({ view: 'items', skillId: null }, menu({ items }));
    expect(rows[0]!.label).toBe('Healing Draught');
    expect(rows[0]!.disabled).toBe(true);
    expect(rows[0]!.detail).toBe('Items have no rules mid-round yet');
    expect(rows[0]!.order).toBe(null);
  });

  it('says so in the bag when nothing is equipped', () => {
    const rows = viewRows({ view: 'items', skillId: null }, menu({ items: [] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.disabled).toBe(true);
    expect(rows[0]!.label).toBe('The bag is empty.');
    expect(rows[0]!.detail).toBe('Craft consumables in the Workshop.');
  });

  it('opens the moves window with the same four slots the run swings', () => {
    const many = [
      action({ id: 'a', name: 'A' }),
      action({ id: 'b', name: 'B' }),
      action({ id: 'c', name: 'C' }),
      action({ id: 'd', name: 'D' }),
    ];
    const rows = viewRows({ view: 'moves', skillId: null }, menu({ skills: many }));
    expect(rows).toHaveLength(4);
  });

  it('never calls a command with no row an open one', () => {
    const focus = openCommand(initialFocus(), 'items');
    const rows = viewRows(focus, menu());
    expect(rows.every((row) => row.order === null)).toBe(true);
  });

  it('exposes the four command ids as a closed set', () => {
    const ids: BattleCommand[] = ['skills', 'strike', 'guard', 'items'];
    expect(BATTLE_COMMANDS.map((c) => c.id)).toEqual(ids);
  });
});

/**
 * The browser suite reads a row through its aria-label, so the words e2e greps for are a contract
 * with `e2e/helpers.ts` (`likely N`, `N HP after`, `Brace: N damage becomes M`). Pinned here rather
 * than only in Playwright so a copy change fails in 200ms instead of five minutes.
 */
describe('the aria contract the hand-played suite reads', () => {
  it('labels a target row with the move, the enemy and the likely number', () => {
    const rows = viewRows({ view: 'targets', skillId: 'ember-jab' }, menu());
    expect(rows[0]!.aria).toBe(`Ember Jab Tollbug: likely 9, ${SUM}`);
  });

  it('labels the brace with the two totals it prints', () => {
    const rows = viewRows({ view: 'guard', skillId: null }, menu());
    expect(rows[0]!.aria).toBe('Brace: 5 damage becomes 3');
  });

  it('labels a refused move with its reason', () => {
    const rows = viewRows(
      { view: 'moves', skillId: null },
      menu({ skills: [action({ ready: false, reason: 'Needs 2 energy' })] }),
    );
    expect(rows[0]!.aria).toBe('Ember Jab — Needs 2 energy');
  });
});
