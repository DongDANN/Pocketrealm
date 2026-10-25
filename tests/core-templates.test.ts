/**
 * Gate 3 — starter envelope templates (SPEC 7: "choose a starter template (Essentials 50/30/20,
 * Student, Custom) which creates envelopes"). The split is the one place the app puts money into the
 * user's budget for them, so it has to be exact: integer minor units, totals conserved to the peso,
 * and no negative allowance ever.
 */

import { describe, expect, it } from 'vitest';
import { TEMPLATES, envelopeTemplates, envelopesFromTemplate } from '../src/core/templates';

function ids() {
  let n = 0;
  return () => `env-${++n}`;
}

const INCOME = 4_500_000; // ₱45,000.00

describe('envelopeFromTemplate', () => {
  it('splits essentials as 50/30/20 in exact minor units', () => {
    const envelopes = envelopesFromTemplate('essentials', INCOME, ids());
    expect(envelopes.map((e) => e.monthlyAllowance)).toEqual([2_250_000, 1_350_000, 900_000]);
    expect(envelopes.reduce((sum, e) => sum + e.monthlyAllowance, 0)).toBe(INCOME);
  });

  it('gives the rounding remainder to the first envelope so the total is never lost', () => {
    const envelopes = envelopesFromTemplate('essentials', INCOME + 1, ids());
    expect(envelopes.reduce((sum, e) => sum + e.monthlyAllowance, 0)).toBe(INCOME + 1);
    expect(envelopes[0]!.monthlyAllowance).toBe(2_250_001);
  });

  it('produces valid rows: unique ids, sequential order, nothing archived, no negatives', () => {
    const envelopes = envelopesFromTemplate('student', 30_000_50, ids());
    for (const envelope of envelopes) {
      expect(envelope.id).toMatch(/^[a-z0-9-]+$/);
      expect(envelope.name.length).toBeGreaterThan(1);
      expect(envelope.icon.length).toBeGreaterThan(0);
      expect(envelope.monthlyAllowance).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(envelope.monthlyAllowance)).toBe(true);
      expect(envelope.archived).toBe(false);
      expect(['none', 'carry', 'sweep-to-goal']).toContain(envelope.rollover);
    }
    expect(new Set(envelopes.map((e) => e.id)).size).toBe(envelopes.length);
    expect(envelopes.map((e) => e.sortOrder)).toEqual(envelopes.map((_, i) => i));
    expect(envelopes.reduce((sum, e) => sum + e.monthlyAllowance, 0)).toBe(30_000_50);
  });

  it('keeps money whole at any income, including zero', () => {
    for (const income of [0, 1, 99, 101, 123_456_789]) {
      for (const template of envelopeTemplates()) {
        const envelopes = envelopesFromTemplate(template.id, income, ids());
        expect(envelopes.reduce((sum, e) => sum + e.monthlyAllowance, 0)).toBe(income);
        for (const envelope of envelopes) {
          expect(Number.isInteger(envelope.monthlyAllowance)).toBe(true);
          expect(envelope.monthlyAllowance).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('offers custom as an empty set, because the user is about to choose', () => {
    expect(envelopesFromTemplate('custom', INCOME, ids())).toEqual([]);
  });

  it('refuses a template that does not exist instead of inventing one', () => {
    expect(() => envelopesFromTemplate('crypto', INCOME, ids())).toThrow(/unknown template/i);
  });

  it('carries savings forward and lets spending envelopes reset', () => {
    const envelopes = envelopesFromTemplate('essentials', INCOME, ids());
    // Ids come from the caller so a template can never collide with an existing envelope;
    // the icon slug is the stable identity.
    const savings = envelopes.find((e) => e.icon === 'savings');
    expect(savings?.rollover).toBe('carry');
    expect(envelopes.filter((e) => e.rollover === 'none').length).toBeGreaterThan(0);
  });

  it('shares always sum to one, so no income silently vanishes', () => {
    for (const template of TEMPLATES) {
      const total = template.slots.reduce((sum, slot) => sum + slot.share, 0);
      expect(Math.round(total * 1e6)).toBe(template.slots.length === 0 ? 0 : 1e6);
    }
  });
});
