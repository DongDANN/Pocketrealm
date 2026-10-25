/**
 * Gate 3b — first run. Onboarding is one transaction: the settings, the starter envelopes and the
 * companion either all land or none do, because a Today screen with no envelopes and no way back is
 * worse than a refusal the user can fix. Problems come back as printable sentences, never a throw.
 */

import { speciesByKey } from '../core/companion';
import { DEFAULT_CURRENCY, currencySubunit, isCurrencyCode } from '../core/currency';
import { hashString } from '../core/rng';
import { envelopesFromTemplate, templateById } from '../core/templates';
import type { Companion, Envelope, Settings } from '../core/types';
import type { PocketDb } from './db';
import {
  getCompanion,
  saveCompanion,
  saveEnvelope,
  saveSettings,
  type WriteContext,
} from './repos';
import { defaultSettings } from './seed';

export interface OnboardInput {
  currency: string;
  periodStartDay: number;
  templateId: string;
  income: number;
  companionName: string;
  speciesKey: string;
}

export type OnboardOutcome =
  | { ok: true; settings: Settings; envelopes: Envelope[]; companion: Companion }
  | { ok: false; problems: string[] };

/** Days 29-31 are left out so every month has the same period length. */
const MAX_PERIOD_START_DAY = 28;

export function isOnboarded(db: PocketDb): Promise<boolean> {
  return getCompanion(db).then((companion) => companion !== null);
}

/**
 * The per-install seed for quest offers. There is no user seed in the schema, so the companion id —
 * random and unique to this device — stands in for one. Zero means "not set up yet".
 */
export async function questSeed(db: PocketDb): Promise<number> {
  const companion = await getCompanion(db);
  return companion ? hashString(`seed:${companion.id}`) : 0;
}

function validate(input: OnboardInput): string[] {
  const problems: string[] = [];
  if (!isCurrencyCode(input.currency)) {
    problems.push(`Currency ${input.currency} is not one of the coins this book keeps.`);
  }
  if (
    !Number.isInteger(input.periodStartDay) ||
    input.periodStartDay < 1 ||
    input.periodStartDay > MAX_PERIOD_START_DAY
  ) {
    problems.push(`The budget period can start on days 1 to ${MAX_PERIOD_START_DAY}.`);
  }
  if (!templateById(input.templateId)) problems.push(`Unknown template: ${input.templateId}`);
  // Even when the chosen code is nonsense the sentence has to name a coin, so the shipped default
  // answers. The income itself is always minor units of whatever coin the book ends up using.
  const coin = isCurrencyCode(input.currency) ? input.currency : DEFAULT_CURRENCY;
  if (!Number.isInteger(input.income) || input.income < 0) {
    problems.push(`Income must be a whole number of ${currencySubunit(coin)}, got ${input.income}`);
  }
  if (!speciesByKey(input.speciesKey)) {
    problems.push(`That companion is not one of the starters: ${input.speciesKey}`);
  }
  if (input.companionName.trim() === '') problems.push('Your companion needs a name.');
  return problems;
}

export async function completeOnboarding(
  db: PocketDb,
  ctx: WriteContext,
  input: OnboardInput,
): Promise<OnboardOutcome> {
  const problems = validate(input);
  if (problems.length > 0) return { ok: false, problems };
  const name = input.companionName.trim();

  return db.transaction(
    'rw',
    db.settings,
    db.envelopes,
    db.companions,
    async (): Promise<OnboardOutcome> => {
      if (await isOnboarded(db)) {
        return { ok: false, problems: ['This device already has a book.'] };
      }
      const settings = await saveSettings(db, {
        ...defaultSettings(),
        currency: input.currency,
        periodStartDay: input.periodStartDay,
      });
      const envelopes = envelopesFromTemplate(input.templateId, input.income, ctx.newId);
      for (const envelope of envelopes) await saveEnvelope(db, envelope);
      const companion = await saveCompanion(db, {
        id: ctx.newId(),
        speciesKey: input.speciesKey,
        name,
        cosmetics: [],
        equipped: {},
      });
      return { ok: true, settings, envelopes, companion };
    },
  );
}
