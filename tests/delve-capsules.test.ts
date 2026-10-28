/**
 * Gate 7c-2 — capsules.
 *
 * These tests hold the mechanism to the three promises §7 D.4 prints on the capsule before it is
 * opened, and to the one rule §7 D.5 prints on the whole collection: what a capsule holds is decided
 * when it is drawn, not when the player looks at it. The last block is the §14 exit condition — a fuzz
 * over capsule draws that fails if a dud ever lands or if a reload could ever reroll a prize.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyMeta,
  type CapsuleReveal,
  type DelveMeta,
  type HollowId,
  type Materials,
} from '../src/core/delve';
import {
  CAPSULE_CEILING,
  CAPSULE_COST,
  CEILING_BAND,
  DUST_BY_RARITY,
  HARD_PITY,
  RELEVANCE_WINDOW,
  capsuleOdds,
  capsulesHeld,
  craftCapsule,
  dismissCapsuleReveal,
  dominantElement,
  dominantTag,
  openCapsule,
} from '../src/core/delve/capsules';
import {
  bankMaterials,
  ledgerTotal,
  materialsLedger,
  spendMaterials,
} from '../src/core/delve/materials';
import { RARITIES, SKILLS, skillById } from '../src/core/delve/data/skills';

const SEEDS = [1, 7, 12345, 0x9e3779b1, 20261025];
const CEILINGS = ['rare', 'epic', 'mythic'] as const;
type Ceiling = (typeof CEILINGS)[number];

function book(over: Partial<DelveMeta> = {}): DelveMeta {
  return { ...emptyMeta(), ...over };
}

/** A book whose materials arrived through the ledger, so provenance is exact rather than inferred. */
function banked(entries: Partial<Record<HollowId, Materials>>): DelveMeta {
  let meta = emptyMeta();
  for (const id of [1, 2, 3] as HollowId[]) {
    const gain = entries[id];
    if (gain) meta = bankMaterials(meta, id, gain);
  }
  return meta;
}

function oneCeiling(hollow: HollowId, price: Materials): DelveMeta {
  const entries: Partial<Record<HollowId, Materials>> = {};
  entries[hollow] = price;
  return banked(entries);
}

function held(ceiling: Ceiling, n: number): DelveMeta {
  return book({ capsules: { [ceiling]: n } });
}

/** Open `n` capsules in a row, threading the meta through each draw the way the store would. */
function draw(
  start: DelveMeta,
  seed: number,
  ceiling: Ceiling,
  n: number,
): { reveals: CapsuleReveal[]; meta: DelveMeta } {
  let meta = { ...start, capsules: { ...start.capsules, [ceiling]: n } };
  const reveals: CapsuleReveal[] = [];
  for (let i = 0; i < n; i += 1) {
    const out = openCapsule(meta, seed, ceiling);
    expect(out.ok).toBe(true);
    meta = out.meta;
    reveals.push(out.reveal!);
  }
  return { reveals, meta };
}

/** A book that has hammered one skill: that skill's tag and element are now the player's own. */
function favouriteBook(tag: BoonTagish): DelveMeta {
  const favourite = SKILLS.find((s) => s.tag === tag && s.element);
  if (!favourite) throw new Error(`no ${tag} skill carries an element`);
  return book({ skills: { [favourite.id]: { level: 1, uses: 4, lifetime: 40 } } });
}

type BoonTagish = 'guard' | 'fury' | 'fortune' | 'vigor' | 'thrift';

/* ------------------------------------------------------------------ provenance ledger */

describe('material provenance', () => {
  it('keeps the printed total equal to the sum of the ledger after every write', () => {
    let meta = bankMaterials(emptyMeta(), 1, { ore: 3, herb: 2, echo: 1 });
    meta = bankMaterials(meta, 3, { ore: 1, herb: 0, echo: 4 });
    const books = [meta, craftCapsule(meta).meta, spendMaterials(meta, CAPSULE_COST).meta];
    for (const m of books) {
      expect(ledgerTotal(materialsLedger(m))).toEqual(m.materials);
    }
  });

  it('attributes a legacy book to the deepest Hollow it has cleared', () => {
    const legacy = book({ materials: { ore: 5, herb: 2, echo: 1 }, clearedHollows: [1, 2] });
    expect(materialsLedger(legacy)).toEqual({
      1: { ore: 0, herb: 0, echo: 0 },
      2: { ore: 5, herb: 2, echo: 1 },
      3: { ore: 0, herb: 0, echo: 0 },
    });
    // With nothing cleared there is nowhere credible to attribute it, so the ledger starts at H1.
    expect(materialsLedger(book({ materials: { ore: 2, herb: 0, echo: 0 } }))[1].ore).toBe(2);
  });

  it('banks into the Hollow the run actually walked', () => {
    const meta = banked({ 1: { ore: 4, herb: 4, echo: 0 }, 3: { ore: 2, herb: 1, echo: 0 } });
    expect(meta.materials).toEqual({ ore: 6, herb: 5, echo: 0 });
    expect(meta.materialsFrom?.[3]).toEqual({ ore: 2, herb: 1, echo: 0 });
  });

  it('spends from the deepest Hollow that can pay', () => {
    const meta = banked({ 1: { ore: 9, herb: 9, echo: 0 }, 3: { ore: 2, herb: 1, echo: 0 } });
    const out = spendMaterials(meta, CAPSULE_COST);
    expect(out.ok).toBe(true);
    expect(out.paidFrom).toBe(3);
    expect(out.meta.materialsFrom?.[3]).toEqual({ ore: 0, herb: 0, echo: 0 });
    expect(out.meta.materialsFrom?.[1]).toEqual({ ore: 9, herb: 9, echo: 0 });
  });

  it('names the deepest contributor when several Hollows combine to one price', () => {
    const meta = banked({ 1: { ore: 9, herb: 9, echo: 0 }, 3: { ore: 1, herb: 0, echo: 0 } });
    const out = spendMaterials(meta, CAPSULE_COST);
    expect(out.ok).toBe(true);
    expect(out.paidFrom).toBe(3);
    // Hollow 3 had one of the two Ore and no Herb, so it gave the Ore it held and Hollow 1 topped up.
    expect(out.meta.materialsFrom?.[3]).toEqual({ ore: 0, herb: 0, echo: 0 });
    expect(out.meta.materialsFrom?.[1]).toEqual({ ore: 8, herb: 8, echo: 0 });
  });

  it('refuses a price the total cannot cover and leaves the book alone', () => {
    const meta = banked({ 2: { ore: 1, herb: 1, echo: 0 } });
    const out = spendMaterials(meta, CAPSULE_COST);
    expect(out.ok).toBe(false);
    expect(out.meta).toBe(meta);
    expect(out.paidFrom).toBeNull();
  });

  it('refuses a book whose pools cannot pay even though its total says they can', () => {
    const inconsistent = book({ materials: { ore: 9, herb: 9, echo: 0 }, materialsFrom: {} });
    const out = spendMaterials(inconsistent, CAPSULE_COST);
    expect(out.ok).toBe(false);
    expect(out.meta).toBe(inconsistent);
  });
});

/* ------------------------------------------------------------------ crafting */

describe('crafting a capsule', () => {
  it('costs materials alone — no Embers, no oil, ever', () => {
    expect(CAPSULE_COST).toEqual({ ore: 2, herb: 1, echo: 0 });
    expect(Object.keys(CAPSULE_COST).sort()).toEqual(['echo', 'herb', 'ore']);
    const meta = { ...oneCeiling(1, { ore: 8, herb: 8, echo: 8 }), embers: 500 };
    const out = craftCapsule(meta);
    expect(out.meta.embers).toBe(500);
    expect(out.meta.materials.echo).toBe(8);
    expect(out.meta.materials.ore).toBe(6);
  });

  it('sets the ceiling from the Hollow that paid (§7 D.3)', () => {
    expect(CAPSULE_CEILING).toEqual({ 1: 'rare', 2: 'epic', 3: 'mythic' });
    for (const hollow of [1, 2, 3] as HollowId[]) {
      const out = craftCapsule(oneCeiling(hollow, { ore: 4, herb: 4, echo: 0 }));
      expect(out.ok, `Hollow ${hollow}`).toBe(true);
      expect(out.ceiling).toBe(CAPSULE_CEILING[hollow]);
      expect(out.meta.capsules[out.ceiling!]).toBe(1);
    }
  });

  it('refuses without the price and says what a capsule costs', () => {
    const out = craftCapsule(book({ embers: 999 }));
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('2 Ore');
    expect(out.meta.capsules).toEqual({});
  });

  it('stacks held capsules by make and reads junk keys as empty', () => {
    let meta = oneCeiling(2, { ore: 30, herb: 30, echo: 0 });
    for (let i = 0; i < 3; i += 1) meta = craftCapsule(meta).meta;
    expect(capsulesHeld(meta)).toEqual({ rare: 0, epic: 3, mythic: 0 });
    expect(capsulesHeld(book({ capsules: { rare: 2, bogus: 5, epic: -1 } }))).toEqual({
      rare: 2,
      epic: 0,
      mythic: 0,
    });
  });
});

/* ------------------------------------------------------------------ the three pity layers */

describe('the no-dud floor (§7 D.4 layer 1)', () => {
  it('never holds a Common, at any ceiling', () => {
    for (const seed of SEEDS) {
      for (const ceiling of CEILINGS) {
        const { reveals } = draw(held(ceiling, 200), seed, ceiling, 200);
        for (const r of reveals) {
          expect(r.rarity).not.toBe('common');
          expect(CEILING_BAND[ceiling]).toContain(r.rarity);
        }
      }
    }
  });

  it('leaves Common out of every band, because Commons are known rather than drawn', () => {
    for (const ceiling of CEILINGS) expect(CEILING_BAND[ceiling]).not.toContain('common');
  });
});

describe('hard pity (§7 D.4 layer 2)', () => {
  it('never lets an Epic-or-better go further than ten misses', () => {
    for (const seed of SEEDS) {
      for (const ceiling of ['epic', 'mythic'] as Ceiling[]) {
        const { reveals } = draw(held(ceiling, 1000), seed, ceiling, 1000);
        let miss = 0;
        let worst = 0;
        let epics = 0;
        for (const r of reveals) {
          if (r.rarity === 'epic' || r.rarity === 'mythic') {
            epics += 1;
            miss = 0;
          } else {
            miss += 1;
            worst = Math.max(worst, miss);
          }
        }
        expect(worst, `${ceiling} seed ${seed}`).toBeLessThanOrEqual(HARD_PITY);
        expect(epics).toBeGreaterThan(0);
      }
    }
  });

  it('pays out the moment the counter reaches ten', () => {
    const out = openCapsule({ ...held('epic', 1), pitySinceEpic: HARD_PITY }, 7, 'epic');
    const rarity = out.reveal!.rarity;
    expect(rarity === 'epic' || rarity === 'mythic').toBe(true);
    expect(out.meta.pitySinceEpic).toBe(0);
  });

  it('is not spent or advanced by a capsule that could never pay it', () => {
    const due = { ...held('rare', 1), pitySinceEpic: HARD_PITY };
    const out = openCapsule(due, 7, 'rare');
    expect(out.meta.pitySinceEpic).toBe(HARD_PITY);
    const rarity = out.reveal!.rarity;
    expect(rarity === 'epic' || rarity === 'mythic').toBe(false);
    // …and the disclosure for that same capsule promises no Epic either.
    expect(capsuleOdds('rare', HARD_PITY).map((o) => o.rarity)).toEqual(CEILING_BAND.rare);
  });
});

describe('relevance (§7 D.4 layer 3)', () => {
  it('reads the most-used tag and element off lifetime uses, not the loadout', () => {
    const meta = favouriteBook('fury');
    expect(dominantTag(meta)).toBe('fury');
    expect(dominantElement(meta)).toBe(SKILLS.find((s) => s.tag === 'fury' && s.element)!.element);
    expect(dominantTag(book({}))).toBeNull();
    expect(dominantElement(book({}))).toBeNull();
  });

  it('puts a match inside every three capsules', () => {
    for (const tag of ['guard', 'fury', 'fortune', 'vigor', 'thrift'] as BoonTagish[]) {
      for (const seed of SEEDS) {
        const meta = favouriteBook(tag);
        const tagOf = dominantTag(meta)!;
        const elementOf = dominantElement(meta)!;
        const { reveals } = draw(meta, seed, 'epic', 300);
        let miss = 0;
        for (const r of reveals) {
          const skill = skillById(r.skillId)!;
          miss = skill.tag === tagOf || skill.element === elementOf ? 0 : miss + 1;
          expect(miss, `${tag} seed ${seed}`).toBeLessThan(RELEVANCE_WINDOW);
        }
      }
    }
  });

  it('serves relevance without ever trading the rolled tier down', () => {
    // With no favourite to serve, the draw hands back exactly the tier it rolled, so a plain book
    // measures the roll itself. Same seed, same capsule number, same pity state: the only difference
    // between the two runs is the relevance filter, and it must never cost the player a tier.
    for (const seed of SEEDS) {
      for (const ceiling of ['epic', 'mythic'] as Ceiling[]) {
        let worse = 0;
        for (let index = 0; index < 60; index += 1) {
          const rolled = openCapsule(
            { ...held(ceiling, 1), capsuleIndex: index },
            seed,
            ceiling,
          ).reveal!;
          const served = openCapsule(
            {
              ...favouriteBook('guard'),
              capsules: { [ceiling]: 1 },
              capsuleIndex: index,
              capsuleTagStreak: RELEVANCE_WINDOW - 1,
            },
            seed,
            ceiling,
          ).reveal!;
          expect(CEILING_BAND[ceiling]).toContain(served.rarity);
          if (RARITIES.indexOf(served.rarity) < RARITIES.indexOf(rolled.rarity)) worse += 1;
        }
        expect(worse, `${ceiling} seed ${seed}`).toBe(0);
      }
    }
  });

  it('does nothing for a brand-new collection with no favourite yet', () => {
    const { meta } = draw(book({}), 7, 'epic', 20);
    expect(meta.capsuleTagStreak).toBeGreaterThan(RELEVANCE_WINDOW);
  });
});

/* ------------------------------------------------------------------ disclosure */

describe('the odds printed before opening (§7 D.4)', () => {
  it('sums to a hundred percent for every ceiling and pity state', () => {
    for (const ceiling of CEILINGS) {
      for (const pity of [0, 5, HARD_PITY, 40]) {
        const total = capsuleOdds(ceiling, pity).reduce((sum, o) => sum + o.percent, 0);
        expect(total).toBeCloseTo(100, 1);
      }
    }
  });

  it('describes the band the draw actually reads', () => {
    expect(capsuleOdds('rare', 0).map((o) => o.rarity)).toEqual(CEILING_BAND.rare);
    expect(capsuleOdds('epic', 0).map((o) => o.rarity)).toEqual(CEILING_BAND.epic);
    expect(capsuleOdds('mythic', HARD_PITY).map((o) => o.rarity)).toEqual(['epic', 'mythic']);
    expect(capsuleOdds('epic', HARD_PITY)).toEqual([{ rarity: 'epic', percent: 100 }]);
  });

  it('is the distribution the draws land in — with hard pity only ever adding Epics', () => {
    const n = 4000;
    const disclosed = capsuleOdds('epic', 0);
    const { reveals } = draw(book({}), 20261025, 'epic', n);
    for (const { rarity, percent } of disclosed) {
      const seen = (reveals.filter((r) => r.rarity === rarity).length / n) * 100;
      expect(Math.abs(seen - percent), `${rarity}: ${seen}% vs ${percent}%`).toBeLessThan(5);
    }
  });
});

/* ------------------------------------------------------------------ granting */

describe('what a capsule pays out', () => {
  it('teaches a new skill at level one and pays a duplicate as Skill Dust (§7 D.6)', () => {
    const { reveals, meta } = draw(book({}), 12345, 'epic', 300);
    const seen = new Set<string>();
    let expectedDust = 0;
    for (const r of reveals) {
      if (seen.has(r.skillId)) {
        expect(r.duplicate).toBe(true);
        expectedDust += DUST_BY_RARITY[r.rarity];
      } else {
        seen.add(r.skillId);
        expect(r.duplicate).toBe(false);
      }
    }
    expect(meta.dust).toBe(expectedDust);
    expect(Object.keys(meta.skills).sort()).toEqual([...seen].sort());
    for (const id of seen) {
      expect(meta.skills[id]).toEqual({ level: 1, uses: 0, lifetime: 0 });
    }
    expect(expectedDust).toBeGreaterThan(0);
  });

  it('spends one capsule and prints one reveal per open', () => {
    const out = openCapsule(held('mythic', 4), 7, 'mythic');
    expect(out.ok).toBe(true);
    expect(out.meta.capsules.mythic).toBe(3);
    expect(out.meta.capsuleIndex).toBe(1);
    expect(out.meta.capsuleReveal).toEqual(out.reveal);
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('refuses a make the player is not holding', () => {
    const start = held('rare', 1);
    const out = openCapsule(start, 7, 'mythic');
    expect(out.ok).toBe(false);
    expect(out.reveal).toBeNull();
    expect(out.meta).toBe(start);
  });

  it('clears the reveal without touching the prize once the player acknowledges it', () => {
    const opened = openCapsule(held('epic', 2), 7, 'epic').meta;
    const dismissed = dismissCapsuleReveal(opened);
    expect(dismissed.capsuleReveal).toBeNull();
    expect(dismissed.skills).toEqual(opened.skills);
    expect(dismissed.dust).toBe(opened.dust);
    expect(dismissed.capsuleIndex).toBe(opened.capsuleIndex);
  });
});

/* ------------------------------------------------------------------ §14 exit condition */

describe('the draw is decided when it is drawn (§7 D.5)', () => {
  it('gives the same prize every time for the same book seed and capsule number', () => {
    for (const seed of SEEDS) {
      const meta = held('mythic', 1);
      const first = openCapsule(meta, seed, 'mythic');
      for (let i = 0; i < 20; i += 1) {
        expect(openCapsule(meta, seed, 'mythic').reveal).toEqual(first.reveal);
      }
    }
  });

  it('keys the prize on the capsule number, so a different book draws differently', () => {
    const prizes = new Set<number>();
    for (let seed = 0; seed < 200; seed += 1) {
      const r = openCapsule(held('mythic', 1), seed, 'mythic').reveal!;
      prizes.add(SKILLS.findIndex((s) => s.id === r.skillId));
    }
    expect(prizes.size).toBeGreaterThan(10);
  });

  it('cannot be rerolled by closing and reopening: the grant and the index move together', () => {
    const start = held('epic', 3);
    const opened = openCapsule(start, 7, 'epic');
    // The prize already lives in the meta the store would have written, before any animation ran.
    const granted = skillById(opened.reveal!.skillId)!;
    expect(opened.meta.skills[granted.id]).toBeDefined();

    // Reload, acknowledge, and open the next capsule: it is a different capsule, at a new index.
    const afterDismiss = dismissCapsuleReveal(opened.meta);
    const next = openCapsule(afterDismiss, 7, 'epic');
    expect(next.reveal!.index).toBe(opened.reveal!.index + 1);
    expect(next.meta.capsules.epic).toBe(1);
    expect(next.meta.skills[granted.id]).toBeDefined();

    // And re-opening from the original book is not a reroll route: it is the same first draw again.
    expect(openCapsule(start, 7, 'epic').reveal).toEqual(opened.reveal);
  });

  it('fuzzes every ceiling and seed with no dud and no reroll-by-reload', () => {
    for (const seed of SEEDS) {
      let meta = book({ capsules: { rare: 60, epic: 60, mythic: 60 } });
      const indices: number[] = [];
      for (const ceiling of CEILINGS) {
        for (let i = 0; i < 60; i += 1) {
          const before = meta.capsuleIndex;
          const out = openCapsule(meta, seed, ceiling);
          expect(out.ok).toBe(true);
          expect(out.reveal!.rarity).not.toBe('common');
          expect(CEILING_BAND[ceiling]).toContain(out.reveal!.rarity);
          expect(out.meta.capsuleIndex).toBe(before + 1);
          // A capsule that was spent always left a prize behind in the same write.
          expect(out.meta.skills[out.reveal!.skillId]).toBeDefined();
          meta = { ...JSON.parse(JSON.stringify(out.meta)) };
          indices.push(out.reveal!.index);
        }
      }
      expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b));
      expect(capsulesHeld(meta)).toEqual({ rare: 0, epic: 0, mythic: 0 });
    }
  });
});
