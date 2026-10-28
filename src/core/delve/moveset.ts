/**
 * The companion moveset — four equipped slots behind a level-gated know list (DELVE_REDESIGN §7 D.2).
 *
 * §7 D.2 gives the collection two gates and this module owns both:
 *
 * - **Knowing is a ceiling that grows with the companion's level** — 1-4 knows 6, 5-9 knows 10,
 *   10-19 knows 16, 20-34 knows 24, 35+ knows 40. That is the Pokémon-style evolution gate: a Mythic
 *   a level-3 companion cannot hold is not a prize yet, and the ceiling is what makes 60 entries a
 *   progression instead of a shopping list.
 * - **Equipping stays at four,** so a build is still legible in the turn panel.
 *
 * Two readings the spec leaves open, settled here:
 *
 * - **The 22 Commons are free to _learn_, not already known.** Gate 7c-2 took them out of the capsule
 *   pool (no dud means no Common prize), and a level-1 ceiling of 6 cannot hold all 22 — so "free"
 *   means they cost a know slot and nothing else. The other 38 require a capsule to have handed one
 *   over first.
 * - **A build's own skills spend no know slot.** They are the build's identity, like its stat profile
 *   and its passive. Charging a know slot for them would make choosing Warden over Spark a progression
 *   loss, which §2 invariant 5 forbids in anything but name.
 *
 * Equipping is a campfire decision. §7 D.2 says respec is free *between runs*, and that rule is also
 * what keeps a stored run honest: combat resolves from the moveset snapshotted onto the run, so a
 * paused room replays against the list it started with. Letting the book change underneath a stored
 * order would break §2 invariant 6, so the controller refuses the change while a run is active rather
 * than pretending it takes effect now.
 */

import { BUILDS, DEFAULT_BUILD, buildById, type SkillDef } from './data/builds';
import { SKILLS, skillById } from './data/skills';
import type { DelveMeta, RunState } from './types';

/** §7 D.2: four slots, so builds stay legible. */
export const EQUIP_SLOTS = 4;

/** The know ceiling per level band (§7 D.2), highest band first. */
export const KNOW_CAPS: readonly { at: number; knows: number }[] = [
  { at: 35, knows: 40 },
  { at: 20, knows: 24 },
  { at: 10, knows: 16 },
  { at: 5, knows: 10 },
  { at: 1, knows: 6 },
];

/** How many skills a companion of `level` can know. */
export function knowCap(level: number): number {
  const floor = KNOW_CAPS[KNOW_CAPS.length - 1]!;
  const value = Number.isFinite(level) ? Math.trunc(level) : 1;
  for (const band of KNOW_CAPS) if (value >= band.at) return band.knows;
  return floor.knows;
}

/** The 22 Commons: everything learnable without a capsule, because 7c-2 kept them out of the pool. */
export const FREE_SKILL_IDS: readonly string[] = SKILLS.filter((s) => s.rarity === 'common').map(
  (s) => s.id,
);

export function isFreeSkill(id: string): boolean {
  return FREE_SKILL_IDS.includes(id);
}

const BUILD_SKILLS = new Map<string, SkillDef>(
  BUILDS.flatMap((build) => build.skills.map((s) => [s.id, s] as const)),
);

/** A skill id from the catalogue or from a build, in the shape combat reads. */
export function skillDefOf(id: string): SkillDef | undefined {
  return skillById(id) ?? BUILD_SKILLS.get(id);
}

function buildOr(id: string) {
  return buildById(id) ?? buildById(DEFAULT_BUILD)!;
}

/** The build's own two actives — always available, and never charged a know slot. */
export function buildActives(buildId: string): SkillDef[] {
  return buildOr(buildId).skills.filter((s) => s.kind === 'active');
}

/** The build's own passive, which the passive slot defaults to. */
export function buildPassive(buildId: string): SkillDef | undefined {
  return buildOr(buildId).skills.find((s) => s.kind === 'passive');
}

function innateIds(buildId: string): string[] {
  const passive = buildPassive(buildId);
  return [...buildActives(buildId).map((s) => s.id), ...(passive ? [passive.id] : [])];
}

/** What the book has learned. The know ceiling is charged against this list alone. */
export function learnedIds(meta: DelveMeta): string[] {
  return meta.knownSkills ?? [];
}

/** Innate or learned — the only two ways a skill can be equipped at all. */
export function isKnown(meta: DelveMeta, id: string, buildId: string): boolean {
  return learnedIds(meta).includes(id) || innateIds(buildId).includes(id);
}

export interface Moveset {
  actives: SkillDef[];
  passive: SkillDef | undefined;
}

function activesFrom(ids: readonly string[]): SkillDef[] {
  const out: SkillDef[] = [];
  for (const id of ids.slice(0, EQUIP_SLOTS)) {
    const def = skillDefOf(id);
    if (def && def.kind === 'active') out.push(def);
  }
  return out;
}

/** What this book fights with at run start: the equipped ids it may equip, else the build's own. */
export function movesetFor(meta: DelveMeta, buildId: string): Moveset {
  const wanted = (meta.equippedSkills ?? []).filter((id) => isKnown(meta, id, buildId));
  const actives = activesFrom(wanted);
  const passiveId = meta.equippedPassive;
  const passive =
    passiveId && isKnown(meta, passiveId, buildId) ? skillDefOf(passiveId) : buildPassive(buildId);
  return { actives: actives.length > 0 ? actives : buildActives(buildId), passive };
}

/**
 * The part of a moveset a run carries: only what differs from the build's own list.
 *
 * A book that has never equipped anything writes neither key, so the stored shape of every run played
 * before the collection existed — and every golden and fuzz replay since — is untouched.
 */
export function movesetSnapshot(
  meta: DelveMeta,
  buildId: string,
): Pick<RunState, 'moveset' | 'passiveId'> {
  const set = movesetFor(meta, buildId);
  const defaultIds = buildActives(buildId).map((s) => s.id);
  const ids = set.actives.map((s) => s.id);
  const defaultPassive = buildPassive(buildId)?.id;
  return {
    ...(ids.join('|') === defaultIds.join('|') ? {} : { moveset: ids }),
    ...(set.passive?.id === defaultPassive ? {} : { passiveId: set.passive?.id }),
  };
}

/** The moveset a stored run fights with — its own snapshot, or its build's when it carries none. */
export function runMoveset(run: RunState): Moveset {
  const stored = run.moveset ? activesFrom(run.moveset) : [];
  const passiveId = run.passiveId;
  return {
    actives: stored.length > 0 ? stored : buildActives(run.buildId),
    passive: passiveId ? skillDefOf(passiveId) : buildPassive(run.buildId),
  };
}

export interface MovesetChange {
  ok: boolean;
  meta: DelveMeta;
  reason: string;
}

/**
 * Learn a skill: it takes one of the know slots this companion's level allows.
 *
 * Forgetting is free and never destroys the entry a run wrote, so the ceiling is a choice about what
 * to carry rather than a tax — which is why re-learning costs nothing but the slot.
 */
export function learnSkill(meta: DelveMeta, id: string, level: number): MovesetChange {
  const def = skillDefOf(id);
  if (!def) return { ok: false, meta, reason: 'There is no such skill to learn.' };
  if (learnedIds(meta).includes(id)) {
    return { ok: false, meta, reason: `${def.name} is already known.` };
  }
  if (!isFreeSkill(id) && !meta.skills?.[id]) {
    return {
      ok: false,
      meta,
      reason: `${def.name} has to come out of a capsule before the companion can learn it.`,
    };
  }
  const cap = knowCap(level);
  if (learnedIds(meta).length >= cap) {
    return {
      ok: false,
      meta,
      reason: `A level-${level} companion knows ${cap} skills. Forget one to learn ${def.name}.`,
    };
  }
  return {
    ok: true,
    reason: `The companion learned ${def.name}.`,
    meta: { ...meta, knownSkills: [...learnedIds(meta), id] },
  };
}

/** Free a know slot. The collection entry, its level and its lifetime all survive. */
export function forgetSkill(meta: DelveMeta, id: string): MovesetChange {
  const learned = learnedIds(meta);
  if (!learned.includes(id)) {
    return {
      ok: false,
      meta,
      reason: 'That skill was never learned, so there is nothing to forget.',
    };
  }
  if ((meta.equippedSkills ?? []).includes(id)) {
    return { ok: false, meta, reason: 'Unequip it before forgetting it.' };
  }
  return {
    ok: true,
    reason: 'The companion set that skill aside.',
    meta: { ...meta, knownSkills: learned.filter((known) => known !== id) },
  };
}

/** Put a known skill into one of the four slots. A full moveset is refused, never overthrown. */
export function equipSkill(meta: DelveMeta, id: string, buildId: string): MovesetChange {
  const def = skillDefOf(id);
  if (!def || def.kind !== 'active') {
    return { ok: false, meta, reason: 'Only an active skill takes one of the four slots.' };
  }
  if (!isKnown(meta, id, buildId)) {
    return { ok: false, meta, reason: `${def.name} is not known yet — learn it first.` };
  }
  const equipped = meta.equippedSkills ?? [];
  // The first change seeds from the build's own actives, so equipping never silently drops them — and
  // the same seeding is what makes one of those actives read as already in play rather than a duplicate.
  const seeded = equipped.length > 0 ? equipped : buildActives(buildId).map((s) => s.id);
  if (seeded.includes(id)) {
    return { ok: false, meta, reason: `${def.name} is already equipped.` };
  }
  if (seeded.length >= EQUIP_SLOTS) {
    return {
      ok: false,
      meta,
      reason: `All ${EQUIP_SLOTS} slots are full. Unequip one to make room for ${def.name}.`,
    };
  }
  return {
    ok: true,
    reason: `${def.name} takes a slot.`,
    meta: { ...meta, equippedSkills: [...seeded, id] },
  };
}

export function unequipSkill(meta: DelveMeta, id: string): MovesetChange {
  const equipped = meta.equippedSkills ?? [];
  if (!equipped.includes(id)) {
    return { ok: false, meta, reason: 'That skill is not equipped.' };
  }
  const left = equipped.filter((slot) => slot !== id);
  // Back to an empty list means back to the build's own two, which is the same fight as before.
  return {
    ok: true,
    reason: left.length === 0 ? 'The companion fights with its build again.' : 'That slot is free.',
    meta: { ...meta, equippedSkills: left },
  };
}

/** The passive slot holds one known passive, or nothing — which means the build's own. */
export function equipPassive(meta: DelveMeta, id: string, buildId: string): MovesetChange {
  const def = skillDefOf(id);
  if (!def || def.kind !== 'passive') {
    return { ok: false, meta, reason: 'The passive slot takes a passive skill.' };
  }
  if (!isKnown(meta, id, buildId)) {
    return { ok: false, meta, reason: `${def.name} is not known yet — learn it first.` };
  }
  return {
    ok: true,
    reason: `${def.name} is the companion’s passive.`,
    meta: { ...meta, equippedPassive: id },
  };
}

export function clearPassive(meta: DelveMeta): MovesetChange {
  if (!meta.equippedPassive) {
    return { ok: false, meta, reason: 'The build’s own passive is already the one in play.' };
  }
  const next = { ...meta };
  delete next.equippedPassive;
  return { ok: true, reason: 'The build’s own passive is in play again.', meta: next };
}
