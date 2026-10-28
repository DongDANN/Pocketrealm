/**
 * Gate 7c-4 — the four equipped slots behind the level-gated know list (DELVE_REDESIGN §7 D.2).
 *
 * §7 D.2 is the part of the collection that changes a fight, so these tests follow the path the rules
 * actually take: the book learns, the book equips, the run snapshots, combat resolves.
 *
 * The four readings pinned here, because each is a promise the UI has to keep:
 *
 * 1. **Knowing is a ceiling, not a cost.** It is charged by the companion's level and freed for
 *    nothing, so a Mythic a level-3 companion cannot hold is a prize not yet carried rather than a
 *    purchase — and forgetting never destroys the entry, its Dust level or its lifetime.
 * 2. **A capsule gates the other 38.** Gate 7c-2 kept the 22 Commons out of the capsule pool, so
 *   "free" means free to *learn*: they cost a know slot and nothing else.
 * 3. **Four slots, and the build's own skills spend no know slot.** Choosing Warden over Spark cannot
 *    become a progression loss (§2 invariant 5).
 * 4. **The run carries its own list.** §7 D.2 says respec is free *between runs*, which is also what
 *    keeps §2 invariant 6 honest: a paused room replays against the moveset it started with.
 */

import { describe, expect, it } from 'vitest';
import {
  buildById,
  clearPassive,
  emptyMeta,
  EQUIP_SLOTS,
  equipPassive,
  equipSkill,
  forgetSkill,
  FREE_SKILL_IDS,
  hitOf,
  isFreeSkill,
  isKnown,
  knowCap,
  learnSkill,
  newDailyRun,
  newRun,
  runMoveset,
  SKILLS,
  stepRun,
  turnMenu,
  unequipSkill,
  type AttackInput,
  type DelveMeta,
  type HitRecord,
  type RunState,
  type StepOutcome,
} from '../src/core/delve';
import { mkCtx, NO_SIGNALS, singleRowRun, TODAY } from './delve-helpers';

const WARDEN = buildById('warden')!;
const WARDEN_ACTIVES = WARDEN.skills.filter((s) => s.kind === 'active').map((s) => s.id);
const WARDEN_PASSIVE = WARDEN.skills.find((s) => s.kind === 'passive')!;

/** A Common active with an fx the resolver already honours, so a fight leaves visible evidence. */
const CINDER = SKILLS.find((s) => s.id === 'skill-cinder-cut')!;
/** A passive that changes how a fight opens, so the passive slot cannot read as decoration. */
const CELLAR = SKILLS.find((s) => s.id === 'skill-deep-cellar')!;
/** The next two Commons, so the four-slot test never needs a capsule. */
const BARK = SKILLS.find((s) => s.id === 'skill-bark-wall')!;
const THIRD = SKILLS.find(
  (s) => s.kind === 'active' && s.rarity === 'common' && s.id !== CINDER.id && s.id !== BARK.id,
)!;
/** An Uncommon active: not free to learn, since 7c-2 left Commons as the only capsule-free tier. */
const UNCOMMON_ACTIVE = SKILLS.find((s) => s.rarity === 'uncommon' && s.kind === 'active')!;
/** An order naming a skill the run does not carry, so `honour` has to refuse it outright. */
const CINDER_ORDER = { skillId: CINDER.id, targetIndex: 0, guard: false };

function metaWith(over: Partial<DelveMeta>): DelveMeta {
  return { ...emptyMeta(), ...over };
}

/** What a capsule prize leaves behind: an entry in the book, at LV1 with nothing swung yet. */
function capsuleHeld(id: string): DelveMeta {
  return metaWith({ skills: { [id]: { level: 1, uses: 0, lifetime: 0 } } });
}

function learned(meta: DelveMeta, id: string, level = 5): DelveMeta {
  const out = learnSkill(meta, id, level);
  expect(out.ok, out.reason).toBe(true);
  return out.meta;
}

/** The one-row skirmish from the helpers, with its roster named by the caller. */
function roomWith(enemies: string[], over: Partial<RunState> = {}): RunState {
  const base = singleRowRun('skirmish', over);
  const room = base.floorPlan.rows[0]![0]!;
  return { ...base, floorPlan: { ...base.floorPlan, rows: [[{ ...room, enemies }]] } };
}

describe('the know cap', () => {
  it('follows the bands of §7 D.2 and never falls below the first one', () => {
    expect([knowCap(0), knowCap(1), knowCap(4)]).toEqual([6, 6, 6]);
    expect([knowCap(5), knowCap(9)]).toEqual([10, 10]);
    expect([knowCap(10), knowCap(19)]).toEqual([16, 16]);
    expect([knowCap(20), knowCap(34)]).toEqual([24, 24]);
    expect([knowCap(35), knowCap(99)]).toEqual([40, 40]);
    expect(knowCap(Number.NaN)).toBe(6);
  });

  it('refuses the seventh skill a level-1 companion can hold and names the ceiling', () => {
    let meta = emptyMeta();
    for (const id of FREE_SKILL_IDS.slice(0, 6)) meta = learned(meta, id, 1);
    expect(meta.knownSkills).toHaveLength(6);
    const eighthId = FREE_SKILL_IDS[6]!;
    const eighth = learnSkill(meta, eighthId, 1);
    expect(eighth.ok).toBe(false);
    expect(eighth.reason).toBe(
      `A level-1 companion knows 6 skills. Forget one to learn ${SKILLS.find((s) => s.id === eighthId)!.name}.`,
    );
    expect(eighth.meta).toBe(meta);
  });

  it('opens the next band the moment the companion reaches it, and changes nothing else', () => {
    let meta = emptyMeta();
    for (const id of FREE_SKILL_IDS.slice(0, 6)) meta = learned(meta, id, 1);
    expect(learnSkill(meta, FREE_SKILL_IDS[7]!, 1).ok).toBe(false);
    const atFive = learnSkill(meta, FREE_SKILL_IDS[7]!, 5);
    expect(atFive.ok).toBe(true);
    expect(atFive.meta.knownSkills).toHaveLength(7);
    expect(atFive.meta.dust).toBe(meta.dust);
    expect(atFive.meta.capsuleIndex).toBe(meta.capsuleIndex);
  });

  it('never charges the build’s own skills, so choosing a build is not a progression loss', () => {
    expect(isKnown(emptyMeta(), WARDEN_ACTIVES[0]!, 'warden')).toBe(true);
    expect(isKnown(emptyMeta(), WARDEN_PASSIVE.id, 'warden')).toBe(true);
    const meta = learned(emptyMeta(), CINDER.id, 1);
    expect(meta.knownSkills).toEqual([CINDER.id]);
  });

  it('refuses an id the catalogue does not have, and a skill already known', () => {
    const ghost = learnSkill(emptyMeta(), 'skill-not-a-skill', 5);
    expect(ghost.ok).toBe(false);
    expect(ghost.reason).toBe('There is no such skill to learn.');
    const meta = learned(emptyMeta(), CINDER.id, 5);
    const twice = learnSkill(meta, CINDER.id, 5);
    expect(twice.ok).toBe(false);
    expect(twice.reason).toBe('Cinder Cut is already known.');
    expect(twice.meta).toBe(meta);
  });
});

describe('what a capsule has to hand over first', () => {
  it('keeps the 22 Commons free to learn and the other 38 behind a capsule', () => {
    expect(SKILLS).toHaveLength(60);
    expect(FREE_SKILL_IDS).toHaveLength(22);
    expect(SKILLS.filter((s) => s.rarity === 'common')).toHaveLength(22);
    for (const id of FREE_SKILL_IDS) expect(isFreeSkill(id)).toBe(true);
    for (const s of SKILLS) {
      if (s.rarity === 'common') continue;
      expect(isFreeSkill(s.id), `${s.id} is ${s.rarity}`).toBe(false);
    }
  });

  it('refuses a skill the book does not hold, then lets it in once a capsule has paid it out', () => {
    const cold = learnSkill(emptyMeta(), UNCOMMON_ACTIVE.id, 35);
    expect(cold.ok).toBe(false);
    expect(cold.reason).toBe(
      `${UNCOMMON_ACTIVE.name} has to come out of a capsule before the companion can learn it.`,
    );
    const held = learnSkill(capsuleHeld(UNCOMMON_ACTIVE.id), UNCOMMON_ACTIVE.id, 35);
    expect(held.ok).toBe(true);
    expect(held.meta.knownSkills).toEqual([UNCOMMON_ACTIVE.id]);
  });

  it('learns a Common that has never been drawn, and spends only the slot', () => {
    const out = learnSkill(emptyMeta(), CINDER.id, 1);
    expect(out.ok).toBe(true);
    expect(out.reason).toBe('The companion learned Cinder Cut.');
    expect(out.meta.dust).toBe(0);
    expect(out.meta.capsuleIndex).toBe(0);
    expect(out.meta.capsules).toEqual({});
  });
});

describe('forgetting', () => {
  it('frees the slot and keeps the entry, its level and its lifetime', () => {
    let meta = learned(capsuleHeld(UNCOMMON_ACTIVE.id), UNCOMMON_ACTIVE.id, 5);
    meta = { ...meta, skills: { [UNCOMMON_ACTIVE.id]: { level: 3, uses: 4, lifetime: 24 } } };
    const out = forgetSkill(meta, UNCOMMON_ACTIVE.id);
    expect(out.ok).toBe(true);
    expect(out.meta.knownSkills).toEqual([]);
    expect(out.meta.skills[UNCOMMON_ACTIVE.id]).toEqual({ level: 3, uses: 4, lifetime: 24 });
    expect(out.meta.dust).toBe(meta.dust);
  });

  it('refuses to empty a slot it is still standing in', () => {
    const meta = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden').meta;
    const blocked = forgetSkill(meta, CINDER.id);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toBe('Unequip it before forgetting it.');
    expect(forgetSkill(unequipSkill(meta, CINDER.id).meta, CINDER.id).ok).toBe(true);
  });

  it('refuses a skill that was never learned, without touching the book', () => {
    const meta = emptyMeta();
    const out = forgetSkill(meta, CINDER.id);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('That skill was never learned, so there is nothing to forget.');
    expect(out.meta).toBe(meta);
  });
});

describe('the four slots', () => {
  it('seed from the build, so equipping never silently drops its own two', () => {
    const out = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden');
    expect(out.ok).toBe(true);
    expect(out.meta.equippedSkills).toEqual([...WARDEN_ACTIVES, CINDER.id]);
  });

  it('takes only a skill the book knows', () => {
    const out = equipSkill(emptyMeta(), CINDER.id, 'warden');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('Cinder Cut is not known yet — learn it first.');
    expect(out.meta.equippedSkills).toEqual([]);
  });

  it('takes no passive', () => {
    const meta = learned(capsuleHeld(CELLAR.id), CELLAR.id, 35);
    const out = equipSkill(meta, CELLAR.id, 'warden');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('Only an active skill takes one of the four slots.');
  });

  it('refuses a fifth rather than overthrow one the player placed', () => {
    let meta = equipSkill(learned(emptyMeta(), CINDER.id, 35), CINDER.id, 'warden').meta;
    meta = equipSkill(learned(meta, BARK.id, 35), BARK.id, 'warden').meta;
    expect(meta.equippedSkills).toHaveLength(EQUIP_SLOTS);
    const out = equipSkill(learned(meta, THIRD.id, 35), THIRD.id, 'warden');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe(
      `All ${EQUIP_SLOTS} slots are full. Unequip one to make room for ${THIRD.name}.`,
    );
    expect(out.meta.equippedSkills).toEqual(meta.equippedSkills);
  });

  it('refuses a skill already in a slot', () => {
    const meta = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden').meta;
    const out = equipSkill(meta, CINDER.id, 'warden');
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('Cinder Cut is already equipped.');
  });

  it('reads the build’s own active as already in play, and puts the list back when unequipping ends', () => {
    const meta = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden').meta;
    const duplicate = equipSkill(meta, WARDEN_ACTIVES[0]!, 'warden');
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reason).toBe(
      `${WARDEN.skills.find((s) => s.id === WARDEN_ACTIVES[0])!.name} is already equipped.`,
    );
    expect(duplicate.meta.equippedSkills).toEqual(meta.equippedSkills);
    const emptied = unequipSkill(meta, CINDER.id);
    expect(emptied.ok).toBe(true);
    expect(emptied.meta.equippedSkills).toEqual(WARDEN_ACTIVES);
    expect(emptied.reason).toBe('That slot is free.');
    const last = unequipSkill(emptied.meta, WARDEN_ACTIVES[1]!);
    expect(last.meta.equippedSkills).toEqual([WARDEN_ACTIVES[0]!]);
    const backToBuild = unequipSkill(last.meta, WARDEN_ACTIVES[0]!);
    expect(backToBuild.ok).toBe(true);
    expect(backToBuild.meta.equippedSkills).toEqual([]);
    expect(backToBuild.reason).toBe('The companion fights with its build again.');
  });

  it('refuses to unequip a skill that is not equipped', () => {
    const meta = emptyMeta();
    const out = unequipSkill(meta, CINDER.id);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('That skill is not equipped.');
    expect(out.meta).toBe(meta);
  });
});

describe('the passive slot', () => {
  it('holds one known passive and clears back to the build’s own', () => {
    const meta = learned(capsuleHeld(CELLAR.id), CELLAR.id, 35);
    const out = equipPassive(meta, CELLAR.id, 'warden');
    expect(out.ok).toBe(true);
    expect(out.reason).toBe('Deep Cellar is the companion’s passive.');
    expect(out.meta.equippedPassive).toBe(CELLAR.id);
    expect(runMoveset(newRun(12345, 1, 5, out.meta)).passive?.id).toBe(CELLAR.id);
    const cleared = clearPassive(out.meta);
    expect(cleared.ok).toBe(true);
    expect(cleared.meta.equippedPassive).toBeUndefined();
    expect(runMoveset(newRun(12345, 1, 5, cleared.meta)).passive?.id).toBe(WARDEN_PASSIVE.id);
  });

  it('refuses the clear when the build’s own is already in play', () => {
    const meta = emptyMeta();
    const out = clearPassive(meta);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('The build’s own passive is already the one in play.');
    expect(out.meta).toBe(meta);
  });

  it('takes no active and nothing the book has not learned', () => {
    const active = equipPassive(learned(emptyMeta(), CINDER.id, 35), CINDER.id, 'warden');
    expect(active.ok).toBe(false);
    expect(active.reason).toBe('The passive slot takes a passive skill.');
    const unknown = equipPassive(emptyMeta(), CELLAR.id, 'warden');
    expect(unknown.ok).toBe(false);
    expect(unknown.reason).toBe('Deep Cellar is not known yet — learn it first.');
  });
});

describe('the run carries its own moveset', () => {
  it('writes neither key for a book that has equipped nothing', () => {
    const run = newRun(12345, 1, 5, emptyMeta());
    expect(run.moveset).toBeUndefined();
    expect(run.passiveId).toBeUndefined();
    expect(runMoveset(run).actives.map((s) => s.id)).toEqual(WARDEN_ACTIVES);
    expect(runMoveset(run).passive?.id).toBe(WARDEN_PASSIVE.id);
  });

  it('snapshots only what differs from the build’s own list', () => {
    const meta = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden').meta;
    const run = newRun(12345, 1, 5, meta);
    expect(run.moveset).toEqual([...WARDEN_ACTIVES, CINDER.id]);
    expect(run.passiveId).toBeUndefined();
  });

  it('replays the room against the list it started with, not the book as it now stands', () => {
    const book = equipSkill(learned(emptyMeta(), CINDER.id, 5), CINDER.id, 'warden').meta;
    const run = roomWith(['tollbug', 'tollbug'], { moveset: book.equippedSkills });
    const entry = stepRun(run, mkCtx(book));
    const after = unequipSkill(book, CINDER.id).meta;
    expect(after.equippedSkills).toEqual(WARDEN_ACTIVES);
    const menu = turnMenu(entry.run, after, NO_SIGNALS, entry.pause!);
    expect(menu.skills.map((s) => s.id)).toContain(CINDER.id);
  });

  it('leaves the Daily Challenge on its fixed loadout whatever the book carries', () => {
    let meta = equipSkill(learned(capsuleHeld(CELLAR.id), CINDER.id, 35), CINDER.id, 'warden').meta;
    meta = equipPassive(learned(meta, CELLAR.id, 35), CELLAR.id, 'warden').meta;
    const created = newDailyRun(TODAY, meta);
    expect('run' in created).toBe(true);
    if (!('run' in created)) return;
    expect(created.run.moveset).toBeUndefined();
    expect(created.run.passiveId).toBeUndefined();
  });
});

describe('combat resolves from the moveset', () => {
  /** Give the room basic attacks until the named skill is affordable, then swing it at the first enemy. */
  function swing(run: RunState, skillId: string): StepOutcome {
    const meta = emptyMeta();
    let out = stepRun(run, mkCtx(meta));
    for (let guard = 0; guard < 12 && out.pause; guard++) {
      const menu = turnMenu(out.run, meta, NO_SIGNALS, out.pause);
      const ready = !!menu.skills.find((s) => s.id === skillId)?.ready;
      out = stepRun(
        out.run,
        mkCtx(meta, { order: { skillId: ready ? skillId : null, targetIndex: 0, guard: false } }),
      );
      if (ready) return out;
    }
    throw new Error(`${skillId} never became ready inside the guard`);
  }

  function playerRecords(out: StepOutcome): HitRecord[] {
    const lines = out.pause ? out.pause.log : out.run.log;
    return lines
      .map(hitOf)
      .filter((hit): hit is HitRecord => hit !== null && hit.side === 'player');
  }

  it('lists the moveset on the menu, not the build', () => {
    const run = roomWith(['tollbug', 'tollbug'], { moveset: [...WARDEN_ACTIVES, CINDER.id] });
    const entry = stepRun(run, mkCtx(emptyMeta()));
    const menu = turnMenu(entry.run, emptyMeta(), NO_SIGNALS, entry.pause!);
    expect(menu.skills.map((s) => s.id)).toEqual([...WARDEN_ACTIVES, CINDER.id]);
  });

  it('swings an equipped catalogue skill and lands the fx that catalogue entry promises', () => {
    const run = roomWith(['tollbug', 'tollbug'], { moveset: [...WARDEN_ACTIVES, CINDER.id] });
    const out = swing(run, CINDER.id);
    expect(out.pause, 'the room ended before the burn could be read').toBeDefined();
    const hit = playerRecords(out).find((r) => r.skillId === CINDER.id);
    expect(hit, 'Cinder Cut never swung').toBeDefined();
    expect((hit!.input as AttackInput).power).toBe(CINDER.power);
    expect(out.pause!.enemies.some((e) => e.statuses.some((s) => s.id === 'burn'))).toBe(true);
    expect(out.pause!.log.some((l) => l.text.includes('gains Burn.'))).toBe(true);
  });

  it('refuses an order naming a skill the run does not carry', () => {
    const meta = emptyMeta();
    const entry = stepRun(roomWith(['tollbug', 'tollbug']), mkCtx(meta));
    expect(entry.pause).toBeDefined();
    const refused = stepRun(entry.run, mkCtx(meta, { order: CINDER_ORDER }));
    expect(refused.run.orders).toEqual(entry.run.orders);
    expect(refused.pause).toBeDefined();
    expect(playerRecords(refused).some((r) => r.skillId === CINDER.id)).toBe(false);
    expect(
      turnMenu(refused.run, meta, NO_SIGNALS, refused.pause!).skills.map((s) => s.id),
    ).not.toContain(CINDER.id);
  });

  it('opens the fight behind the equipped passive, not the build’s own', () => {
    const run = roomWith(['tollbug'], { passiveId: CELLAR.id });
    const entry = stepRun(run, mkCtx(emptyMeta()));
    const lines = (entry.pause ? entry.pause.log : entry.run.log).map((l) => l.text);
    expect(lines.some((t) => t.startsWith(`${CELLAR.name} grants 10 Shield.`))).toBe(true);
    expect(lines.some((t) => t.startsWith(`${WARDEN_PASSIVE.name} grants`))).toBe(false);
  });

  it('keeps the build’s own opening shield when the run carries no passive of its own', () => {
    const entry = stepRun(roomWith(['tollbug']), mkCtx(emptyMeta()));
    const lines = (entry.pause ? entry.pause.log : entry.run.log).map((l) => l.text);
    expect(lines.some((t) => t.startsWith(`${WARDEN_PASSIVE.name} grants 1 Shield.`))).toBe(true);
  });
});
