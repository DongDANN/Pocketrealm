/**
 * Material provenance (§7 D.3).
 *
 * Every screen in the game prints materials as three numbers — Ore, Herb, Echo — and that stays the
 * case. But a capsule's tier ceiling is set by the deepest Hollow the materials it costs came from, so
 * the bank has to know *where* a pile of Ore was dug, not only how much of it there is. This module
 * keeps that ledger and spends from it deepest-first, which is the player-favourable reading of the
 * rule: materials farmed in a deeper Hollow are never downgraded to pay for a shallower capsule.
 *
 * `materials` remains the printed total and the ledger remains the source of truth. They are kept in
 * step here, at the only two write sites, so a drift is a bug in one file rather than a property of
 * the save format.
 */

import type { DelveMeta, HollowId, Materials } from './types';

export const HOLLOW_IDS: readonly HollowId[] = [1, 2, 3];

export const EMPTY_MATERIALS: Materials = { ore: 0, herb: 0, echo: 0 };

export function addMaterials(a: Materials, b: Materials): Materials {
  return { ore: a.ore + b.ore, herb: a.herb + b.herb, echo: a.echo + b.echo };
}

function isPaid(cost: Materials, have: Materials): boolean {
  return have.ore >= cost.ore && have.herb >= cost.herb && have.echo >= cost.echo;
}

function minus(a: Materials, b: Materials): Materials {
  return { ore: a.ore - b.ore, herb: a.herb - b.herb, echo: a.echo - b.echo };
}

/** The printed total: whatever the ledger holds, summed. */
export function ledgerTotal(ledger: Partial<Record<HollowId, Materials>>): Materials {
  return HOLLOW_IDS.reduce<Materials>(
    (sum, id) => addMaterials(sum, ledger[id] ?? EMPTY_MATERIALS),
    EMPTY_MATERIALS,
  );
}

/**
 * The per-Hollow ledger. A book written before provenance existed has only the flat total, so its
 * materials are attributed to the deepest Hollow it has cleared — the Hollow they were most likely
 * farmed in. The attribution happens once: any bank or spend writes the ledger, and after that the
 * ledger is the truth.
 */
export function materialsLedger(meta: DelveMeta): Record<HollowId, Materials> {
  const blank = (): Record<HollowId, Materials> => ({
    1: { ...EMPTY_MATERIALS },
    2: { ...EMPTY_MATERIALS },
    3: { ...EMPTY_MATERIALS },
  });
  if (meta.materialsFrom) {
    const ledger = blank();
    for (const id of HOLLOW_IDS) ledger[id] = { ...(meta.materialsFrom[id] ?? EMPTY_MATERIALS) };
    return ledger;
  }
  const deepest = meta.clearedHollows?.length
    ? (Math.max(...meta.clearedHollows) as HollowId)
    : (1 as HollowId);
  const ledger = blank();
  ledger[deepest] = { ...(meta.materials ?? EMPTY_MATERIALS) };
  return ledger;
}

/** Bank a finished run's materials into the Hollow they were gathered in. */
export function bankMaterials(meta: DelveMeta, hollowId: HollowId, gained: Materials): DelveMeta {
  const ledger = materialsLedger(meta);
  ledger[hollowId] = addMaterials(ledger[hollowId] ?? EMPTY_MATERIALS, gained);
  return { ...meta, materialsFrom: ledger, materials: ledgerTotal(ledger) };
}

/**
 * Spend `cost` from the deepest Hollow that can pay, falling back through shallower Hollows until the
 * price is covered. Reports which Hollow actually paid, because that is the capsule's ceiling. A book
 * that cannot pay at all is refused: nothing here guesses at a partial purchase.
 */
export function spendMaterials(
  meta: DelveMeta,
  cost: Materials,
): { meta: DelveMeta; ok: boolean; paidFrom: HollowId | null; reason: string } {
  const total = meta.materials ?? EMPTY_MATERIALS;
  if (!isPaid(cost, total)) {
    return { meta, ok: false, paidFrom: null, reason: 'Not enough materials.' };
  }
  const ledger = materialsLedger(meta);
  let owed = { ...cost };
  let paidFrom: HollowId | null = null;
  for (const id of [...HOLLOW_IDS].reverse()) {
    if (isPaid(owed, ledger[id] ?? EMPTY_MATERIALS)) {
      ledger[id] = minus(ledger[id] ?? EMPTY_MATERIALS, owed);
      if (!paidFrom) paidFrom = id;
      owed = EMPTY_MATERIALS;
      break;
    }
    // A shallower Hollow can only fill what the deeper ones left unpaid, and never alone: the
    // deepest Hollow that contributes anything to the price owns the capsule's ceiling.
    const have = ledger[id] ?? EMPTY_MATERIALS;
    const part = {
      ore: Math.min(owed.ore, have.ore),
      herb: Math.min(owed.herb, have.herb),
      echo: Math.min(owed.echo, have.echo),
    };
    if (part.ore > 0 || part.herb > 0 || part.echo > 0) {
      ledger[id] = minus(have, part);
      if (!paidFrom) paidFrom = id;
      owed = minus(owed, part);
    }
  }
  if (!isPaid(cost, minus(cost, owed))) {
    // The pools could not cover the price even though the total said they could: an inconsistent
    // book. Refuse rather than hand out a capsule the ledger cannot pay for.
    return { meta, ok: false, paidFrom: null, reason: 'Not enough materials.' };
  }
  return {
    meta: { ...meta, materialsFrom: ledger, materials: ledgerTotal(ledger) },
    ok: true,
    paidFrom,
    reason: 'Spent.',
  };
}
