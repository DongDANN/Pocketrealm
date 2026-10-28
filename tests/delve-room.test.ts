/**
 * Gate 7b-3 — a run keeps the room it is standing in.
 *
 * Entering a fight no longer resolves it: the room opens, waits for one order at a time, and stores
 * the orders it has taken in `run.orders` instead of the fight's outcome. Two properties follow, and
 * both are tested as equalities rather than smoke tests:
 *
 *  - the stored run carries nothing the replay cannot rebuild — no partial log, no partial HP, no
 *    spent consumable — so the fight that finishes the room is the fight that started it;
 *  - a run reloaded from JSON resumes at the same round with the same menu, because the menu is a
 *    function of the orders and the seed, not of anything that lived in memory.
 */

import { describe, expect, it } from 'vitest';
import {
  computeModifiers,
  emptyMeta,
  hitOf,
  retreatRun,
  runCombat,
  stepRun,
  type DelveMeta,
  type RunState,
  type StepOutcome,
  type TurnOrder,
} from '../src/core/delve';
import { mkCtx, singleRowRun, TODAY } from './delve-helpers';

const BASIC: TurnOrder = { skillId: null, targetIndex: 0, guard: false };

function openRoom(kind: 'skirmish' | 'elite' | 'boss' = 'skirmish'): {
  meta: DelveMeta;
  entry: StepOutcome;
} {
  const meta = emptyMeta();
  return { meta, entry: stepRun(singleRowRun(kind), mkCtx(meta, { play: true })) };
}

/** Answer the room one order at a time until it finishes, and report every step taken. */
function playOut(
  run: RunState,
  meta: DelveMeta,
  order: () => TurnOrder = () => BASIC,
): { run: RunState; steps: StepOutcome[] } {
  let current = run;
  const steps: StepOutcome[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const out = stepRun(current, mkCtx(meta, { play: true, order: order() }));
    steps.push(out);
    if (out.pause === undefined) return { run: out.run, steps };
    current = out.run;
  }
  throw new Error('the room never finished');
}

/** What the same fight would have logged for the same orders, as the independent reference. */
function referenceLog(entry: RunState, orders: readonly TurnOrder[]): string[] {
  const room = entry.floorPlan.rows[0]![0]!;
  const mods = computeModifiers(entry, {}, { wardHp: 0, luckBonus: 0 });
  let i = 0;
  const res = runCombat(entry, room, mods, entry.floor, [], [], {}, () =>
    i < orders.length ? orders[i++]! : null,
  );
  expect(res.pause).toBeUndefined();
  return res.log.map((line) => line.text);
}

describe('a fight room opens instead of resolving', () => {
  it('enters for free and waits at round one with the trail empty', () => {
    const { meta, entry } = openRoom();
    const pause = entry.pause!;

    expect(entry.run.stepIndex).toBe(1);
    expect(entry.run.pendingTurn).toBe(true);
    expect(entry.run.orders).toEqual([]);
    expect(entry.ended).toBe(false);
    // The entry line is the only thing in the run: the fight has not happened yet.
    expect(entry.run.log).toHaveLength(1);
    expect(entry.run.log[0]!.type).toBe('room');
    // No partial anything is merged, so a later replay cannot double it.
    expect(entry.meta).toBe(meta);
    expect(entry.run.consumablesUsed).toEqual({});
    expect(entry.run.unit.hp).toBe(entry.run.unit.maxHp);

    expect(pause.state.round).toBe(1);
    expect(pause.orders).toEqual([]);
    expect(pause.state.hp).toBe(entry.run.unit.hp);
    expect(pause.enemies[0]!.hp).toBe(pause.enemies[0]!.maxHp);
    // The room's opening lines are in the snapshot; no round has been fought.
    expect(pause.log.some((line) => line.text.startsWith('You hit'))).toBe(false);
    expect(pause.log.map((line) => line.text)).toContain('Steadfast grants 1 Shield.');
  });

  it('takes one order per round and never rewrites the HP the fight started from', () => {
    const { meta, entry } = openRoom();

    const first = stepRun(entry.run, mkCtx(meta, { play: true, order: BASIC }));
    expect(first.pause).toBeDefined();
    expect(first.pause!.state.round).toBe(2);
    expect(first.run.orders).toEqual([BASIC]);
    expect(first.run.pendingTurn).toBe(true);
    // The run's HP is still the entry value; the snapshot is where the fight's HP lives.
    expect(first.run.unit.hp).toBe(entry.run.unit.hp);
    expect(first.pause!.state.hp).toBeLessThan(entry.run.unit.hp);
    expect(first.pause!.log.some((line) => line.text.startsWith('You hit'))).toBe(true);
  });

  it('a dry lamp does not stop a run that was already paid for', () => {
    const { meta, entry } = openRoom();

    const out = stepRun(entry.run, mkCtx(meta, { play: true, order: BASIC, oil: 0 }));
    expect(out.pause).toBeDefined();
    expect(out.run.orders).toEqual([BASIC]);

    // Auto-played steps still cannot move a run that is waiting for a person.
    const auto = stepRun(entry.run, mkCtx(meta, { oil: 0 }));
    expect(auto.run).toBe(entry.run);
    expect(auto.pause).toBeUndefined();
  });

  it('asks with no order only to rebuild the same menu, without moving the run', () => {
    const { meta, entry } = openRoom();
    const answered = stepRun(entry.run, mkCtx(meta, { play: true, order: BASIC }));

    const rebuilt = stepRun(answered.run, mkCtx(meta, { play: true }));
    expect(rebuilt.pause!.state).toEqual(answered.pause!.state);
    expect(rebuilt.pause!.enemies).toEqual(answered.pause!.enemies);
    expect(rebuilt.pause!.log.map((line) => line.text)).toEqual(
      answered.pause!.log.map((line) => line.text),
    );
    expect(JSON.parse(JSON.stringify(rebuilt.run))).toEqual(
      JSON.parse(JSON.stringify(answered.run)),
    );
  });

  it('refuses an order the round cannot deliver and leaves the trail where it was', () => {
    const { meta, entry } = openRoom();

    const refused = stepRun(
      entry.run,
      mkCtx(meta, {
        play: true,
        order: { skillId: 'no-such-skill', targetIndex: 0, guard: false },
      }),
    );
    expect(refused.pause).toBeDefined();
    expect(refused.pause!.state.round).toBe(1);
    expect(refused.pause!.orders).toEqual([]);
    expect(refused.run.orders).toEqual([]);
    expect(refused.run.stepIndex).toBe(entry.run.stepIndex);
    expect(refused.run.unit.hp).toBe(entry.run.unit.hp);
  });
});

describe('the fight is rebuilt from the trail, so the run carries no outcome', () => {
  it('a reloaded run resumes into the same fight as the straight-through reference', () => {
    const { meta, entry } = openRoom();
    const orders = [BASIC, BASIC, BASIC, BASIC];

    // One sitting: open, answer round by round, finish the room.
    const straight = playOut(entry.run, meta);
    const straightText = straight.run.log
      .filter((line) => line.type === 'combat')
      .map((l) => l.text);

    // Same room, but the run is serialized to storage after round one and walked back from JSON.
    const first = stepRun(entry.run, mkCtx(meta, { play: true, order: orders[0]! }));
    const reloaded = JSON.parse(JSON.stringify(first.run)) as RunState;
    expect(reloaded.orders).toEqual([BASIC]);
    const resumed: StepOutcome[] = [];
    let current = reloaded;
    for (;;) {
      const out = stepRun(current, mkCtx(meta, { play: true, order: BASIC }));
      resumed.push(out);
      if (out.pause === undefined) break;
      current = out.run;
    }

    const resumedText = resumed
      .at(-1)!
      .run.log.filter((line) => line.type === 'combat')
      .map((l) => l.text);
    expect(resumedText).toEqual(straightText);
    expect(resumedText).toEqual(referenceLog(entry.run, orders));
    expect(resumed.at(-1)!.run.unit.hp).toBe(straight.run.unit.hp);
  });

  it('a consumable the room will need is spent once, when the room finishes', () => {
    const meta = emptyMeta();
    const run: RunState = {
      ...singleRowRun('skirmish'),
      consumables: ['fire-oil'],
      consumablesUsed: {},
    };
    const entry = stepRun(run, mkCtx(meta, { play: true }));

    // Still unspent in the run: the replay that finishes the room spends it, exactly once.
    expect(entry.run.consumablesUsed).toEqual({});
    expect(entry.pause!.log.map((line) => line.text)).toContain('Fire Oil: enemies start Burning.');

    const done = playOut(entry.run, meta);
    expect(done.run.consumablesUsed['fire-oil']).toBe(true);
    const oilLines = done.run.log.filter(
      (line) => line.text === 'Fire Oil: enemies start Burning.',
    );
    expect(oilLines).toHaveLength(1);
  });

  it('records every companion action exactly once per round', () => {
    const { meta, entry } = openRoom();
    const done = playOut(entry.run, meta);

    const swings = done.run.log
      .map(hitOf)
      .filter((hit) => hit !== null && hit.side === 'player')
      .map((hit) => hit!.round);
    expect(swings).toEqual(swings.map((_, i) => i + 1));
  });
});

describe('a finished room forgets its trail', () => {
  it('a win clears the orders and the waiting marker', () => {
    const { meta, entry } = openRoom();
    const done = playOut(entry.run, meta);

    expect(done.run.pendingTurn).toBeUndefined();
    expect('pendingTurn' in done.run).toBe(false);
    expect(done.run.orders).toEqual([]);
    expect(done.run.result).toBe('active');
    // The one-row plan is over, so the run moved on to the next floor.
    expect(done.run.floor).toBe(2);
  });

  it('a faint clears them too, and the fight that caused it is in the log', () => {
    const meta = emptyMeta();
    const base = singleRowRun('skirmish');
    const entry = stepRun(
      { ...base, companionLevel: 1, unit: { ...base.unit, hp: 1 } },
      mkCtx(meta, { play: true }),
    );

    const done = playOut(entry.run, meta);
    expect(done.run.result).toBe('fainted');
    expect(done.run.pendingTurn).toBeUndefined();
    expect(done.run.orders).toEqual([]);
    expect(done.run.log.filter((line) => line.type === 'combat').length).toBeGreaterThan(0);
  });

  it('retreating out of a waiting room drops the trail', () => {
    const { meta, entry } = openRoom();
    const answered = stepRun(entry.run, mkCtx(meta, { play: true, order: BASIC }));

    const out = retreatRun(answered.run, meta, TODAY);
    expect(out.run.result).toBe('retreated');
    expect(out.run.orders).toEqual([]);
    expect(out.run.pendingTurn).toBeUndefined();
  });
});
