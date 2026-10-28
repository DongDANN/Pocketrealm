/**
 * Gate 7b-5 — the menu's numbers are the engine's numbers.
 *
 * DELVE_REDESIGN §4 A.3: "The number shown is the number computed — the sum is produced by the same
 * function that resolves the hit, not by a UI-side reimplementation." These tests hold the menu to
 * that by scanning seeds until the engine's roll is neutral (no variance, no crit) and then asserting
 * the price the menu printed is the breakdown the engine logged — for a basic attack, an active
 * skill, and a braced blow.
 *
 * The rest covers the menu-only facts: readiness with its reason, per-blow brace sums, the living
 * roster the orders index, honest Item refusals, and that the menu is a pure function of the pause,
 * so a reload reopens the same panel without a write.
 */

import { describe, expect, it } from 'vitest';
import {
  damageSumText,
  emptyMeta,
  hitOf,
  stepRun,
  turnMenu,
  type AttackInput,
  type CombatPause,
  type DelveMeta,
  type HitRecord,
  type IncomingInput,
  type RunState,
  type StepOutcome,
  type TurnMenu,
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

interface Opened {
  run: RunState;
  meta: DelveMeta;
  entry: StepOutcome;
}

/** A run standing before the room, its pause waiting at round one. */
function open(enemies: string[], seed: number): Opened {
  const run = roomWith(enemies, { runId: `d1-${seed.toString(16)}-1` });
  const meta = emptyMeta();
  const entry = stepRun(run, mkCtx(meta, { play: true }));
  expect(entry.pause).toBeDefined();
  return { run, meta, entry };
}

function answer(opened: Opened, from: StepOutcome, order: TurnOrder): StepOutcome {
  return stepRun(from.run, mkCtx(opened.meta, { play: true, order }));
}

function playerHits(pause: CombatPause): HitRecord[] {
  return pause.log
    .map(hitOf)
    .filter((hit): hit is HitRecord => hit !== null && hit.side === 'player');
}

function clonePause(pause: CombatPause): CombatPause {
  return JSON.parse(JSON.stringify(pause)) as CombatPause;
}

describe('the price is the computation', () => {
  it('prints the exact breakdown the engine logs for a basic attack', () => {
    let found: (Opened & { menu: TurnMenu; hit: HitRecord }) | undefined;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const opened = open(['tollbug'], seed);
      const after = answer(opened, opened.entry, BASIC);
      const hit = after.pause
        ? playerHits(after.pause).find((record) => record.round === 1)
        : undefined;
      if (!hit) continue;
      const input = hit.input as AttackInput;
      if (input.variance !== 0 || hit.sum.crit) continue;
      found = {
        ...opened,
        menu: turnMenu(opened.run, opened.meta, NO_SIGNALS, opened.entry.pause!),
        hit,
      };
    }
    expect(found).toBeDefined();

    const price = found!.menu.attack.targets[0]!;
    expect(price.sum).toEqual(found!.hit.sum);
    expect(price.sumText).toBe(damageSumText(found!.hit.sum));
    expect(price.likely).toBe(found!.hit.sum.dealt);
    expect(price.min).toBeLessThanOrEqual(price.likely);
    expect(price.max).toBeGreaterThanOrEqual(price.likely);
  });

  it('prints the exact breakdown the engine logs for an active skill', () => {
    let found: (Opened & { menu: TurnMenu; hit: HitRecord }) | undefined;
    for (let seed = 1; seed < 600 && !found; seed++) {
      const opened = open(['tollbug', 'tollbug'], seed);
      const first = answer(opened, opened.entry, BASIC);
      if (!first.pause) continue;
      const menu = turnMenu(opened.run, opened.meta, NO_SIGNALS, first.pause);
      const skill = menu.skills.find((action) => action.id === 'warden-bastion')!;
      if (!skill.ready) continue;
      const second = answer(opened, first, BASTION);
      const hit = second.pause
        ? playerHits(second.pause).find((record) => record.skillId === 'warden-bastion')
        : undefined;
      if (!hit) continue;
      const input = hit.input as AttackInput;
      if (input.variance !== 0 || hit.sum.crit) continue;
      found = { ...opened, menu, hit };
    }
    expect(found).toBeDefined();

    const skill = found!.menu.skills.find((action) => action.id === 'warden-bastion')!;
    const price = skill.targets[0]!;
    expect(price.sum).toEqual(found!.hit.sum);
    expect(price.sumText).toBe(damageSumText(found!.hit.sum));
    // A skill is priced with its own power and element, not as a basic swing.
    expect(found!.hit.skillId).toBe('warden-bastion');
    expect(price.sum).not.toEqual(found!.menu.attack.targets[0]!.sum);
  });

  it('prices a brace by the halving the engine applies to the same blow', () => {
    let found:
      | (Opened & { menu: TurnMenu; hit: HitRecord; line: TurnMenu['guard']['lines'][number] })
      | undefined;
    for (let seed = 1; seed < 600 && !found; seed++) {
      const opened = open(['tollbug', 'mossbite'], seed);
      const menu = turnMenu(opened.run, opened.meta, NO_SIGNALS, opened.entry.pause!);
      const after = answer(opened, opened.entry, GUARD);
      const hit = after.pause
        ? after.pause.log
            .map(hitOf)
            .find(
              (record): record is HitRecord =>
                record !== null && record.side === 'enemy' && record.actor === 'Mossbite',
            )
        : undefined;
      if (!hit) continue;
      if ((hit.input as IncomingInput).variance !== 0) continue;
      const line = menu.guard.lines.find((entry) => entry.name === 'Mossbite')!;
      found = { ...opened, menu, hit, line };
    }
    expect(found).toBeDefined();

    const input = found!.hit.input as IncomingInput;
    expect(input.guard).toBe(true);
    expect(found!.hit.sum.terms.some((term) => term.label === 'Guard')).toBe(true);
    expect(found!.line.braced).toBe(found!.hit.sum.dealt);
    expect(found!.line.sums[0]).toBe(damageSumText(found!.hit.sum));
    // The brace is worth something: the same blow unbraced costs more.
    expect(found!.line.unbraced).toBeGreaterThan(found!.line.braced);
  });
});

describe('what the menu says about each option', () => {
  it('turns an action ready only with energy and no cooldown, and says why not', () => {
    const { run, meta, entry } = open(['tollbug'], 1);
    const pause = clonePause(entry.pause!);
    const bastion = (menu: TurnMenu) =>
      menu.skills.find((action) => action.id === 'warden-bastion')!;

    expect(pause.state.energy).toBe(1);
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).ready).toBe(false);
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).reason).toBe(
      'Needs 4 energy; 1 in hand.',
    );
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).cost).toBe('4 energy');

    pause.state.energy = 4;
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).ready).toBe(true);
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).reason).toBe('');

    pause.state.cooldowns = { 'warden-bastion': 2 };
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).ready).toBe(false);
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).reason).toBe('Ready in 2 rounds.');

    pause.state.cooldowns = { 'warden-bastion': 1 };
    expect(bastion(turnMenu(run, meta, NO_SIGNALS, pause)).reason).toBe('Ready in 1 round.');
  });

  it('lists the unspent items and refuses to pretend one works mid-round', () => {
    const meta = emptyMeta();
    const run = roomWith(['tollbug'], {
      runId: 'd1-2a-1',
      consumables: ['shield-charm', 'fire-oil'],
      consumablesUsed: { 'shield-charm': true },
    });
    const entry = stepRun(run, mkCtx(meta, { play: true }));
    const menu = turnMenu(run, meta, NO_SIGNALS, entry.pause!);

    expect(menu.items.map((item) => item.id)).toEqual(['fire-oil']);
    expect(menu.items[0]!.name).toBe('Fire Oil');
    expect(menu.items[0]!.ready).toBe(false);
    expect(menu.items[0]!.reason).toBe('No item can be used mid-round yet.');
    expect(menu.items[0]!.targets).toEqual([]);
  });

  it('indices the living roster the same way the orders do', () => {
    const { run, meta, entry } = open(['tollbug', 'mossbite'], 1);
    const pause = clonePause(entry.pause!);
    pause.enemies[0]!.hp = 0;

    const menu = turnMenu(run, meta, NO_SIGNALS, pause);
    expect(menu.targets).toHaveLength(1);
    expect(menu.targets[0]).toMatchObject({ index: 0, name: 'Mossbite', hp: pause.enemies[1]!.hp });
    expect(menu.intents[0]!.targetIndex).toBe(0);
    expect(menu.attack.targets[0]!.targetIndex).toBe(0);
    expect(menu.attack.targets[0]!.name).toBe('Mossbite');
    // Mossbite's DEF (1), not the fallen Tollbug's (2), is the one subtracted.
    expect(menu.attack.targets[0]!.sum.terms.find((term) => term.label === 'DEF')!.value).toBe(1);
    expect(menu.guard.lines.map((line) => line.name)).toEqual(['Mossbite']);
  });

  it('prices from the room as it stands, not as it opened', () => {
    const opened = open(['tollbug'], 2);
    const after = answer(opened, opened.entry, BASIC);
    const menu = turnMenu(opened.run, opened.meta, NO_SIGNALS, after.pause!);
    const enemy = after.pause!.enemies[0]!;

    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(menu.targets[0]!.hp).toBe(enemy.hp);
    expect(menu.attack.targets[0]!.hp).toBe(enemy.hp);
    expect(menu.attack.targets[0]!.afterHp).toBe(
      Math.max(0, enemy.hp - menu.attack.targets[0]!.likely),
    );
  });

  it('totals every braced blow, one line per living enemy', () => {
    const { run, meta, entry } = open(['tollbug', 'mossbite'], 1);
    const menu = turnMenu(run, meta, NO_SIGNALS, entry.pause!);

    expect(menu.guard.lines.map((line) => line.name)).toEqual(['Tollbug', 'Mossbite']);
    for (const line of menu.guard.lines) {
      expect(line.sums).toHaveLength(1);
      expect(line.sums[0]).toContain('Guard');
    }
    expect(menu.guard.unbraced).toBe(
      menu.guard.lines.reduce((total, line) => total + line.unbraced, 0),
    );
    expect(menu.guard.braced).toBe(
      menu.guard.lines.reduce((total, line) => total + line.braced, 0),
    );
  });
});

describe('the menu is rebuilt, never stored', () => {
  it('is a pure function of the pause, so a reload reopens the same menu', () => {
    const { run, meta, entry } = open(['tollbug', 'mossbite'], 3);
    const before = JSON.stringify(entry.pause);

    const first = turnMenu(run, meta, NO_SIGNALS, entry.pause!);
    const reloaded = turnMenu(run, meta, NO_SIGNALS, clonePause(entry.pause!));

    expect(reloaded).toEqual(first);
    expect(JSON.stringify(entry.pause)).toBe(before);
    expect(first.round).toBe(entry.pause!.state.round);
    expect(first.energy).toBe(entry.pause!.state.energy);
    expect(first.hp).toBe(entry.pause!.state.hp);
    expect(first.maxHp).toBe(entry.pause!.state.maxHp);
    expect(first.shield).toBe(entry.pause!.shield);
  });
});
