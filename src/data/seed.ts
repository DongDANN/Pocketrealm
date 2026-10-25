/**
 * Gate 2 — defaults for a fresh install. Deliberately tiny: onboarding (Gate 3) lets the user shape
 * everything else, and the game never invents budget data on the user's behalf.
 */

import { DEFAULT_CURRENCY } from '../core/currency';
import type { Settings } from '../core/types';
import { SCHEMA_VERSION } from './db';

export const DEFAULT_LOCALE = 'en-PH';
export const DEFAULT_REST_TOKENS_PER_MONTH = 2;

/** The settings a first launch sees: Philippine peso, calendar-month periods, system theme. */
export function defaultSettings(): Settings {
  return {
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    periodStartDay: 1,
    theme: 'system',
    reducedMotion: 'system',
    sound: true,
    restTokensPerMonth: DEFAULT_REST_TOKENS_PER_MONTH,
    schemaVersion: SCHEMA_VERSION,
  };
}
