/**
 * Gate 2 — the idempotent reward ledger on IndexedDB (SPEC 6.9: "All grants go through the idempotent
 * reward ledger"). The pure cap rules live in `core/rewards`; this adds the storage half: the daily
 * oil earn cap, a key that must exist to be idempotent, and a batch that writes in one transaction
 * so a crash can never leave half a day's rewards behind.
 */

import {
  OIL_DAILY_CAP,
  grant,
  oilGrantedOn,
  totalSparks,
  totalXp,
  type GrantResult,
  type GrantSpec,
} from '../core/rewards';
import type { LocalDate, RewardEvent } from '../core/types';
import type { PocketDb } from './db';

export interface LedgerTotals {
  xp: number;
  sparks: number;
  oil: number;
}

export interface LedgerFilter {
  from?: LocalDate;
  to?: LocalDate;
  type?: string;
}

function byDateThenKey(a: RewardEvent, b: RewardEvent): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** One key grants once; caps are counted from the rows already in the table. */
export async function grantReward(db: PocketDb, spec: GrantSpec): Promise<GrantResult> {
  const [result] = await grantMany(db, [spec]);
  return result!;
}

/**
 * Grant a batch inside one transaction. Specs are applied in order against the accumulated ledger,
 * so a batch cannot exceed a cap by sneaking several grants through at once.
 */
export async function grantMany(db: PocketDb, specs: readonly GrantSpec[]): Promise<GrantResult[]> {
  for (const spec of specs) {
    if (!spec.key || spec.key.trim() === '') {
      throw new Error(`Reward grant for type "${spec.type}" needs a deterministic key`);
    }
  }
  return db.transaction('rw', db.rewards, async () => {
    const results: GrantResult[] = [];
    let events = await db.rewards.toArray();
    for (const spec of specs) {
      if (spec.oil !== undefined && oilGrantedOn(events, spec.at) + spec.oil > OIL_DAILY_CAP) {
        results.push({ events, granted: false, skippedReason: 'cap' });
        continue;
      }
      const result = grant(events, spec);
      events = result.events;
      results.push(result);
      if (result.granted) {
        const added = result.events[result.events.length - 1];
        if (added) await db.rewards.add(added);
      }
    }
    return results;
  });
}

export async function ledgerEvents(
  db: PocketDb,
  filter: LedgerFilter = {},
): Promise<RewardEvent[]> {
  const rows =
    filter.from && filter.to
      ? await db.rewards.where('at').between(filter.from, filter.to, true, true).toArray()
      : filter.from
        ? await db.rewards.where('at').aboveOrEqual(filter.from).toArray()
        : filter.to
          ? await db.rewards.where('at').belowOrEqual(filter.to).toArray()
          : await db.rewards.toArray();
  return rows
    .filter((e) =>
      filter.type ? e.type === filter.type || e.type.startsWith(`${filter.type}:`) : true,
    )
    .sort(byDateThenKey);
}

export async function ledgerTotals(db: PocketDb): Promise<LedgerTotals> {
  const events = await db.rewards.toArray();
  return {
    xp: totalXp(events),
    sparks: totalSparks(events),
    oil: events.reduce((sum, e) => sum + (e.oil ?? 0), 0),
  };
}

export async function oilGrantedOnDate(db: PocketDb, date: LocalDate): Promise<number> {
  const events = await db.rewards.where('at').equals(date).toArray();
  return oilGrantedOn(events, date);
}
