/** Currency preference data. Amounts are integer minor units (2 decimals). */
export const CURRENCIES = [
  { code: 'PHP', name: 'Philippine peso', symbol: '₱', subunit: 'centavos' },
  { code: 'USD', name: 'US dollar', symbol: '$', subunit: 'cents' },
  { code: 'EUR', name: 'Euro', symbol: '€', subunit: 'cents' },
  { code: 'GBP', name: 'British pound', symbol: '£', subunit: 'pence' },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$', subunit: 'cents' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹', subunit: 'paise' },
] as const;

export type Currency = (typeof CURRENCIES)[number];
export type CurrencyCode = Currency['code'];

export const DEFAULT_CURRENCY: CurrencyCode = 'PHP';

const BY_CODE = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && BY_CODE.has(value as CurrencyCode);
}

export function getCurrency(code: CurrencyCode): Currency {
  return BY_CODE.get(code)!;
}

export function currencySymbol(code: CurrencyCode): string {
  return getCurrency(code).symbol;
}

/** What one hundredth of the coin is called, so amount errors can be written in plain words. */
export function currencySubunit(code: CurrencyCode): string {
  return getCurrency(code).subunit;
}

/** Regions whose everyday coin is one of the six this app keeps; everything else starts at peso. */
const REGION_CURRENCY: Readonly<Record<string, CurrencyCode>> = {
  PH: 'PHP',
  US: 'USD',
  GB: 'GBP',
  SG: 'SGD',
  IN: 'INR',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
};

/**
 * A first guess from the device locale, never a stored decision: only an explicit region subtag
 * counts (`en-PH`, not plain `en`), because guessing a coin the user does not use is worse than the
 * peso-first default they can change in one tap.
 */
export function currencyForLocale(locale: string): CurrencyCode {
  const rest = locale.replace('_', '-').split('-').slice(1);
  const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part));
  if (!region) return DEFAULT_CURRENCY;
  return REGION_CURRENCY[region.toUpperCase()] ?? DEFAULT_CURRENCY;
}

export function formatMoney(minor: number, code: CurrencyCode): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${currencySymbol(code)}${whole}.${fraction}`;
}

/**
 * Grouping separators are stripped, so only digits and at most two decimal digits survive. A third
 * decimal is refused rather than rounded: 12.345 is a mistype or a corrupted file, not a cent value.
 */
const AMOUNT_PATTERN = /^(\d*)(?:\.(\d{1,2}))?$/;

/** 12 whole digits keeps `whole * 100` inside the range where integers stay exact. */
const MAX_WHOLE_DIGITS = 12;

/** Typed money text to integer minor units, or null when it is not an amount. */
export function parseAmount(input: string): number | null {
  const match = AMOUNT_PATTERN.exec(input.trim().replace(/,/g, ''));
  if (!match) return null;
  const whole = match[1] ?? '';
  const fraction = match[2] ?? '';
  if (whole === '' && fraction === '') return null;
  if (whole.length > MAX_WHOLE_DIGITS) return null;
  return Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
}
