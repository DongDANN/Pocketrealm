/** Currency preference data. Amounts are integer minor units (2 decimals). */
export const CURRENCIES = [
  { code: 'PHP', name: 'Philippine peso', symbol: '₱' },
  { code: 'USD', name: 'US dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British pound', symbol: '£' },
  { code: 'SGD', name: 'Singapore dollar', symbol: 'S$' },
  { code: 'INR', name: 'Indian rupee', symbol: '₹' },
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

export function formatMoney(minor: number, code: CurrencyCode): string {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${currencySymbol(code)}${whole}.${fraction}`;
}
