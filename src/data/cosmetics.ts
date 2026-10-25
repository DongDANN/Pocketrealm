/**
 * The cosmetic shop on disk. A purchase is a receipt, not game state: Sparks are a ledger total and
 * the rows in `purchases` are what was spent, so the balance is `ledger sparks - receipts`. Buying
 * writes the receipt and the companion's unlocked list in one transaction; a double tap cannot
 * charge twice or unlock before paying. Equipping touches only the companion row.
 */

import {
  availableSparks,
  cosmeticById,
  cosmeticSlot,
  CODEX_COSMETIC_ID,
  type CosmeticDef,
} from '../core/cosmetics';
import { codexProgress } from '../core/delve';
import { totalSparks } from '../core/rewards';
import type { Companion } from '../core/types';
import type { PocketDb, PurchaseRow } from './db';
import { META_KEY } from './delveStore';
import type { WriteContext } from './repos';

export interface CosmeticState {
  companion: Companion | null;
  sparks: number;
  spent: number;
  available: number;
  purchases: readonly PurchaseRow[];
  owned: readonly string[];
}

export interface CosmeticOutcome {
  ok: boolean;
  reason?: string;
  state: CosmeticState;
}

async function readState(db: PocketDb): Promise<CosmeticState> {
  const [companion, events, purchases] = await Promise.all([
    db.companions.toCollection().first(),
    db.rewards.toArray(),
    db.purchases.toArray(),
  ]);
  const sparks = totalSparks(events);
  const spent = purchases.reduce((sum, row) => sum + Math.max(0, row.cost), 0);
  const owned = [
    ...new Set([...(companion?.cosmetics ?? []), ...purchases.map((row) => row.cosmeticId)]),
  ];
  return {
    companion: companion ?? null,
    sparks,
    spent,
    available: availableSparks(sparks, spent),
    purchases: purchases.sort((a, b) => b.at - a.at),
    owned,
  };
}

export function loadCosmeticState(db: PocketDb): Promise<CosmeticState> {
  return readState(db);
}

export async function buyCosmetic(
  db: PocketDb,
  ctx: WriteContext,
  cosmeticId: string,
): Promise<CosmeticOutcome> {
  const def = cosmeticById(cosmeticId);
  return db.transaction('rw', db.rewards, db.purchases, db.companions, async () => {
    const state = await readState(db);
    if (!def) return { ok: false, reason: 'Unknown cosmetic.', state };
    if (state.owned.includes(def.id)) return { ok: false, reason: 'Already owned.', state };
    if (state.available < def.price) {
      return { ok: false, reason: 'Not enough Sparks yet.', state };
    }
    if (!state.companion) return { ok: false, reason: 'No companion to dress.', state };
    await db.purchases.add({ cosmeticId: def.id, cost: def.price, at: ctx.clock.now() });
    await db.companions.put({
      ...state.companion,
      cosmetics: [...new Set([...state.companion.cosmetics, def.id])],
    });
    return { ok: true, state: await readState(db) };
  });
}

/** Free keepsake for a completed codex. It is never sold and pays nothing. */
export async function claimCodexCosmetic(db: PocketDb): Promise<CosmeticOutcome> {
  return db.transaction('rw', db.delveMeta, db.companions, async () => {
    const state = await readState(db);
    const meta = await db.delveMeta.get(META_KEY);
    if (!meta || !codexProgress(meta.value).complete) {
      return { ok: false, reason: 'Finish the codex first.', state };
    }
    if (!state.companion) return { ok: false, reason: 'No companion to dress.', state };
    if (state.owned.includes(CODEX_COSMETIC_ID)) {
      return { ok: false, reason: 'The codex keepsake is already yours.', state };
    }
    await db.companions.put({
      ...state.companion,
      cosmetics: [...new Set([...state.companion.cosmetics, CODEX_COSMETIC_ID])],
    });
    return { ok: true, state: await readState(db) };
  });
}

function isOwned(state: CosmeticState, def: CosmeticDef): boolean {
  return state.owned.includes(def.id) || state.companion?.cosmetics.includes(def.id) === true;
}

/** Wear or remove one companion slot. Realm keepsakes have no slot and cannot be equipped. */
export async function equipCosmetic(db: PocketDb, cosmeticId: string): Promise<CosmeticOutcome> {
  return db.transaction('rw', db.purchases, db.companions, async () => {
    const state = await readState(db);
    const def = cosmeticById(cosmeticId) ?? {
      id: CODEX_COSMETIC_ID,
      kind: 'hat' as const,
      slot: 'hat' as const,
      name: 'Codex Sage',
      price: 0,
      blurb: '',
    };
    const slot = cosmeticSlot(def.kind);
    if (!slot) return { ok: false, reason: 'That keepsake lives in the Realm.', state };
    if (!isOwned(state, def)) return { ok: false, reason: 'Not owned yet.', state };
    if (!state.companion) return { ok: false, reason: 'No companion to dress.', state };
    const equipped = { ...state.companion.equipped };
    if (equipped[slot] === def.id) delete equipped[slot];
    else equipped[slot] = def.id;
    await db.companions.put({ ...state.companion, equipped });
    return { ok: true, state: await readState(db) };
  });
}
