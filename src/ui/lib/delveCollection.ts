/**
 * What the collection screens print (§7 D.1–D.6).
 *
 * The rule `delveReadout.ts` already follows: every band, odds and number comes from the engine's own
 * functions. `craftPreview` says what a craft would produce before anything is spent, `capsuleOdds`
 * gives the distribution drawn from the capsule's own band and the live pity counter, `knowCap` /
 * `isKnown` / `movesetFor` settle the four slots, and `dustToLevel` / `potencyPercent` price the ladder.
 * A screen therefore cannot flatter a draw it did not compute, and the disclosure a player reads before
 * buying is the same table the buy itself uses.
 *
 * What is not known stays unsaid: a skill the book has never been handed keeps its name off the Codex,
 * and a capsule that cannot be paid for lists what is missing instead of promising a ceiling.
 */

import {
  CAPSULE_COST,
  CEILING_BAND,
  DUST_BY_RARITY,
  EQUIP_SLOTS,
  HARD_PITY,
  KNOW_CAPS,
  MAX_SKILL_LEVEL,
  RARITIES,
  RELEVANCE_WINDOW,
  SKILLS,
  USES_PER_DUST,
  buildActives,
  buildPassive,
  capsulesHeld,
  craftPreview,
  capsuleOdds,
  dominantElement,
  dominantTag,
  dustToLevel,
  isFreeSkill,
  isKnown,
  isLeveled,
  knowCap,
  level5FxOf,
  movesetFor,
  potencyPercent,
  reachesLevel5,
  skillById,
  skillDefOf,
  type BoonTag,
  type BuildId,
  type CapsuleCeiling,
  type DelveMeta,
  type Rarity,
} from '../../core/delve';
import { C } from '../../art/palette';
import { hollowName } from './delveView';

const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  mythic: 'Mythic',
};

/** The tier's own ramp ink — the same five ramps the art already uses, so a row is coloured by its tier. */
const TIER_COLOR: Record<Rarity, number> = {
  common: C.steel1,
  uncommon: C.moss1,
  rare: C.frost1,
  epic: C.violet1,
  mythic: C.rose1,
};

export function tierColor(rarity: Rarity | null): number {
  return rarity === null ? C.paper1 : TIER_COLOR[rarity];
}

export function rarityLabel(rarity: Rarity | null): string {
  return rarity ? RARITY_LABEL[rarity] : 'Build';
}

function bandText(ceiling: CapsuleCeiling): string {
  return CEILING_BAND[ceiling].map((rarity) => RARITY_LABEL[rarity]).join(' → ');
}

function makeName(ceiling: CapsuleCeiling): string {
  return `${RARITY_LABEL[ceiling]} make`;
}

/** One tier's share of a capsule's band, in the words the disclosure prints. */
export interface TierOdds {
  rarity: Rarity;
  label: string;
  percent: number;
}

function oddsRows(ceiling: CapsuleCeiling, pitySinceEpic: number): TierOdds[] {
  return capsuleOdds(ceiling, pitySinceEpic).map((row) => ({
    ...row,
    label: RARITY_LABEL[row.rarity],
  }));
}

/** A make the player already holds, with the odds it would pay out at if opened now. */
export interface CapsuleRow {
  ceiling: CapsuleCeiling;
  name: string;
  count: number;
  /** 'Uncommon → Rare': the tiers this band can land on. */
  band: string;
  odds: TierOdds[];
  /** Hard pity never fires for a make whose band cannot reach Epic (§7 D.4 layer 2). */
  reachesEpic: boolean;
  pityLine: string;
}

/** The buy line, planned against the ledger before anything is spent. */
export interface CraftLine {
  canCraft: boolean;
  cost: string;
  /** Which of the three materials the book is short of. */
  missing: string[];
  ceiling: CapsuleCeiling | null;
  name: string;
  band: string;
  odds: TierOdds[];
  /** The Hollow whose materials would pay, so the player can see where the band comes from. */
  paidFrom: string;
}

export interface PityLine {
  since: number;
  target: number;
  /** Filled pips, out of `target`. */
  filled: number;
  due: boolean;
  line: string;
}

export interface RelevanceLine {
  streak: number;
  window: number;
  /** This is the third capsule in a row that missed, so the next one owes a match. */
  due: boolean;
  tag: string;
  element: string;
  line: string;
}

/** The capsule already drawn and already granted, as the reveal sheet prints it (§7 D.5). */
export interface RevealLine {
  index: number;
  capsule: string;
  name: string;
  rarity: Rarity;
  tierLabel: string;
  kind: string;
  effect: string;
  level5: string;
  /** The rung is bought, so the modifier above is in play. */
  reached5: boolean;
  duplicate: boolean;
  dust: number;
}

export interface CapsuleBoard {
  rows: CapsuleRow[];
  held: number;
  craft: CraftLine;
  pity: PityLine;
  relevance: RelevanceLine;
  reveal: RevealLine | null;
}

export function capsuleBoard(meta: DelveMeta): CapsuleBoard {
  const held = capsulesHeld(meta);
  const pitySince = meta.pitySinceEpic ?? 0;
  const rows = (['rare', 'epic', 'mythic'] as CapsuleCeiling[])
    .map<CapsuleRow>((ceiling) => {
      const reachesEpic = CEILING_BAND[ceiling].some(
        (rarity) => rarity === 'epic' || rarity === 'mythic',
      );
      return {
        ceiling,
        name: makeName(ceiling),
        count: held[ceiling],
        band: bandText(ceiling),
        odds: oddsRows(ceiling, pitySince),
        reachesEpic,
        pityLine: reachesEpic
          ? `Epic or better in ${Math.max(1, HARD_PITY - pitySince)} more.`
          : 'Cannot reach Epic, so opening one never spends the pity.',
      };
    })
    .filter((row) => row.count > 0);

  const preview = craftPreview(meta);
  const materials = meta.materials ?? { ore: 0, herb: 0, echo: 0 };
  const missing: string[] = [];
  if (materials.ore < CAPSULE_COST.ore) missing.push('Ore');
  if (materials.herb < CAPSULE_COST.herb) missing.push('Herb');
  if (materials.echo < CAPSULE_COST.echo) missing.push('Echo');

  const tag = dominantTag(meta);
  const element = dominantElement(meta);
  const streak = meta.capsuleTagStreak ?? 0;
  const favourite = tag ? `${tag} tag` : element ? `${element} element` : '';

  const reveal = meta.capsuleReveal ?? null;
  const revealSkill = reveal ? skillById(reveal.skillId) : undefined;

  return {
    rows,
    held: rows.reduce((sum, row) => sum + row.count, 0),
    craft: {
      canCraft: preview.canCraft,
      cost: `${CAPSULE_COST.ore} Ore · ${CAPSULE_COST.herb} Herb`,
      missing,
      ceiling: preview.ceiling,
      name: preview.ceiling ? makeName(preview.ceiling) : '',
      band: preview.ceiling ? bandText(preview.ceiling) : '',
      odds: preview.ceiling ? oddsRows(preview.ceiling, pitySince) : [],
      paidFrom: preview.paidFrom ? hollowName(preview.paidFrom) : '',
    },
    pity: {
      since: pitySince,
      target: HARD_PITY,
      filled: Math.min(pitySince, HARD_PITY),
      due: pitySince >= HARD_PITY,
      line: `An Epic or better lands after ${HARD_PITY} that miss. ${pitySince} so far.`,
    },
    relevance: {
      streak,
      window: RELEVANCE_WINDOW,
      due: streak >= RELEVANCE_WINDOW - 1 && favourite !== '',
      tag: tag ?? '',
      element: element ?? '',
      line: favourite
        ? `One capsule in every ${RELEVANCE_WINDOW} matches your ${favourite}.`
        : `One capsule in every ${RELEVANCE_WINDOW} matches what you use most. Nothing swung yet, so any prize counts.`,
    },
    reveal:
      reveal && revealSkill
        ? {
            index: reveal.index,
            capsule: makeName(reveal.ceiling),
            name: revealSkill.name,
            rarity: reveal.rarity,
            tierLabel: RARITY_LABEL[reveal.rarity],
            kind: revealSkill.kind === 'active' ? 'Active' : 'Passive',
            effect: revealSkill.effect,
            level5: revealSkill.level5,
            reached5: reachesLevel5(meta.skills?.[reveal.skillId]?.level),
            duplicate: reveal.duplicate,
            dust: reveal.duplicate ? DUST_BY_RARITY[reveal.rarity] : 0,
          }
        : null,
  };
}

/** One skill's rung on the Dust ladder, priced against the wallet. */
export interface DustRow {
  id: string;
  name: string;
  rarity: Rarity | null;
  tierLabel: string;
  kind: string;
  level: number;
  maxed: boolean;
  /** '+16%': the potency this level already pays. */
  potency: string;
  /** '+24%': what the next rung pays. Empty at the top. */
  nextPotency: string;
  /** Dust the next rung costs, or null when there is no rung left to buy. */
  cost: number | null;
  afford: boolean;
  rungLine: string;
  /** Swings banked toward the next dust — §7 D.6 keeps the remainder. */
  usesLine: string;
  lifetime: number;
  /** The LV5 modifier's own line. Empty for a build's skill, which has no rung to attach. */
  rung5: string;
  hasRung: boolean;
  reached5: boolean;
}

function tierRank(rarity: Rarity | null): number {
  return rarity === null ? 0 : 1 + RARITIES.indexOf(rarity);
}

/**
 * Every skill the book holds an entry for.
 *
 * An entry appears when a capsule hands one over or when a run first swings it, which is why a build's
 * own actives show up here at LV1 with 3/10 on the clock rather than being absent.
 */
export function dustRows(meta: DelveMeta): DustRow[] {
  const wallet = meta.dust ?? 0;
  const rows: DustRow[] = [];
  for (const [id, state] of Object.entries(meta.skills ?? {})) {
    const def = skillDefOf(id);
    if (!def) continue;
    const catalogue = skillById(id);
    const level = Math.min(MAX_SKILL_LEVEL, Math.max(1, state.level));
    const cost = dustToLevel(level + 1);
    const hasRung = level5FxOf(id) !== undefined;
    rows.push({
      id,
      name: def.name,
      rarity: catalogue?.rarity ?? null,
      tierLabel: rarityLabel(catalogue?.rarity ?? null),
      kind: def.kind === 'active' ? 'Active' : 'Passive',
      level,
      maxed: level >= MAX_SKILL_LEVEL,
      potency: `+${potencyPercent(level)}%`,
      nextPotency: cost === null ? '' : `+${potencyPercent(level + 1)}%`,
      cost,
      afford: cost !== null && wallet >= cost,
      rungLine:
        cost === null
          ? `LV${MAX_SKILL_LEVEL} reached.`
          : `LV${level + 1} costs ${cost} Skill Dust · ${wallet} held.`,
      usesLine: `${state.uses}/${USES_PER_DUST} swings toward the next dust.`,
      lifetime: state.lifetime,
      rung5: catalogue?.level5 ?? '',
      hasRung,
      reached5: hasRung && reachesLevel5(level),
    });
  }
  return rows.sort(
    (a, b) =>
      tierRank(a.rarity) - tierRank(b.rarity) || b.level - a.level || a.name.localeCompare(b.name),
  );
}

/** One equipped slot — an active in the four, or the one passive in play. */
export interface SlotRow {
  id: string;
  name: string;
  tierLabel: string;
  kind: string;
  /** The element the move carries; empty for a build passive with none. */
  element: string;
  effect: string;
  level: number;
  leveled: boolean;
  /** The build's own skill: it was in the slots before the collection existed. */
  innate: boolean;
  canUnequip: boolean;
}

/** A skill the moveset screen offers a decision about, with the reason it is or is not available. */
export interface MoveRow {
  id: string;
  name: string;
  rarity: Rarity | null;
  tierLabel: string;
  kind: string;
  effect: string;
  tag: BoonTag | '';
  level: number;
  /** The book has an entry: a capsule handed it over, or a run wrote it down. */
  held: boolean;
  /** A Common — learnable with no capsule at all (§7 D.2, settled in 7c-4). */
  free: boolean;
  /** The build grants this one, so it needs no know slot and no learning. */
  innate: boolean;
  known: boolean;
  equipped: boolean;
  canLearn: boolean;
  learnNote: string;
  canEquip: boolean;
  equipNote: string;
  /** A known passive the slot could take. The build's own passive is what this replaces. */
  canEquipPassive: boolean;
  /** This skill sits in a slot the companion could empty between runs. */
  canUnequip: boolean;
  canForget: boolean;
}

export interface MovesetBoard {
  cap: number;
  knownCount: number;
  spare: number;
  capLine: string;
  nextCapLine: string;
  slots: SlotRow[];
  slotLine: string;
  passive: SlotRow | null;
  passiveLine: string;
  /** What the companion already knows, in the order it learned it. */
  known: MoveRow[];
  /** What it could learn next: the free Commons plus anything a capsule has handed over. */
  learnable: MoveRow[];
  lockLine: string;
}

function innateSet(buildId: BuildId | string): Set<string> {
  const passive = buildPassive(buildId);
  return new Set([...buildActives(buildId).map((s) => s.id), ...(passive ? [passive.id] : [])]);
}

/** The next know ceiling and the level that raises it, read off the table `knowCap` walks. */
function nextCapText(level: number): string {
  const current = knowCap(level);
  const band = [...KNOW_CAPS].sort((a, b) => a.at - b.at).find((entry) => entry.at > level);
  return band
    ? `Level ${band.at} raises what the companion can know to ${band.knows}.`
    : `Level ${level} is the widest the companion gets: ${current} known.`;
}

export function movesetBoard(
  meta: DelveMeta,
  companionLevel: number,
  buildId: BuildId | string,
  runActive: boolean,
): MovesetBoard {
  const cap = knowCap(companionLevel);
  const knownList = meta.knownSkills ?? [];
  const innate = innateSet(buildId);
  const set = movesetFor(meta, buildId);
  const equipped = set.actives.map((s) => s.id);

  const toRow = (id: string): MoveRow | null => {
    const def = skillDefOf(id);
    if (!def) return null;
    const catalogue = skillById(id);
    const knowable = isKnown(meta, id, buildId);
    const heldEntry = Boolean(meta.skills?.[id]);
    const alreadyKnown = knownList.includes(id);
    const knowFull = knownList.length >= cap;
    const inSlot = equipped.includes(id);
    const movesFull = equipped.length >= EQUIP_SLOTS;
    const inPassiveSlot = meta.equippedPassive === id && set.passive?.id === id;
    return {
      id,
      name: def.name,
      rarity: catalogue?.rarity ?? null,
      tierLabel: rarityLabel(catalogue?.rarity ?? null),
      kind: def.kind === 'active' ? 'Active' : 'Passive',
      effect: def.effect,
      tag: catalogue?.tag ?? '',
      level: meta.skills?.[id]?.level ?? 1,
      held: heldEntry,
      free: isFreeSkill(id),
      innate: innate.has(id),
      known: knowable,
      equipped: inSlot || inPassiveSlot,
      canLearn:
        !runActive &&
        !alreadyKnown &&
        !innate.has(id) &&
        (isFreeSkill(id) || heldEntry) &&
        !knowFull,
      learnNote: alreadyKnown
        ? 'Known.'
        : innate.has(id)
          ? 'The build grants this one — no know slot needed.'
          : !isFreeSkill(id) && !heldEntry
            ? 'Needs a capsule first.'
            : knowFull
              ? `Knows ${knownList.length}/${cap} — forget one to learn this.`
              : 'Learn it.',
      canEquip: !runActive && knowable && def.kind === 'active' && !inSlot && !movesFull,
      equipNote: !knowable
        ? 'Learn it first.'
        : def.kind !== 'active'
          ? 'The passive slot only.'
          : inSlot
            ? 'In a slot.'
            : movesFull
              ? `All ${EQUIP_SLOTS} slots are full.`
              : 'Equip it.',
      canEquipPassive: !runActive && knowable && def.kind === 'passive' && !inPassiveSlot,
      canUnequip: !runActive && (inSlot || inPassiveSlot),
      canForget: !runActive && alreadyKnown && !inSlot && !inPassiveSlot,
    };
  };

  const rowsOf = (ids: string[]): MoveRow[] =>
    ids.map(toRow).filter((row): row is MoveRow => row !== null);

  const learnableIds = SKILLS.filter(
    (s) =>
      !innate.has(s.id) &&
      !knownList.includes(s.id) &&
      (isFreeSkill(s.id) || Boolean(meta.skills?.[s.id])),
  ).map((s) => s.id);

  return {
    cap,
    knownCount: knownList.length,
    spare: Math.max(0, cap - knownList.length),
    capLine: `A level-${companionLevel} companion knows ${cap} skills. ${knownList.length} known, ${Math.max(0, cap - knownList.length)} spare.`,
    nextCapLine: nextCapText(companionLevel),
    slots: set.actives.map((s) => {
      const level = meta.skills?.[s.id]?.level ?? 1;
      return {
        id: s.id,
        name: s.name,
        tierLabel: rarityLabel(skillById(s.id)?.rarity ?? null),
        kind: s.kind === 'active' ? 'Active' : 'Passive',
        element: s.element ?? '',
        effect: s.effect,
        level,
        leveled: isLeveled(level),
        innate: innate.has(s.id),
        canUnequip: !runActive,
      };
    }),
    slotLine: `Slots ${set.actives.length}/${EQUIP_SLOTS}. The build's own two actives start in them and cost no know slot; unequipping one leaves it out.`,
    passive: set.passive
      ? {
          id: set.passive.id,
          name: set.passive.name,
          tierLabel: rarityLabel(skillById(set.passive.id)?.rarity ?? null),
          kind: 'Passive',
          element: set.passive.element ?? '',
          effect: set.passive.effect,
          level: meta.skills?.[set.passive.id]?.level ?? 1,
          leveled: isLeveled(meta.skills?.[set.passive.id]?.level ?? 1),
          innate: innate.has(set.passive.id),
          canUnequip: !runActive && Boolean(meta.equippedPassive),
        }
      : null,
    passiveLine:
      meta.equippedPassive && set.passive?.id === meta.equippedPassive
        ? 'A collected passive is in play.'
        : "The build's own passive is in play.",
    known: rowsOf(knownList),
    learnable: rowsOf(learnableIds),
    lockLine:
      'The slots change between runs — a fight you are in keeps the moveset it started with.',
  };
}

/** One entry on the Codex's skills tab. */
export interface CodexSkillRow {
  id: string;
  name: string;
  tierLabel: string;
  kind: string;
  tag: BoonTag | '';
  element: string;
  effect: string;
  level5: string;
  level: number;
  usesLine: string;
  known: boolean;
}

export interface CodexSkillGroup {
  rarity: Rarity;
  label: string;
  count: number;
  discovered: number;
  rows: CodexSkillRow[];
}

export interface SkillLibrary {
  total: number;
  discovered: number;
  groups: CodexSkillGroup[];
}

/**
 * The Codex's skills tab.
 *
 * An entry the book has never been handed keeps its name off the page and the count of what is missing
 * is printed instead — the same way the species shelves do it, so a hint cannot become a list to farm.
 * What the companion currently has equipped is deliberately not here: the Workshop owns that question,
 * and a museum that answers it has to pick a kit to be wrong about.
 */
export function skillLibrary(meta: DelveMeta): SkillLibrary {
  const entries = meta.skills ?? {};
  const knownList = meta.knownSkills ?? [];
  const groups = RARITIES.map<CodexSkillGroup>((rarity) => {
    const tier = SKILLS.filter((s) => s.rarity === rarity);
    const rows: CodexSkillRow[] = [];
    for (const skill of tier) {
      const state = entries[skill.id];
      if (!state) continue;
      rows.push({
        id: skill.id,
        name: skill.name,
        tierLabel: RARITY_LABEL[skill.rarity],
        kind: skill.kind === 'active' ? 'Active' : 'Passive',
        tag: skill.tag,
        element: skill.element ?? '',
        effect: skill.effect,
        level5: skill.level5,
        level: state.level,
        usesLine: `${state.uses}/${USES_PER_DUST} toward dust · ${state.lifetime} lifetime.`,
        known: knownList.includes(skill.id),
      });
    }
    return {
      rarity,
      label: RARITY_LABEL[rarity],
      count: tier.length,
      discovered: rows.length,
      rows,
    };
  });
  return {
    total: SKILLS.length,
    discovered: groups.reduce((sum, group) => sum + group.discovered, 0),
    groups,
  };
}
