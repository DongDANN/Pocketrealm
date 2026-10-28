/**
 * Gate 7b-3 — a room played by hand survives the trip through storage.
 *
 * The engine tests prove the pause is rebuilt from the orders and the seed. This suite proves the
 * data layer stores exactly that and nothing else: entering a room is one batch that spends no oil,
 * every answer is a same-step guarded write, a reload rebuilds the menu without writing, and a
 * refused order never reaches the database.
 */

import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyMeta, hitOf, type TurnOrder } from '../src/core/delve';
import type { PocketDb } from '../src/data/db';
import {
  loadDelveSnapshot,
  retreatDelve,
  stepDelve,
  type StepDelveOptions,
} from '../src/data/delve';
import { createRun, loadActiveRun, META_KEY } from '../src/data/delveStore';
import { dbOn } from './data-harness';
import { NOW, POLICY, singleRowRun, TODAY } from './delve-helpers';

const BASIC: TurnOrder = { skillId: null, targetIndex: 0, guard: false };
const PLAY: StepDelveOptions = { today: TODAY, now: NOW, policy: POLICY, play: true };

let factory: IDBFactory;
let name: string;
let db: PocketDb;
let seq = 0;

beforeEach(() => {
  seq += 1;
  factory = new IDBFactory();
  name = `delve-turn-${seq}`;
  db = dbOn(factory, name);
});

/** A stored run standing before the first room, with a lamp holding fifty. */
async function seedRoom(): Promise<void> {
  const meta = emptyMeta();
  await db.delveMeta.put({ key: META_KEY, value: meta, oil: 50, oilGranted: 0, updatedAt: NOW });
  const commit = await createRun(db, {
    run: singleRowRun('skirmish'),
    meta,
    oil: 50,
    oilCapacity: 200,
    oilGranted: 0,
    ledger: [],
    today: TODAY,
    now: NOW,
  });
  expect(commit.applied).toBe(true);
}

describe('entering a room by hand', () => {
  it('opens the room for free and stores the emptiest possible run', async () => {
    await seedRoom();
    const entered = await stepDelve(db, PLAY);

    expect(entered.ok).toBe(true);
    expect(entered.wallet.oil).toBe(50);
    expect(entered.pause).toBeDefined();
    expect(entered.pause!.state.round).toBe(1);
    expect(entered.run!.pendingTurn).toBe(true);
    expect(entered.run!.orders).toEqual([]);

    const stored = await loadActiveRun(db);
    expect(stored!.stepIndex).toBe(1);
    expect(stored!.state.pendingTurn).toBe(true);
    expect(stored!.state.orders).toEqual([]);
    // The snapshot the screens read carries the waiting marker too.
    const snapshot = await loadDelveSnapshot(db, { today: TODAY, now: NOW });
    expect(snapshot.active!.pendingTurn).toBe(true);
  });

  it('reopens the same room after a reload without spending or writing anything', async () => {
    await seedRoom();
    const entered = await stepDelve(db, PLAY);
    const before = await loadActiveRun(db);

    await db.close();
    db = dbOn(factory, name);

    const reopened = await stepDelve(db, PLAY);
    expect(reopened.ok).toBe(true);
    expect(reopened.wallet.oil).toBe(50);
    expect(reopened.pause!.state).toEqual(entered.pause!.state);
    expect(reopened.pause!.enemies).toEqual(entered.pause!.enemies);
    expect(reopened.run!.stepIndex).toBe(1);

    const after = await loadActiveRun(db);
    expect(after!.updatedAt).toBe(before!.updatedAt);
    expect(after!.state.orders).toEqual([]);
  });
});

describe('answering a round', () => {
  it('appends the order at the same step and asks for the next round', async () => {
    await seedRoom();
    await stepDelve(db, PLAY);

    const answered = await stepDelve(db, { ...PLAY, order: BASIC });
    expect(answered.ok).toBe(true);
    expect(answered.pause).toBeDefined();
    expect(answered.pause!.state.round).toBe(2);
    expect(answered.run!.orders).toEqual([BASIC]);

    const stored = await loadActiveRun(db);
    expect(stored!.stepIndex).toBe(1);
    expect(stored!.state.orders).toEqual([BASIC]);
    expect(stored!.state.pendingTurn).toBe(true);
  });

  it('refuses an order the round cannot deliver, and writes nothing', async () => {
    await seedRoom();
    await stepDelve(db, PLAY);
    await stepDelve(db, { ...PLAY, order: BASIC });

    const refused = await stepDelve(db, {
      ...PLAY,
      order: { skillId: null, targetIndex: 9, guard: false },
    });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('That order cannot be used this round.');
    expect(refused.pause!.state.round).toBe(2);

    const stored = await loadActiveRun(db);
    expect(stored!.state.orders).toEqual([BASIC]);
  });

  it('refuses an order when no room is waiting, before entering anything', async () => {
    await seedRoom();

    const refused = await stepDelve(db, { ...PLAY, order: BASIC });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('No room is waiting for an order.');

    const stored = await loadActiveRun(db);
    expect(stored!.stepIndex).toBe(0);
    expect(stored!.state.orders).toEqual([]);
    expect(stored!.state.pendingTurn).toBeUndefined();
  });
});

describe('finishing the room', () => {
  it('resolves at the same step, drops the trail and leaves the fight in the log once', async () => {
    await seedRoom();
    await stepDelve(db, PLAY);

    let last = await stepDelve(db, { ...PLAY, order: BASIC });
    for (let guard = 0; guard < 50 && last.pause !== undefined && last.ok; guard++) {
      last = await stepDelve(db, { ...PLAY, order: BASIC });
    }

    expect(last.ok).toBe(true);
    expect(last.ended).toBe(false);
    expect(last.run!.pendingTurn).toBeUndefined();
    expect(last.run!.orders).toEqual([]);
    expect(last.run!.stepIndex).toBe(1);
    // The one-row plan is done, so the room advanced the run rather than the step index.
    expect(last.run!.floor).toBe(2);

    const stored = await loadActiveRun(db);
    expect(stored!.stepIndex).toBe(1);
    expect(stored!.state.orders).toEqual([]);
    const rounds = stored!.state.log
      .map(hitOf)
      .filter((hit) => hit !== null && hit.side === 'player')
      .map((hit) => hit!.round);
    expect(rounds).toEqual(rounds.map((_, i) => i + 1));
  });

  it('lets the player turn back out of a waiting room, trail and all', async () => {
    await seedRoom();
    await stepDelve(db, PLAY);
    await stepDelve(db, { ...PLAY, order: BASIC });

    const out = await retreatDelve(db, { today: TODAY, now: NOW });
    expect(out.ok).toBe(true);
    expect(out.run!.result).toBe('retreated');
    expect(out.run!.orders).toEqual([]);
    expect(out.run!.pendingTurn).toBeUndefined();
    expect(await loadActiveRun(db)).toBeUndefined();
  });
});
