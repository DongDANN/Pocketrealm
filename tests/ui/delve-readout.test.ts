/**
 * Gate 7a — the readout on the Delve screen.
 *
 * The screen is allowed to print only numbers the engine itself computes. These tests hold that line by
 * comparing the readout against a resolved room: the DEF it forecasts is the DEF the fight actually
 * subtracted, the HP it prints is the HP the first hit landed on, and whenever the seeded swing happened
 * to roll the middle, the threat number and the damage dealt are the same integer.
 */

import { describe, expect, it } from 'vitest';
import {
  computeModifiers,
  damageSumText,
  emptyMeta,
  hitOf,
  newRun,
  stepRun,
  type BudgetSignals,
  type IncomingInput,
  type RunState,
} from '../../src/core/delve';
import { recapOf, roomSwings, roomThreats } from '../../src/ui/lib/delveReadout';
import { mkCtx, singleRowRun } from '../delve-helpers';

const NO_SIGNALS: BudgetSignals = {
  checkedInToday: false,
  envelopesWithinAllowance: 0,
  contributedToGoalLast7d: false,
  reviewedLast7d: false,
};

/** A run standing in front of one room of the given kind, level 3 Warden, floor 1. */
function room(
  kind: 'skirmish' | 'elite' | 'boss' | 'rest',
  enemies: string[],
  affixes: string[] = [],
) {
  const base = newRun(11, 1, 3, emptyMeta());
  return {
    ...base,
    floorPlan: {
      floor: 1,
      rows: [[{ id: 'x0r0c0', kind, enemies, affixes, optionSeed: 0 }]],
    },
  } as RunState;
}

describe('the threat strip', () => {
  it('prices the room the engine is about to spawn, not a guess at the bestiary', () => {
    const rows = roomThreats(room('skirmish', ['tollbug']), emptyMeta(), NO_SIGNALS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Tollbug');
    expect(rows[0]!.hp).toBe(25);
    expect(rows[0]!.def).toBe(2);
    expect(rows[0]!.intent).toBe('Bites');
  });

  it('counts the shield and DEF the companion actually opens with', () => {
    const run = room('skirmish', ['tollbug']);
    const mods = computeModifiers(run, {}, { wardHp: 0, luckBonus: 0 });
    // Level 3 Warden: DEF 5, no shield from boons — Steadfast is what puts 1 on the pool.
    expect(mods.roomShield).toBe(0);
    const rows = roomThreats(run, emptyMeta(), NO_SIGNALS);
    expect(rows[0]!.shield).toBe(1);
    expect(rows[0]!.likely).toBe(3);
    expect(rows[0]!.damage).toBe('3 (2–4)');
    expect(rows[0]!.sum).toBe('ATK 9 −5 DEF −1 Shield = 3');
  });

  it('says nothing for a room that cannot hurt you', () => {
    expect(roomThreats(room('rest', []), emptyMeta(), NO_SIGNALS)).toEqual([]);
  });

  it('lists every enemy in the room', () => {
    const rows = roomThreats(
      room('skirmish', ['tollbug', 'mossbite', 'sparkmoth']),
      emptyMeta(),
      NO_SIGNALS,
    );
    expect(rows.map((r) => r.name)).toEqual(['Tollbug', 'Mossbite', 'Sparkmoth']);
    expect(rows.map((r) => r.likely)).toEqual([3, 2, 7]);
  });

  it('carries affix behaviour into the line the player reads', () => {
    const rows = roomThreats(
      room('elite', ['thornheart'], ['frenzied', 'thorned']),
      emptyMeta(),
      NO_SIGNALS,
    );
    expect(rows[0]!.followUp).toContain('second swing');
    expect(rows[0]!.traits.join(' ')).toContain('Cuts you for 2');
  });

  it('warns about the boss rhythm before the first beat arrives', () => {
    const rows = roomThreats(room('boss', ['thorncrown']), emptyMeta(), NO_SIGNALS);
    expect(rows[0]!.big).toBe(true);
    expect(rows[0]!.intent).toBe('Lashes');
    // The beat is public even while the mechanic keeps its name: only Boss Study gives that.
    expect(rows[0]!.followUp).toContain('on action 4');
    expect(rows[0]!.followUp).toContain('lands on action 8');
  });

  it('names a studied boss mechanic and keeps an unstudied one unnamed', () => {
    const studied = { ...emptyMeta(), bossKnowledge: ['thorncrown'] };
    const rows = roomThreats(room('boss', ['thorncrown']), studied, NO_SIGNALS);
    expect(rows[0]!.followUp).toContain('Thorn Barrage');
    const blind = roomThreats(room('boss', ['thorncrown']), emptyMeta(), NO_SIGNALS);
    expect(blind[0]!.followUp).not.toContain('Thorn Barrage');
    expect(blind[0]!.followUp).toContain('a heavy blow');
  });

  it('scales with the floor it is standing on', () => {
    const rows = roomThreats(
      { ...room('skirmish', ['tollbug']), floor: 4 },
      emptyMeta(),
      NO_SIGNALS,
    );
    expect(rows[0]!.hp).toBe(38);
    expect(rows[0]!.def).toBe(3);
  });

  it('heat makes the enemies hit harder, and the strip moves with it', () => {
    const hot = roomThreats({ ...room('skirmish', ['tollbug']), heat: 1 }, emptyMeta(), NO_SIGNALS);
    expect(hot[0]!.likely).toBeGreaterThan(
      roomThreats(room('skirmish', ['tollbug']), emptyMeta(), NO_SIGNALS)[0]!.likely,
    );
  });
});

describe('the swing panel', () => {
  it('itemizes what a basic attack would do to each enemy', () => {
    const [swing] = roomSwings(room('skirmish', ['tollbug']), emptyMeta(), NO_SIGNALS);
    // Level 3 Warden: ATK 14 against 2 DEF — 12 in the middle, 11 at worst, 20 on a crit.
    expect(swing!.total).toBe('12 (11–20)');
    expect(swing!.likely).toBe(12);
    expect(swing!.crit).toBe(20);
    expect(swing!.sum).toBe('ATK 14 −2 DEF = 12');
  });

  it('says what the codex has revealed about the target', () => {
    const meta = { ...emptyMeta(), knownWeaknesses: ['frost' as const] };
    const [known] = roomSwings(room('skirmish', ['tollbug']), meta, NO_SIGNALS);
    expect(known!.notes.join(' ')).toContain('Weak to frost for +25%');
    const [plain] = roomSwings(room('skirmish', ['tollbug']), emptyMeta(), NO_SIGNALS);
    expect(plain!.notes.join(' ')).toContain('Resists gale');
    expect(plain!.notes.join(' ')).toContain('Weak to frost');
    expect(plain!.notes.join(' ')).not.toContain('+25%');
  });

  it('is empty for a room with nothing in it', () => {
    expect(roomSwings(room('rest', []), emptyMeta(), NO_SIGNALS)).toEqual([]);
  });
});

describe('the recap under the stage', () => {
  it('reads the structured records the engine left in the log', () => {
    const out = stepRun(singleRowRun('skirmish'), mkCtx(emptyMeta()));
    const { rows } = recapOf(out.run.log);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.sum).toMatch(/= \d+$/);
      expect(row.dealt).toBe(Number(row.sum.split(' = ')[1]));
      expect([row.actor, row.target]).toEqual(expect.arrayContaining(['You', 'Tollbug']));
    }
  });

  it('keeps the newest beats and counts what it dropped', () => {
    const out = stepRun(singleRowRun('skirmish'), mkCtx(emptyMeta()));
    const all = recapOf(out.run.log).rows;
    const short = recapOf(out.run.log, 2);
    expect(short.rows.length).toBe(2);
    expect(short.omitted).toBe(Math.max(0, all.length - 2));
    expect(short.rows[1]).toEqual(all[all.length - 1]);
  });

  it('is empty before anything has happened', () => {
    expect(recapOf([]).rows).toEqual([]);
    expect(recapOf([]).omitted).toBe(0);
  });

  it('prints the same arithmetic the log line carried', () => {
    const out = stepRun(singleRowRun('skirmish'), mkCtx(emptyMeta()));
    const { rows } = recapOf(out.run.log);
    for (const entry of out.run.log) {
      const hit = hitOf(entry);
      if (!hit) continue;
      const row = rows.find(
        (r) =>
          r.round === hit.round &&
          r.actor === hit.actor &&
          r.target === hit.target &&
          r.dealt === hit.sum.dealt,
      );
      expect(row, entry.text).toBeDefined();
      expect(row!.sum).toBe(damageSumText(hit.sum));
      expect(entry.text).toContain(`(${row!.sum})`);
    }
  });
});

describe('the strip and the fight agree', () => {
  it('forecasts the enemy the room actually contained', () => {
    const run = room('skirmish', ['tollbug']);
    const rows = roomThreats(run, emptyMeta(), NO_SIGNALS);
    const out = stepRun(run, mkCtx(emptyMeta(), { oil: 999 }));
    const firstPlayerHit = out.run.log.map(hitOf).find((h) => h !== null && h.side === 'player')!;
    expect(firstPlayerHit, 'the room resolved a hit').toBeTruthy();
    // The DEF the strip printed is the DEF the engine subtracted, and the HP is the HP it hit.
    expect(rows[0]!.def).toBe(firstPlayerHit.input.def);
    expect(rows[0]!.hp).toBe(firstPlayerHit.input.hp + firstPlayerHit.input.shield);
  });

  it('prints the number the room then dealt, whenever the swing lands in the middle', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 2; seed++) {
      const run = { ...room('skirmish', ['tollbug']), runId: `readout-${seed}` };
      const [row] = roomThreats(run, emptyMeta(), NO_SIGNALS);
      const out = stepRun(run, mkCtx(emptyMeta(), { oil: 999 }));
      const hit = out.run.log.map(hitOf).find((h) => h !== null && h.side === 'enemy');
      if (!hit) continue;
      const input = hit.input as IncomingInput;
      // Once the exchange has moved, the pool and the HP are history; compare only an untouched opening.
      if (input.variance !== 0 || input.shield !== row!.shield || input.hp !== run.unit.hp)
        continue;
      expect(row!.likely).toBe(hit.sum.dealt);
      expect(row!.sum).toBe(damageSumText(hit.sum));
      checked += 1;
    }
    expect(checked, 'expected an untouched opening exchange in 60 runs').toBeGreaterThan(0);
  });
});
