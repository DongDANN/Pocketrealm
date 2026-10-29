/**
 * Gate 7e — the patience economy (DELVE_REDESIGN §9).
 *
 * Skip and interest are one ledger in two halves: a skipped Treasure or Rest reward makes the next
 * two Glint rewards pay ×1.8, and Glint held while a floor is walked pays 8% at its end, capped at
 * 40. These tests pin the arithmetic, the seams (treasure cache, rest heal, event payout, floor
 * advance) and the guardrails (one skip at a time, never compounded, interest never boosted, no
 * offer to skip a reward that is already zero).
 */

import { describe, expect, it } from 'vitest';
import {
  emptyMeta,
  interestOn,
  newRun,
  patienceLedger,
  payGlintReward,
  resolveChoice,
  skipRewardsLeft,
  stepRun,
  INTEREST_CAP,
  SKIP_MULTIPLIER,
  SKIP_REWARDS,
  type DelveMeta,
  type RoomKind,
  type RunState,
} from '../src/core/delve';
import { mkCtx } from './delve-helpers';

/** A hand-built floor: one room per row, in the order given. */
function planRun(
  rows: { kind: RoomKind; optionSeed?: number }[],
  over: Partial<RunState> = {},
): RunState {
  const base = newRun(11, 1, 3, emptyMeta());
  return {
    ...base,
    // Pinned rather than drawn: a suite about patience must not also be a suite about whichever rule
    // seed 11 happens to deal to its opening floor.
    floorRule: 'mark-one-round',
    floorPlan: {
      floor: 1,
      rows: rows.map((room, row) => [
        {
          id: `x0r${row}c0`,
          kind: room.kind,
          enemies: [],
          optionSeed: room.optionSeed ?? row,
        },
      ]),
    },
    ...over,
  };
}

function enter(run: RunState, meta: DelveMeta): RunState {
  return stepRun(run, mkCtx(meta)).run;
}

function pick(run: RunState, meta: DelveMeta, optionId: string): RunState {
  return resolveChoice(run, mkCtx(meta), optionId).run;
}

/** Answer every question the room asks with its first option, the way a headless run does. */
function settle(run: RunState, meta: DelveMeta): RunState {
  let next = run;
  let guard = 0;
  while (next.pendingChoice && guard < 6) {
    next = pick(next, meta, next.pendingChoice.options[0]!.id);
    guard += 1;
  }
  return next;
}

/** Skip the room's reward, then answer anything the room still asks. */
function skipAndSettle(run: RunState, meta: DelveMeta): RunState {
  return settle(pick(run, meta, 'skip'), meta);
}

describe('interest on held Glint', () => {
  it('pays 8% at a floor’s end, rounded, and caps at 40', () => {
    expect(interestOn(0)).toBe(0);
    expect(interestOn(6)).toBe(0);
    expect(interestOn(10)).toBe(1);
    expect(interestOn(100)).toBe(8);
    expect(interestOn(500)).toBe(INTEREST_CAP);
    expect(interestOn(2000)).toBe(INTEREST_CAP);
  });

  it('pays on the Glint held during the floor, before the next floor’s Forge grant', () => {
    // Treasury Seed LV1 grants +10 starting Glint on the next floor, after the interest is priced.
    const meta: DelveMeta = { ...emptyMeta(), forge: { glint: 1 } };
    let run = planRun([{ kind: 'rest' }, { kind: 'rest' }], { glint: 100 });

    run = enter(run, meta);
    run = pick(run, meta, 'rest');
    // The first room only moved the run to row 1; no floor ended, so no interest or Forge grant.
    expect(run.row).toBe(1);
    expect(run.glint).toBe(100);

    run = enter(run, meta);
    run = pick(run, meta, 'rest');
    // Interest is 8% of the 100 that was held while the floor was walked, not of the 110 that would
    // include the Forge's floor-start grant; that grant lands after the interest line.
    expect(run.floor).toBe(2);
    expect(run.glint).toBe(100 + 8 + 10);
    expect(run.log.some((line) => line.text.includes('Interest: +8 Glint on 100 held'))).toBe(true);
  });

  it('pays nothing on an empty purse and writes no interest line', () => {
    let run = planRun([{ kind: 'rest' }, { kind: 'rest' }], { glint: 0 });
    run = enter(run, meta());
    run = pick(run, meta(), 'rest');
    run = enter(run, meta());
    run = pick(run, meta(), 'rest');
    expect(run.glint).toBe(0);
    expect(run.log.some((line) => line.text.startsWith('Interest:'))).toBe(false);
  });
});

function meta(): DelveMeta {
  return emptyMeta();
}

describe('skip at the treasure cache', () => {
  it('asks before it pays, and skipping leaves the Glint behind', () => {
    let run = planRun([{ kind: 'treasure' }, { kind: 'rest' }], { glint: 0 });
    run = enter(run, meta());
    expect(run.pendingChoice?.kind).toBe('treasure');
    expect(run.pendingChoice?.options.map((o) => o.id)).toEqual(['take', 'skip']);

    run = skipAndSettle(run, meta());
    expect(run.pendingChoice).toBeNull();
    expect(run.glint).toBe(0);
    expect(run.skipOutstanding).toBe(true);
    expect(skipRewardsLeft(run)).toBe(SKIP_REWARDS);
    expect(run.log.some((line) => line.text.includes('Skipped the cache'))).toBe(true);
  });

  it('still rolls the cache’s boon offer after the Glint is answered', () => {
    // The offer stream is keyed by runId, so a spread of ids is a spread of treasure rooms.
    const runs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((tag) => {
      const run = planRun([{ kind: 'treasure' }, { kind: 'rest' }], {
        glint: 0,
        runId: `cache-${tag}`,
      });
      return pick(enter(run, meta()), meta(), 'take');
    });
    expect(runs.some((run) => run.pendingChoice?.kind === 'boon')).toBe(true);
  });

  it('hides the skip while one is outstanding and refuses a forced skip', () => {
    const run = { ...planRun([{ kind: 'treasure' }, { kind: 'rest' }]), skipOutstanding: true };
    const opened = enter({ ...run, skipRewardsLeft: 2 }, meta());
    expect(opened.pendingChoice?.options.map((o) => o.id)).toEqual(['take']);

    const forced = resolveChoice(opened, mkCtx(meta()), 'skip');
    expect(forced.run).toBe(opened);
    expect(forced.run.pendingChoice?.kind).toBe('treasure');
  });

  it('boosts the next two Glint rewards and then stops', () => {
    const metaState = meta();
    let run = planRun(
      [
        { kind: 'treasure' },
        { kind: 'treasure' },
        { kind: 'treasure' },
        { kind: 'treasure' },
        { kind: 'rest' },
      ],
      { glint: 0 },
    );

    run = skipAndSettle(enter(run, metaState), metaState); // row 0: skip, then its offer
    expect(run.skipRewardsLeft).toBe(2);

    run = settle(enter(run, metaState), metaState); // row 1: take, boosted
    expect(run.glint).toBe(Math.round(25 * SKIP_MULTIPLIER));
    expect(run.skipRewardsLeft).toBe(1);
    expect(run.log.some((line) => line.text.includes('skip ×1.8, 1 left'))).toBe(true);

    run = settle(enter(run, metaState), metaState); // row 2: take, boosted again
    expect(run.glint).toBe(Math.round(25 * SKIP_MULTIPLIER) * 2);
    expect(run.skipRewardsLeft).toBe(0);
    expect(run.skipOutstanding).toBe(false);

    run = settle(enter(run, metaState), metaState); // row 3: plain again
    expect(run.glint).toBe(Math.round(25 * SKIP_MULTIPLIER) * 2 + 25);
    expect(run.log.some((line) => line.text === 'Treasure: +25 Glint.')).toBe(true);
  });

  it('doubles First Coin before the skip multiplies it', () => {
    const run = {
      ...planRun([{ kind: 'treasure' }, { kind: 'rest' }], {
        glint: 0,
        relics: ['relic-firstcoin'],
        row: 0,
        skipOutstanding: true,
        skipRewardsLeft: 2,
      }),
    };
    const settled = settle(enter(run, meta()), meta());
    expect(settled.glint).toBe(Math.round(50 * SKIP_MULTIPLIER));
    expect(settled.row).toBe(1);
  });
});

describe('skip at a rest room', () => {
  it('offers the rest, the retreat and the skip when there is healing to decline', () => {
    const entered = enter(planRun([{ kind: 'rest' }, { kind: 'rest' }]), meta());
    expect(entered.pendingChoice?.options.map((o) => o.id)).toContain('skip');
  });

  it('does not offer a skip when a floor rule already zeroes the healing', () => {
    const run = planRun([{ kind: 'rest' }, { kind: 'rest' }], { floorRule: 'no-rest-heal' });
    const entered = enter(run, meta());
    expect(entered.pendingChoice?.options.map((o) => o.id)).not.toContain('skip');
    const forced = resolveChoice(entered, mkCtx(meta()), 'skip');
    expect(forced.run).toBe(entered);
  });

  it('skipping leaves HP where it was and owes two boosted rewards', () => {
    const before = planRun([{ kind: 'rest' }, { kind: 'rest' }], { glint: 0 });
    const run = { ...before, unit: { ...before.unit, hp: before.unit.maxHp - 20 } };
    const entered = enter(run, meta());
    const skipped = pick(entered, meta(), 'skip');
    expect(skipped.unit.hp).toBe(run.unit.hp);
    expect(skipped.skipOutstanding).toBe(true);
    expect(skipped.skipRewardsLeft).toBe(2);
    expect(skipped.pendingChoice).toBeNull();
    expect(skipped.log.some((line) => line.text.includes('Skipped the rest'))).toBe(true);
  });

  it('hides the skip once one is outstanding', () => {
    const run = planRun([{ kind: 'rest' }, { kind: 'rest' }], {
      skipOutstanding: true,
      skipRewardsLeft: 1,
    });
    const entered = enter(run, meta());
    expect(entered.pendingChoice?.options.map((o) => o.id)).not.toContain('skip');
  });
});

describe('the boost’s edges', () => {
  it('boosts a positive event payout as a Glint reward', () => {
    // Hollow 1, optionSeed 2 is A Gardener's Cache: open pays 35 Glint.
    let run = planRun([{ kind: 'event', optionSeed: 2 }, { kind: 'rest' }], {
      glint: 0,
      skipOutstanding: true,
      skipRewardsLeft: 2,
    });
    run = enter(run, meta());
    run = pick(run, meta(), 'open');
    expect(run.glint).toBe(Math.round(35 * SKIP_MULTIPLIER));
    expect(run.skipRewardsLeft).toBe(1);
    expect(run.log.some((line) => line.text.includes('Skip ×1.8'))).toBe(true);
  });

  it('never boosts a Glint cost', () => {
    // The Tollkeeper's pay option spends 20 Glint; a skip must not turn a cost into a discount.
    let run = planRun([{ kind: 'event', optionSeed: 1 }, { kind: 'rest' }], {
      glint: 100,
      skipOutstanding: true,
      skipRewardsLeft: 2,
    });
    run = enter(run, meta());
    run = pick(run, meta(), 'pay');
    expect(run.glint).toBe(80);
    expect(run.skipRewardsLeft).toBe(2);
  });

  it('never boosts interest, and interest does not consume the skip', () => {
    const metaState = meta();
    let run = planRun([{ kind: 'rest' }, { kind: 'rest' }], {
      glint: 100,
      skipOutstanding: true,
      skipRewardsLeft: 2,
    });
    run = enter(run, metaState);
    run = pick(run, metaState, 'rest');
    run = enter(run, metaState);
    run = pick(run, metaState, 'rest');
    // 8% of 100 is 8, not 8 × 1.8; the skip is still owed because interest is not a room reward.
    expect(run.glint).toBe(108);
    expect(run.skipRewardsLeft).toBe(2);
  });

  it('the pure payout helper refuses to boost zero and stops at zero owed', () => {
    const base = planRun([{ kind: 'rest' }], { skipOutstanding: true, skipRewardsLeft: 1 });
    const zero = payGlintReward(base, 0);
    expect(zero.amount).toBe(0);
    expect(zero.boosted).toBe(false);
    expect(zero.run.skipRewardsLeft).toBe(1);

    const once = payGlintReward(base, 20);
    expect(once).toEqual({ run: expect.anything(), amount: 36, boosted: true });
    expect(once.run.skipRewardsLeft).toBe(0);
    expect(once.run.skipOutstanding).toBe(false);
  });
});

describe('the shared ledger', () => {
  it('prints both terms before either mechanic is chosen', () => {
    const run = planRun([{ kind: 'rest' }], { glint: 100 });
    const view = patienceLedger(run);
    expect(view.skipLeft).toBe(0);
    expect(view.skipLine).toContain('×1.8');
    expect(view.skipLine).toContain('next 2');
    expect(view.interestNext).toBe(8);
    expect(view.interestLine).toContain('8% of 100 held Glint = +8');
    expect(view.interestLine).toContain('cap 40');
  });

  it('counts the skip down in the player’s words', () => {
    const run = planRun([{ kind: 'rest' }], { skipOutstanding: true, skipRewardsLeft: 1 });
    expect(patienceLedger(run).skipLine).toBe('Skip: 1 more Glint reward pays ×1.8.');
  });
});
