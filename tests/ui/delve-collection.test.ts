/**
 * Gate 7c-5 — the print-logic behind the collection screens.
 *
 * These tests hold the line `delveReadout.ts` already holds: a screen may print only what the engine
 * computes. The strongest version of that is the capsule preview — the make and the odds the Workshop
 * names before the player commits are read back out of the craft that follows, so a disclosure cannot
 * promise a band the ledger would not have paid for. The moveset rows are pinned the same way: every
 * affordance the panel prints is the rule `learnSkill` / `equipSkill` would apply, and the Codex prints
 * nothing at all about an entry the book has never been handed.
 */

import { describe, expect, it } from 'vitest';
import {
  CEILING_BAND,
  DEFAULT_BUILD,
  DUST_BY_RARITY,
  EQUIP_SLOTS,
  HARD_PITY,
  MAX_SKILL_LEVEL,
  RELEVANCE_WINDOW,
  SKILLS,
  USES_PER_DUST,
  buildActives,
  buildPassive,
  capsuleOdds,
  craftCapsule,
  dustToLevel,
  emptyMeta,
  equipSkill,
  forgetSkill,
  knowCap,
  learnSkill,
  levelUpSkill,
  openCapsule,
  settleSkillUses,
  skillById,
  type CapsuleCeiling,
  type DelveMeta,
  type HollowId,
  type Materials,
} from '../../src/core/delve';
import { bankMaterials } from '../../src/core/delve/materials';
import {
  capsuleBoard,
  dustRows,
  movesetBoard,
  skillLibrary,
  type MoveRow,
} from '../../src/ui/lib/delveCollection';

const WARDEN = DEFAULT_BUILD;
const PRICE: Materials = { ore: 2, herb: 1, echo: 0 };

function commons(count: number): string[] {
  return SKILLS.filter((s) => s.rarity === 'common')
    .slice(0, count)
    .map((s) => s.id);
}

/** A catalogue active, so the moveset tests have something a capsule would have to hand over. */
const RARE_ACTIVE = SKILLS.find((s) => s.rarity === 'rare' && s.kind === 'active')!;
const COMMON_ACTIVE = SKILLS.find((s) => s.rarity === 'common' && s.kind === 'active')!;
/** The Commons are all actives (§7 D.1's 22), so the only passive a low-level book can reach is here. */
const UNCOMMON_PASSIVE = SKILLS.find((s) => s.rarity === 'uncommon' && s.kind === 'passive')!;

function banked(entries: Partial<Record<HollowId, Materials>>): DelveMeta {
  let meta = emptyMeta();
  for (const id of [1, 2, 3] as HollowId[]) {
    const gain = entries[id];
    if (gain) meta = bankMaterials(meta, id, gain);
  }
  return meta;
}

function heldMeta(
  ceiling: CapsuleCeiling,
  count: number,
  over: Partial<DelveMeta> = {},
): DelveMeta {
  return { ...emptyMeta(), capsules: { [ceiling]: count }, ...over };
}

function rowById(rows: MoveRow[], id: string): MoveRow {
  const found = rows.find((row) => row.id === id);
  if (!found) throw new Error(`No row printed for ${id}.`);
  return found;
}

describe('the capsule board', () => {
  it('says what is missing before it offers a make', () => {
    const board = capsuleBoard(emptyMeta());
    expect(board.held).toBe(0);
    expect(board.rows).toEqual([]);
    expect(board.craft.canCraft).toBe(false);
    expect(board.craft.ceiling).toBe(null);
    expect(board.craft.name).toBe('');
    expect(board.craft.odds).toEqual([]);
    expect(board.craft.missing).toEqual(['Ore', 'Herb']);
    expect(board.craft.cost).toBe('2 Ore · 1 Herb');
  });

  it('names the make the craft actually produces, for every ledger that can pay', () => {
    const books = [
      banked({ 1: PRICE }),
      banked({ 2: PRICE }),
      banked({ 3: PRICE }),
      banked({ 1: { ore: 2, herb: 0, echo: 0 }, 2: { ore: 0, herb: 1, echo: 0 } }),
      banked({ 1: { ore: 9, herb: 9, echo: 0 }, 3: { ore: 0, herb: 1, echo: 0 } }),
      banked({ 1: { ore: 1, herb: 1, echo: 0 }, 2: { ore: 1, herb: 0, echo: 0 } }),
    ];
    for (const meta of books) {
      const preview = capsuleBoard(meta).craft;
      const crafted = craftCapsule(meta);
      expect(preview.canCraft).toBe(true);
      expect(crafted.ok).toBe(true);
      expect(preview.ceiling).toBe(crafted.ceiling);
    }
  });

  it('prints the Hollow that pays, because that is where the band comes from', () => {
    expect(capsuleBoard(banked({ 3: PRICE })).craft.paidFrom).toBe('Umbral Deep');
    expect(capsuleBoard(banked({ 3: PRICE })).craft.name).toBe('Mythic make');
    expect(capsuleBoard(banked({ 3: PRICE })).craft.band).toBe('Rare → Epic → Mythic');
    // The shallower pile tops up the deeper one, and the deeper one owns the ceiling.
    const mixed = capsuleBoard(
      banked({ 1: { ore: 2, herb: 0, echo: 0 }, 2: { ore: 0, herb: 1, echo: 0 } }),
    ).craft;
    expect(mixed.paidFrom).toBe('Cinder Vault');
    expect(mixed.name).toBe('Epic make');
  });

  it('lists the makes held with the odds drawn from their own band', () => {
    const board = capsuleBoard(heldMeta('epic', 2));
    expect(board.held).toBe(2);
    expect(board.rows).toHaveLength(1);
    const row = board.rows[0]!;
    expect(row.name).toBe('Epic make');
    expect(row.count).toBe(2);
    expect(row.reachesEpic).toBe(true);
    expect(row.odds).toEqual(
      capsuleOdds('epic', 0).map((entry) => ({ ...entry, label: expect.any(String) })),
    );
    expect(row.odds.reduce((sum, tier) => sum + tier.percent, 0)).toBe(100);
    expect(CEILING_BAND.epic).toHaveLength(3);
  });

  it('tells the player a Rare make never spends the hard pity', () => {
    const row = capsuleBoard(heldMeta('rare', 1)).rows[0]!;
    expect(row.reachesEpic).toBe(false);
    expect(row.pityLine).toContain('Cannot reach Epic');
    expect(row.odds.map((tier) => tier.rarity)).toEqual(['uncommon', 'rare']);
  });

  it('flips the disclosure to Epic-or-better once the pity is spent', () => {
    const board = capsuleBoard(heldMeta('mythic', 1, { pitySinceEpic: HARD_PITY }));
    expect(board.pity.due).toBe(true);
    expect(board.pity.filled).toBe(HARD_PITY);
    expect(board.rows[0]!.odds.map((tier) => tier.rarity)).toEqual(['epic', 'mythic']);
  });

  it('names the most-used tag once the book has swung something', () => {
    const swung = settleSkillUses(emptyMeta(), { [COMMON_ACTIVE.id]: 20 }).meta;
    const board = capsuleBoard(swung);
    expect(board.relevance.tag).toBe(COMMON_ACTIVE.tag);
    expect(board.relevance.line).toContain(COMMON_ACTIVE.tag);
    expect(board.relevance.due).toBe(false);
    const owing = capsuleBoard({ ...swung, capsuleTagStreak: RELEVANCE_WINDOW - 1 });
    expect(owing.relevance.due).toBe(true);
    expect(owing.relevance.window).toBe(RELEVANCE_WINDOW);
  });

  it('says nothing about a favourite before the first swing', () => {
    const board = capsuleBoard(emptyMeta());
    expect(board.relevance.tag).toBe('');
    expect(board.relevance.due).toBe(false);
    expect(board.relevance.line).toContain('Nothing swung yet');
  });

  it('prints the capsule already drawn, with the dust a duplicate paid', () => {
    const crafted = craftCapsule(banked({ 1: PRICE })).meta;
    const opened = openCapsule(crafted, 20261028, 'rare');
    expect(opened.ok).toBe(true);
    const reveal = capsuleBoard(opened.meta).reveal!;
    const skill = skillById(opened.reveal!.skillId)!;
    expect(reveal.name).toBe(skill.name);
    expect(reveal.tierLabel).toBe(skill.rarity === 'uncommon' ? 'Uncommon' : 'Rare');
    expect(reveal.effect).toBe(skill.effect);
    expect(reveal.level5).toBe(skill.level5);
    expect(reveal.reached5).toBe(false);
    expect(reveal.duplicate).toBe(opened.reveal!.duplicate);
    expect(reveal.dust).toBe(opened.reveal!.duplicate ? DUST_BY_RARITY[opened.reveal!.rarity] : 0);
    expect(reveal.capsule).toBe('Rare make');
  });

  it('shows no reveal sheet until a capsule is opened', () => {
    expect(capsuleBoard(heldMeta('rare', 1)).reveal).toBe(null);
  });
});

describe('the Dust ladder rows', () => {
  it('prints nothing for a book that holds nothing', () => {
    expect(dustRows(emptyMeta())).toEqual([]);
  });

  it('prices the next rung off the same table the button reads', () => {
    const meta = settleSkillUses(emptyMeta(), { [RARE_ACTIVE.id]: 3 }).meta;
    const row = dustRows(meta)[0]!;
    expect(row.id).toBe(RARE_ACTIVE.id);
    expect(row.level).toBe(1);
    expect(row.potency).toBe('+0%');
    expect(row.nextPotency).toBe('+8%');
    expect(row.cost).toBe(dustToLevel(2));
    expect(row.rungLine).toBe(`LV2 costs ${dustToLevel(2)} Skill Dust · 0 held.`);
    expect(row.usesLine).toBe(`3/${USES_PER_DUST} swings toward the next dust.`);
    expect(row.lifetime).toBe(3);
    expect(row.afford).toBe(false);
  });

  it('moves the wallet when a rung is bought', () => {
    const bought = levelUpSkill(
      { ...settleSkillUses(emptyMeta(), { [RARE_ACTIVE.id]: 3 }).meta, dust: 20 },
      RARE_ACTIVE.id,
    );
    expect(bought.ok).toBe(true);
    const row = dustRows(bought.meta)[0]!;
    expect(row.level).toBe(2);
    expect(row.potency).toBe('+8%');
    expect(row.cost).toBe(dustToLevel(3));
    expect(row.rungLine).toBe(`LV3 costs ${dustToLevel(3)} Skill Dust · 15 held.`);
    // LV3 costs exactly what is left, so the ladder is affordable to the last rung.
    expect(row.afford).toBe(true);
  });

  it('reaches the top rung with its modifier named', () => {
    let meta: DelveMeta = {
      ...settleSkillUses(emptyMeta(), { [RARE_ACTIVE.id]: 1 }).meta,
      dust: 999,
    };
    for (let level = 2; level <= MAX_SKILL_LEVEL; level++)
      meta = levelUpSkill(meta, RARE_ACTIVE.id).meta;
    const row = dustRows(meta)[0]!;
    expect(row.level).toBe(MAX_SKILL_LEVEL);
    expect(row.maxed).toBe(true);
    expect(row.cost).toBe(null);
    expect(row.rungLine).toBe(`LV${MAX_SKILL_LEVEL} reached.`);
    expect(row.hasRung).toBe(true);
    expect(row.reached5).toBe(true);
    expect(row.rung5).toBe(skillById(RARE_ACTIVE.id)!.level5);
  });

  it('gives a build’s own skill potency and no rung', () => {
    const innateId = buildActives(WARDEN)[0]!.id;
    const rows = dustRows(settleSkillUses(emptyMeta(), { [innateId]: 7 }).meta);
    const row = rows[0]!;
    expect(row.id).toBe(innateId);
    expect(row.tierLabel).toBe('Build');
    expect(row.hasRung).toBe(false);
    expect(row.rung5).toBe('');
    expect(row.reached5).toBe(false);
  });

  it('sorts the build’s own skills above the collection, cheapest tier first', () => {
    const [first, second] = buildActives(WARDEN);
    const meta = settleSkillUses(
      { ...emptyMeta(), skills: { [RARE_ACTIVE.id]: { level: 1, uses: 0, lifetime: 0 } } },
      { [first!.id]: 1, [second!.id]: 1, [COMMON_ACTIVE.id]: 1 },
    ).meta;
    const rows = dustRows(meta);
    expect(rows.map((row) => row.tierLabel)).toEqual(['Build', 'Build', 'Common', 'Rare']);
    // Two build skills at the same level fall back to name order, so the pair is asserted as a set.
    expect(
      rows
        .slice(0, 2)
        .map((row) => row.id)
        .sort(),
    ).toEqual([first!.id, second!.id].sort());
    expect(rows[3]!.id).toBe(RARE_ACTIVE.id);
  });
});

describe('the moveset board', () => {
  it('starts on the build’s own two actives and its own passive', () => {
    const board = movesetBoard(emptyMeta(), 1, WARDEN, false);
    expect(board.cap).toBe(knowCap(1));
    expect(board.knownCount).toBe(0);
    expect(board.spare).toBe(knowCap(1));
    expect(board.capLine).toContain('knows 6 skills');
    expect(board.nextCapLine).toBe('Level 5 raises what the companion can know to 10.');
    expect(board.slots.map((slot) => slot.id)).toEqual(buildActives(WARDEN).map((s) => s.id));
    expect(board.slots.every((slot) => slot.innate)).toBe(true);
    expect(board.passive?.id).toBe(buildPassive(WARDEN)!.id);
    expect(board.passive?.canUnequip).toBe(false);
    expect(board.passiveLine).toContain("The build's own passive");
    expect(board.learnable.length).toBeGreaterThan(0);
  });

  it('charges a know slot for a learned Common and a slot for the equipped one', () => {
    const learned = learnSkill(emptyMeta(), COMMON_ACTIVE.id, 1).meta;
    const equippedMeta = equipSkill(learned, COMMON_ACTIVE.id, WARDEN).meta;
    const board = movesetBoard(equippedMeta, 1, WARDEN, false);
    expect(board.knownCount).toBe(1);
    expect(board.spare).toBe(knowCap(1) - 1);
    expect(board.slots).toHaveLength(buildActives(WARDEN).length + 1);
    expect(board.slotLine).toContain(`Slots ${buildActives(WARDEN).length + 1}/${EQUIP_SLOTS}`);
    const row = rowById(board.known, COMMON_ACTIVE.id);
    expect(row.known).toBe(true);
    expect(row.equipped).toBe(true);
    expect(row.free).toBe(true);
    expect(row.canEquip).toBe(false);
    expect(row.canForget).toBe(false);
    expect(board.learnable.some((entry) => entry.id === COMMON_ACTIVE.id)).toBe(false);
  });

  it('refuses to equip a fifth active and says why', () => {
    let meta = emptyMeta();
    const ids = commons(3);
    for (const id of ids) meta = learnSkill(meta, id, 1).meta;
    for (const id of ids.slice(0, 2)) meta = equipSkill(meta, id, WARDEN).meta;
    const board = movesetBoard(meta, 1, WARDEN, false);
    expect(board.slots).toHaveLength(EQUIP_SLOTS);
    const waiting = rowById(board.known, ids[2]!);
    expect(waiting.canEquip).toBe(false);
    expect(waiting.equipNote).toBe(`All ${EQUIP_SLOTS} slots are full.`);
  });

  it('holds the know cap shut before anything can be learned', () => {
    const meta = learn(emptyMeta(), commons(knowCap(1)), 1);
    const board = movesetBoard(meta, 1, WARDEN, false);
    expect(board.knownCount).toBe(knowCap(1));
    expect(board.spare).toBe(0);
    const next = board.learnable[0]!;
    expect(next.canLearn).toBe(false);
    expect(next.learnNote).toBe(`Knows ${knowCap(1)}/${knowCap(1)} — forget one to learn this.`);
  });

  it('keeps a capsule-only skill off the learn list until a capsule hands it over', () => {
    const board = movesetBoard(emptyMeta(), 35, WARDEN, false);
    expect(board.learnable.some((row) => row.id === RARE_ACTIVE.id)).toBe(false);
    const held = {
      ...emptyMeta(),
      skills: { [RARE_ACTIVE.id]: { level: 1, uses: 0, lifetime: 0 } },
    };
    const row = rowById(movesetBoard(held, 35, WARDEN, false).learnable, RARE_ACTIVE.id);
    expect(row.held).toBe(true);
    expect(row.free).toBe(false);
    expect(row.canLearn).toBe(true);
    expect(row.learnNote).toBe('Learn it.');
  });

  it('offers the passive slot only to a known passive', () => {
    // An Uncommon passive has to be handed over by a capsule before it can be learned at all.
    const granted: DelveMeta = {
      ...emptyMeta(),
      skills: { [UNCOMMON_PASSIVE.id]: { level: 1, uses: 0, lifetime: 0 } },
    };
    const meta = learnSkill(granted, UNCOMMON_PASSIVE.id, 1).meta;
    expect(meta.knownSkills).toContain(UNCOMMON_PASSIVE.id);
    const board = movesetBoard(meta, 1, WARDEN, false);
    const row = rowById(board.known, UNCOMMON_PASSIVE.id);
    expect(row.kind).toBe('Passive');
    expect(row.canEquip).toBe(false);
    expect(row.canEquipPassive).toBe(true);
    expect(board.passive?.canUnequip).toBe(false);
    const slotted = movesetBoard(
      { ...meta, equippedPassive: UNCOMMON_PASSIVE.id },
      1,
      WARDEN,
      false,
    );
    expect(slotted.passive?.id).toBe(UNCOMMON_PASSIVE.id);
    expect(slotted.passive?.canUnequip).toBe(true);
    expect(slotted.passiveLine).toContain('A collected passive is in play.');
    expect(rowById(slotted.known, UNCOMMON_PASSIVE.id).canEquipPassive).toBe(false);
    expect(rowById(slotted.known, UNCOMMON_PASSIVE.id).canForget).toBe(false);
  });

  it('never offers the build’s own skills as something to learn', () => {
    const swung = settleSkillUses(emptyMeta(), { [buildActives(WARDEN)[0]!.id]: 4 }).meta;
    const board = movesetBoard(swung, 1, WARDEN, false);
    expect(board.learnable.some((row) => row.innate)).toBe(false);
    expect(board.learnable.map((row) => row.id)).not.toContain(buildActives(WARDEN)[0]!.id);
  });

  it('locks every decision while a run is waiting for its next order', () => {
    const board = movesetBoard(emptyMeta(), 35, WARDEN, true);
    expect(board.lockLine).toContain('between runs');
    expect(board.slots.every((slot) => slot.canUnequip === false)).toBe(true);
    expect(board.learnable.every((row) => row.canLearn === false)).toBe(true);
    expect(board.known.every((row) => row.canForget === false)).toBe(true);
    expect(board.passive?.canUnequip).toBe(false);
  });
});

describe('the Codex skills tab', () => {
  it('counts all sixty and names none of them before a capsule hands one over', () => {
    const library = skillLibrary(emptyMeta());
    expect(library.total).toBe(60);
    expect(library.discovered).toBe(0);
    expect(library.groups.map((group) => group.count)).toEqual([22, 16, 12, 7, 3]);
    expect(library.groups.map((group) => group.discovered)).toEqual([0, 0, 0, 0, 0]);
    expect(library.groups[0]!.rows).toEqual([]);
  });

  it('prints a granted skill with its rung and its dust clock', () => {
    const crafted = craftCapsule(banked({ 1: PRICE })).meta;
    const opened = openCapsule(crafted, 4242, 'rare');
    const library = skillLibrary(opened.meta);
    expect(library.discovered).toBe(1);
    const row = library.groups.flatMap((group) => group.rows)[0]!;
    const skill = skillById(opened.reveal!.skillId)!;
    expect(row.id).toBe(skill.id);
    expect(row.name).toBe(skill.name);
    expect(row.effect).toBe(skill.effect);
    expect(row.level5).toBe(skill.level5);
    expect(row.tierLabel).toBe(skill.rarity === 'uncommon' ? 'Uncommon' : 'Rare');
    expect(row.level).toBe(1);
    expect(row.known).toBe(false);
    expect(row.usesLine).toContain('toward dust');
  });

  it('separates the entry in the book from the skill the companion knows', () => {
    const learned = learnSkill(emptyMeta(), COMMON_ACTIVE.id, 1).meta;
    expect(skillLibrary(learned).discovered).toBe(0);
    const withEntry = {
      ...learned,
      skills: { [COMMON_ACTIVE.id]: { level: 1, uses: 0, lifetime: 0 } },
    };
    expect(skillLibrary(withEntry).groups.flatMap((group) => group.rows)[0]!.known).toBe(true);
    const forgotten = forgetSkill(withEntry, COMMON_ACTIVE.id).meta;
    const row = skillLibrary(forgotten).groups.flatMap((group) => group.rows)[0]!;
    expect(row.known).toBe(false);
    expect(row.level).toBe(1);
  });
});

function learn(meta: DelveMeta, ids: string[], level: number): DelveMeta {
  let out = meta;
  for (const id of ids) out = learnSkill(out, id, level).meta;
  return out;
}
