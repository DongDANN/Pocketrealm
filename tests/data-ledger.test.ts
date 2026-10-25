/**
 * Gate 2 — reward ledger persistence (SPEC 6.9/10). Every grant is idempotent by key and every cap
 * (per-type daily counts, the Delve XP cap, the 120 oil/day earn cap) is enforced *here*, because a
 * screen that forgot to check a cap would otherwise mint rewards forever.
 */

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { OIL_DAILY_CAP } from '../src/core/rewards';
import type { GrantSpec } from '../src/core/rewards';
import { openDatabase } from '../src/data/db';
import {
  grantMany,
  grantReward,
  ledgerEvents,
  ledgerTotals,
  oilGrantedOnDate,
} from '../src/data/ledger';
import { testDb } from './data-harness';

const log = (n: number, date = '2026-10-04'): GrantSpec => ({
  key: `log:txn-${n}`,
  type: 'log',
  xp: 5,
  sparks: 0,
  oil: 4,
  at: date,
});

describe('reward ledger', () => {
  it('persists a grant and totals it', async () => {
    const db = testDb('ledger-grant');
    const result = await grantReward(db, {
      key: 'delve:clear:run-1',
      type: 'delve:clear',
      xp: 60,
      sparks: 10,
      at: '2026-10-04',
      meta: { runId: 'run-1' },
    });
    expect(result.granted).toBe(true);
    // 60 XP requested against the 30 XP/day Delve budget: the ledger stores what the cap allows.
    await expect(db.rewards.get('delve:clear:run-1')).resolves.toMatchObject({
      xp: 30,
      sparks: 10,
      meta: { runId: 'run-1' },
    });
    expect(await ledgerTotals(db)).toEqual({ xp: 30, sparks: 10, oil: 0 });
    db.close();
  });

  it('grants nothing twice for the same key', async () => {
    const db = testDb('ledger-duplicate');
    await grantReward(db, log(1));
    const again = await grantReward(db, log(1));
    expect(again.granted).toBe(false);
    expect(again.skippedReason).toBe('duplicate');
    await expect(db.rewards.count()).resolves.toBe(1);
    expect((await ledgerTotals(db)).xp).toBe(5);
    db.close();
  });

  it('enforces the per-type daily count cap', async () => {
    const db = testDb('ledger-count-cap');
    const results: boolean[] = [];
    for (let i = 1; i <= 10; i++) results.push((await grantReward(db, log(i))).granted);
    expect(results.filter(Boolean)).toHaveLength(8);
    expect(results.slice(8)).toEqual([false, false]);
    expect(await oilGrantedOnDate(db, '2026-10-04')).toBe(32);
    db.close();
  });

  it('enforces the 30 XP/day Delve cap', async () => {
    const db = testDb('ledger-delve-cap');
    const first = await grantReward(db, {
      key: 'delve:floor:run-1:1',
      type: 'delve:floor',
      xp: 10,
      sparks: 1,
      at: '2026-10-04',
    });
    // 25 requested, 20 left in the day's budget: it tops up to the cap and then the cap holds.
    const second = await grantReward(db, {
      key: 'delve:floor:run-1:2',
      type: 'delve:floor',
      xp: 25,
      sparks: 1,
      at: '2026-10-04',
    });
    const third = await grantReward(db, {
      key: 'delve:floor:run-1:3',
      type: 'delve:floor',
      xp: 10,
      sparks: 1,
      at: '2026-10-04',
    });
    expect(first.granted).toBe(true);
    expect(second.granted).toBe(true);
    await expect(db.rewards.get('delve:floor:run-1:2')).resolves.toMatchObject({ xp: 20 });
    expect(third.granted).toBe(false);
    expect(third.skippedReason).toBe('cap');
    expect((await ledgerTotals(db)).xp).toBe(30);
    db.close();
  });

  it('refuses oil grants that would cross the 120/day earn cap', async () => {
    const db = testDb('ledger-oil-cap');
    expect(OIL_DAILY_CAP).toBe(120);
    const big = await grantReward(db, {
      key: 'oil:review:2026-10-04',
      type: 'oil:review',
      xp: 0,
      sparks: 0,
      oil: 110,
      at: '2026-10-04',
    });
    const over = await grantReward(db, {
      key: 'oil:goal:2026-10-04',
      type: 'oil:goal',
      xp: 0,
      sparks: 0,
      oil: 20,
      at: '2026-10-04',
    });
    const fits = await grantReward(db, {
      key: 'oil:goal:2026-10-04',
      type: 'oil:goal',
      xp: 0,
      sparks: 0,
      oil: 10,
      at: '2026-10-04',
    });
    expect(big.granted).toBe(true);
    expect(over.granted).toBe(false);
    expect(over.skippedReason).toBe('cap');
    expect(fits.granted).toBe(true);
    expect(await oilGrantedOnDate(db, '2026-10-04')).toBe(120);
    db.close();
  });

  it('rejects a keyless grant and writes nothing at all', async () => {
    const db = testDb('ledger-atomic');
    await expect(
      grantMany(db, [log(1), { key: '', type: 'log', xp: 5, sparks: 0, at: '2026-10-04' }]),
    ).rejects.toThrow(/key/);
    await expect(db.rewards.count()).resolves.toBe(0);
    db.close();
  });

  it('grants a batch atomically and reports each outcome', async () => {
    const db = testDb('ledger-batch');
    const results = await grantMany(db, [log(1), log(1), log(2)]);
    expect(results.map((r) => r.granted)).toEqual([true, false, true]);
    await expect(db.rewards.count()).resolves.toBe(2);
    db.close();
  });

  it('reads events by date window for history and insights', async () => {
    const db = testDb('ledger-range');
    await grantReward(db, log(1, '2026-10-01'));
    await grantReward(db, log(2, '2026-10-04'));
    await grantReward(db, log(3, '2026-10-09'));
    const rows = await ledgerEvents(db, { from: '2026-10-02', to: '2026-10-05' });
    expect(rows.map((r) => r.key)).toEqual(['log:txn-2']);
    expect(await ledgerEvents(db)).toHaveLength(3);
    db.close();
  });

  it('keeps the ledger across a reopen', async () => {
    const factory = new IDBFactory();
    const first = openDatabase({ name: 'ledger-reopen', indexedDB: factory });
    await grantReward(first, log(1));
    first.close();
    const second = openDatabase({ name: 'ledger-reopen', indexedDB: factory });
    expect(await ledgerTotals(second)).toEqual({ xp: 5, sparks: 0, oil: 4 });
    second.close();
  });
});
