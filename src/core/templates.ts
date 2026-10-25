import type { Envelope } from './types';

/**
 * Starter envelope templates (SPEC 7). Splitting income is the one place the app puts numbers in the
 * user's budget for them, so the arithmetic is integer-only: each slot gets the floor of its share and
 * the remainder lands on the first slot, so the total always equals the income exactly.
 */

export interface TemplateSlot {
  /** Stable slug, used as the envelope's icon key. */
  id: string;
  name: string;
  /** Palette ramp name resolved by the art layer; no raw colour here. */
  colorKey: string;
  /** Fraction of monthly income; the slots of a template always sum to 1. */
  share: number;
  rollover: Envelope['rollover'];
}

export interface EnvelopeTemplate {
  id: string;
  name: string;
  blurb: string;
  slots: readonly TemplateSlot[];
}

export const TEMPLATES: readonly EnvelopeTemplate[] = [
  {
    id: 'essentials',
    name: 'Essentials 50 / 30 / 20',
    blurb: 'Half for what has to happen, three-tenths for living, two-tenths kept.',
    slots: [
      { id: 'essentials', name: 'Essentials', colorKey: 'moss', share: 0.5, rollover: 'none' },
      { id: 'lifestyle', name: 'Lifestyle', colorKey: 'amber', share: 0.3, rollover: 'none' },
      { id: 'savings', name: 'Savings', colorKey: 'teal', share: 0.2, rollover: 'carry' },
    ],
  },
  {
    id: 'student',
    name: 'Student',
    blurb: 'Meals, rides, school, load, a little fun, and something kept back.',
    slots: [
      { id: 'meals', name: 'Meals', colorKey: 'moss', share: 0.3, rollover: 'none' },
      { id: 'commute', name: 'Commute', colorKey: 'cyan', share: 0.15, rollover: 'none' },
      { id: 'school', name: 'School', colorKey: 'violet', share: 0.15, rollover: 'carry' },
      { id: 'load', name: 'Load & data', colorKey: 'amber', share: 0.1, rollover: 'none' },
      { id: 'fun', name: 'Fun', colorKey: 'rose', share: 0.15, rollover: 'none' },
      { id: 'savings', name: 'Savings', colorKey: 'teal', share: 0.15, rollover: 'carry' },
    ],
  },
  {
    id: 'custom',
    name: 'Start from nothing',
    blurb: 'No envelopes yet. You choose every name and every amount.',
    slots: [],
  },
];

/** Templates that actually create envelopes; `custom` is chosen, not generated. */
export function envelopeTemplates(): EnvelopeTemplate[] {
  return TEMPLATES.filter((template) => template.slots.length > 0);
}

export function templateById(id: string): EnvelopeTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

export function envelopesFromTemplate(
  templateId: string,
  income: number,
  newId: () => string,
): Envelope[] {
  const template = templateById(templateId);
  if (!template) throw new Error(`Unknown template: ${templateId}`);
  if (income < 0 || !Number.isInteger(income)) {
    throw new Error(`Income must be a whole number of minor units, got ${income}`);
  }
  const shares = template.slots.map((slot) => Math.floor(income * slot.share));
  const remainder = income - shares.reduce((sum, value) => sum + value, 0);
  if (shares.length > 0) shares[0] = shares[0]! + remainder;
  return template.slots.map((slot, index) => ({
    id: newId(),
    name: slot.name,
    icon: slot.id,
    colorKey: slot.colorKey,
    monthlyAllowance: shares[index]!,
    rollover: slot.rollover,
    archived: false,
    sortOrder: index,
  }));
}
