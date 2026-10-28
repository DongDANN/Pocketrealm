/**
 * Gate 7c-1 — the skill catalogue, and Gate 7c-3b — the rungs that sit on top of it.
 *
 * DELVE_REDESIGN §7 D.1 asks for 60 original skills at launch, spread over the five rarity ramps in
 * fixed counts (22 / 16 / 12 / 7 / 3 — `src/art/palette.ts` already draws a colour ramp per tier, so
 * the top ramp costs nothing to reach), each carrying one of the existing boon tags so the tag-chain
 * multiplier reaches the moveset without a new axis. These tests are the authoring
 * contract: they fail the moment a skill is added without a tag, a tier drifts off its count, an id
 * repeats, or an active is written in a vocabulary combat cannot honour.
 *
 * §7 D.6 then puts a fifth rung under every one of those sixty, and 7c-3b gave it a closed vocabulary
 * (`Level5Fx`) instead of prose. The two halves of that contract are checked against each other here:
 * a rung may only be attached to a card whose own `fx` can carry it, and the `level5` line the Codex
 * prints must quote the total the resolver actually lands on — not the step it added, and not a noun
 * the fight cannot name. A ladder whose top rung prints a promise the resolver cannot keep is the UI
 * lie this project already agreed not to ship.
 */

import { describe, expect, it } from 'vitest';
import { fxAtLevel, passiveCritBurnRounds, passiveShieldAmount } from '../src/core/delve';
import { BOON_TAGS } from '../src/core/delve/data/boons';
import { ELEMENTS } from '../src/core/delve/data/elements';
import {
  LEVEL5_KINDS,
  RARITIES,
  SKILLS,
  type CatalogueSkill,
  type Level5Fx,
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
    // A skill is a promise the turn panel prints and the player pays energy against, so neither its
    // base copy nor its rung line may claim the things `combat.ts` has no vocabulary for: hitting a
    // whole room at once, and giving energy back. A spread rung reaches exactly one other enemy, which
    // is why "one other enemy" is legal and "every enemy" is not.
    const overreach =
      /all (?:targets|of them)|every enemy|the whole (?:floor|room)|everything (?:it touches|left)|refunds?|comes back: energy|saves the energy|costs nothing/i;
    for (const skill of SKILLS) {
      expect(skill.effect, `${skill.id} promises more than one target or a refund`).not.toMatch(
        overreach,
      );
      expect(skill.level5, `${skill.id} rung promises more than one target`).not.toMatch(overreach);
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

/** How the sixty rungs are distributed — the balance §15 Risk 2 put a ceiling on. */
const RUNG_COUNTS: Record<Level5Fx['kind'], number> = {
  statusRounds: 21,
  spread: 8,
  shieldPercent: 15,
  critPoints: 7,
  varianceFloor: 5,
  openingShield: 4,
};

/**
 * The number a rung line prints, per kind — or null for the two kinds that state no number.
 * Each is anchored on the noun it quantifies, so a line with a stray digit in it does not pass.
 */
const RUNG_NUMBER: Record<Level5Fx['kind'], RegExp | null> = {
  shieldPercent: /(\d+)% of the damage/g,
  statusRounds: /(\d+) rounds/g,
  critPoints: /\+(\d+) crit chance/g,
  openingShield: /behind (\d+) Shield/g,
  spread: null,
  varianceFloor: null,
};

/** The total the resolver lands on for the field this rung names, in the unit the prose prints. */
function rungTotal(skill: CatalogueSkill): number {
  const folded = fxAtLevel(skill, 5);
  switch (skill.level5Fx.kind) {
    case 'shieldPercent':
      return Math.round(folded.shieldPercent * 100);
    case 'statusRounds':
      // A passive's rung lengthens the fire its own crit lights, which `fxAtLevel` never reads.
      return skill.kind === 'passive' ? passiveCritBurnRounds(skill, 5) : folded.statusRounds;
    case 'critPoints':
      return folded.critPoints;
    case 'openingShield':
      return passiveShieldAmount(skill, 5);
    default:
      return 0;
  }
}

const hitFx = (skill: CatalogueSkill): { status?: string; shieldPercent?: number } =>
  (skill.fx ?? {}) as { status?: string; shieldPercent?: number };

describe('the level-5 rung (§7 D.6)', () => {
  it('attaches exactly one of the six rungs to every skill', () => {
    for (const skill of SKILLS) {
      expect(LEVEL5_KINDS, `${skill.id} has a rung outside the vocabulary`).toContain(
        skill.level5Fx.kind,
      );
      expect(skill.level5, `${skill.id} has no line for its rung`).toBeTruthy();
    }
  });

  it('holds the rung distribution the ladder was balanced on', () => {
    for (const kind of LEVEL5_KINDS) {
      const count = SKILLS.filter((s) => s.level5Fx.kind === kind).length;
      expect(count, `${kind} rungs`).toBe(RUNG_COUNTS[kind]);
    }
  });

  it('nouns the status a rung can lengthen, and never one that cannot carry it', () => {
    const carryable = (id: string): boolean => !!id && id !== 'stun';
    for (const skill of SKILLS) {
      const rung = skill.level5Fx;
      if (rung.kind === 'statusRounds' || rung.kind === 'spread') {
        // A spread reaches a second victim, and extra rounds only mean something to a status the
        // resolver counts down — Stun's own counter is deleted on application, so it cannot be it.
        if (skill.kind === 'passive') {
          expect((skill.fx as { kind: string }).kind, `${skill.id} passive`).toBe('critBurn');
          expect(rung.kind, `${skill.id} a critBurn passive can only lengthen its Burn`).toBe(
            'statusRounds',
          );
        } else {
          expect(hitFx(skill).status, `${skill.id} has no status to lengthen`).toBeTruthy();
          expect(
            carryable(hitFx(skill).status!),
            `${skill.id} lengthens a status that does not count down`,
          ).toBe(true);
        }
      }
      if (rung.kind === 'shieldPercent') {
        expect(skill.kind, `${skill.id} shield rung on a passive`).toBe('active');
        // The rung either raises a fraction the card already printed or puts one on a card that printed
        // none (Root Grip's hook takes a Shield it never had) — either way the folded number is the one
        // the resolver pays, so a rung that folds to zero would be a rung that does nothing.
        expect(
          fxAtLevel(skill, 5).shieldPercent,
          `${skill.id} shield rung folds to nothing`,
        ).toBeGreaterThan(0);
      }
      if (rung.kind === 'openingShield') {
        expect(skill.kind, `${skill.id} opening shield on an active`).toBe('passive');
        expect((skill.fx as { kind: string }).kind, `${skill.id} passive`).toBe('startShield');
      }
      if (rung.kind === 'critPoints' || rung.kind === 'varianceFloor') {
        expect(skill.kind, `${skill.id} reads a swing it does not take`).toBe('active');
      }
    }
  });

  it('prints the total the resolver lands on, and the noun that total belongs to', () => {
    for (const skill of SKILLS) {
      const rung = skill.level5Fx;
      const line = skill.level5;
      expect(line, `${skill.id} does not say which rung it is`).toMatch(/^LV5: /);
      const pattern = RUNG_NUMBER[rung.kind];
      if (!pattern) {
        // The two rungs with no number still have to name the thing the resolver honours.
        if (rung.kind === 'spread') {
          expect(line, `${skill.id} spread says nothing about a second enemy`).toMatch(
            /one other enemy/,
          );
          expect(fxAtLevel(skill, 5).spread, `${skill.id} spread does not fold`).toBe(true);
        } else {
          expect(line, `${skill.id} floor says nothing about the likely number`).toMatch(
            /never (?:rolls|lands) under its likely number/,
          );
          expect(fxAtLevel(skill, 5).varianceFloor, `${skill.id} floor does not fold`).toBe(true);
        }
        expect(
          fxAtLevel(skill, 4)[rung.kind === 'spread' ? 'spread' : 'varianceFloor'],
          `${skill.id} folds below LV5`,
        ).toBe(false);
        continue;
      }
      const quoted = [...line.matchAll(pattern)].map((m) => Number(m[1]));
      expect(quoted.length, `${skill.id} prints ${rung.kind} more than once`).toBe(1);
      expect(quoted[0], `${skill.id} line does not quote the total the resolver reads`).toBe(
        rungTotal(skill),
      );
    }
  });

  it('keeps every rung line original, so two cards never print the same promise', () => {
    const lines = SKILLS.map((s) => s.level5);
    expect(new Set(lines).size).toBe(60);
    for (const skill of SKILLS) {
      expect(skill.level5.length, `${skill.id} has a rung line too thin to price`).toBeGreaterThan(
        24,
      );
      expect(skill.level5, `${skill.id} leaves a placeholder`).not.toMatch(/TBD|lorem|TODO/i);
      expect(skill.level5, `${skill.id} promises a refund on its rung`).not.toMatch(/energy/i);
    }
  });

  it('raises the rung above the card rather than replacing what the card does', () => {
    // A rung is a fold into the printed numbers, so the LV5 reading must sit at or above LV1 on every
    // field it names — and the status itself is never swapped for a different one.
    for (const skill of SKILLS) {
      const base = fxAtLevel(skill, 1);
      const top = fxAtLevel(skill, 5);
      expect(top.shieldPercent).toBeGreaterThanOrEqual(base.shieldPercent);
      expect(top.critPoints).toBeGreaterThanOrEqual(base.critPoints);
      expect(top.statusRounds).toBeGreaterThanOrEqual(base.statusRounds);
      expect(top.status, `${skill.id} rung changes which status lands`).toBe(base.status);
      expect(top.burningBonus).toBe(base.burningBonus);
      expect(top.interruptsTelegraph).toBe(base.interruptsTelegraph);
    }
  });
});
