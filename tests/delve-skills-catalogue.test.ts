/**
 * Gate 7c-1 — the skill catalogue.
 *
 * DELVE_REDESIGN §7 D.1 asks for 60 original skills at launch, spread over the five rarity ramps in
 * fixed counts (22 / 16 / 12 / 7 / 3 — `src/art/palette.ts` already draws a colour ramp per tier, so
 * the top ramp costs nothing to reach), each carrying one of the existing boon tags so the tag-chain
 * multiplier reaches the moveset without a new axis. These tests are the authoring
 * contract: they fail the moment a skill is added without a tag, a tier drifts off its count, an id
 * repeats, or an active is written in a vocabulary combat cannot honour.
 */

import { describe, expect, it } from 'vitest';
import { BOON_TAGS } from '../src/core/delve/data/boons';
import { ELEMENTS } from '../src/core/delve/data/elements';
import {
  RARITIES,
  SKILLS,
  type CatalogueSkill,
  skillById,
  skillsOfRarity,
  skillsWithTag,
} from '../src/core/delve/data/skills';
import { STATUSES } from '../src/core/delve/data/statuses';

/** §7 D.1's launch table. */
const TIER_COUNTS: Record<string, number> = {
  common: 22,
  uncommon: 16,
  rare: 12,
  epic: 7,
  mythic: 3,
};

describe('the 60-skill catalogue (§7 D.1)', () => {
  it('holds exactly sixty skills', () => {
    expect(SKILLS).toHaveLength(60);
  });

  it('keeps every tier at its launch count', () => {
    for (const rarity of RARITIES) {
      expect(skillsOfRarity(rarity), `${rarity} tier`).toHaveLength(TIER_COUNTS[rarity]);
    }
  });

  it('names every id uniquely and after the skill it prints', () => {
    const ids = SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const skill of SKILLS) {
      expect(skill.id, `id ${skill.id} does not match its name`).toBe(
        `skill-${skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      );
    }
  });

  it('gives every skill exactly one existing boon tag, and spreads the tags', () => {
    for (const skill of SKILLS) {
      expect(BOON_TAGS, `${skill.id} has no legal tag`).toContain(skill.tag);
    }
    // One tag carrying the catalogue would make the relevance pity layer (§7 D.4) a formality.
    for (const tag of BOON_TAGS) {
      expect(
        skillsWithTag(tag).length,
        `tag ${tag} is too thin to draw from`,
      ).toBeGreaterThanOrEqual(6);
    }
  });

  it('prices every active the way combat reads one', () => {
    for (const skill of SKILLS.filter((s) => s.kind === 'active')) {
      expect(skill.energyCost, `${skill.id} has no energy cost`).toBeGreaterThan(0);
      expect(skill.cooldown, `${skill.id} has no cooldown`).toBeGreaterThan(0);
      expect(skill.power ?? 0, `${skill.id} has no power`).toBeGreaterThan(0);
      expect(skill.element ?? '', `${skill.id} has no element`).toBeTruthy();
    }
  });

  it('uses only the effect vocabulary the resolver knows', () => {
    const statuses = new Set(STATUSES.map((s) => s.id));
    const elements = new Set(Object.keys(ELEMENTS));
    for (const skill of SKILLS) {
      const fx = skill.fx as { status?: string; shieldPercent?: number; percent?: number };
      if (fx && 'status' in fx && fx.status)
        expect(statuses, `${skill.id} status`).toContain(fx.status);
      if (skill.element) expect(elements, `${skill.id} element`).toContain(skill.element);
    }
  });

  it('promises only what a passive can deliver', () => {
    // The resolver honours exactly two passive effects, so a passive is free to promise nothing else.
    const opens = /shield|cushion|blunt|wall/i;
    const burns = /burn|fire|alight|flame|embers?/i;
    for (const skill of SKILLS.filter((s) => s.kind === 'passive')) {
      const fx = skill.fx as { kind: string; amount?: number; duration?: number };
      expect(['startShield', 'critBurn'], `${skill.id} passive kind`).toContain(fx.kind);
      if (fx.kind === 'startShield') {
        expect(skill.effect, `${skill.id} copies a shield it does not raise`).toMatch(opens);
        expect(fx.amount ?? 0, `${skill.id} shield amount`).toBeGreaterThan(0);
      } else {
        expect(skill.effect, `${skill.id} copies a fire it does not light`).toMatch(burns);
        expect(fx.duration ?? 0, `${skill.id} burn duration`).toBeGreaterThan(0);
      }
    }
  });

  it('promises only what the resolver can do', () => {
    // A skill is a promise the turn panel prints and the player pays energy against, so the copy may
    // not claim the two things `combat.ts` has no vocabulary for: hitting more than one target, and
    // giving energy back. §7 D.6's level-5 line is exempt — it is the one surface 7c-3 may invent.
    const overreach =
      /all (?:targets|of them)|every enemy|the whole (?:floor|room)|everything (?:it touches|left)|refunds?|comes back: energy|saves the energy|costs nothing/i;
    for (const skill of SKILLS) {
      expect(skill.effect, `${skill.id} promises more than one target or a refund`).not.toMatch(
        overreach,
      );
    }
  });

  it('attaches a level-5 modifier to every skill, since that is what levels are for (§7 D.6)', () => {
    for (const skill of SKILLS) {
      expect(skill.level5, `${skill.id} has no level-5 effect`).toBeTruthy();
      expect(skill.level5!.length, `${skill.id} has an empty level-5 effect`).toBeGreaterThan(3);
    }
  });

  it('keeps copy original: no effect string repeats and none is filler', () => {
    const effects = SKILLS.map((s) => s.effect);
    expect(new Set(effects).size).toBe(60);
    for (const skill of SKILLS) {
      expect(skill.effect.length, `${skill.id} has thin copy`).toBeGreaterThan(24);
      expect(skill.effect, `${skill.id} leaves a placeholder`).not.toMatch(/TBD|lorem|TODO/i);
    }
  });

  it('rises in power with its tier, so a Mythic draw is worth the pity', () => {
    const avg = (list: CatalogueSkill[]): number =>
      list.reduce((sum, s) => sum + (s.power ?? 0), 0) / (list.length || 1);
    const common = avg(skillsOfRarity('common'));
    const mythic = avg(skillsOfRarity('mythic'));
    expect(mythic).toBeGreaterThan(common * 1.3);
  });

  it('looks up by id and refuses to invent one', () => {
    expect(skillById(SKILLS[0]!.id)).toBe(SKILLS[0]);
    expect(skillById('skill-not-a-skill')).toBeUndefined();
  });
});
