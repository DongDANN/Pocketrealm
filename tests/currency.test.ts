import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  currencySymbol,
  formatMoney,
  getCurrency,
  isCurrencyCode,
} from '../src/core/currency';

describe('currency preference data', () => {
  it('is PHP-first and has unique ISO codes', () => {
    expect(DEFAULT_CURRENCY).toBe('PHP');
    expect(CURRENCIES[0]?.code).toBe('PHP');
    const codes = CURRENCIES.map((currency) => currency.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('looks up names and symbols without converting', () => {
    expect(getCurrency('PHP').name).toBe('Philippine peso');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('SGD')).toBe('S$');
    expect(isCurrencyCode('PHP')).toBe(true);
    expect(isCurrencyCode('XYZ')).toBe(false);
    expect(isCurrencyCode(null)).toBe(false);
  });
});

describe('formatMoney', () => {
  it('formats minor units with grouping and two decimals', () => {
    expect(formatMoney(425000, 'PHP')).toBe('₱4,250.00');
    expect(formatMoney(950000, 'PHP')).toBe('₱9,500.00');
    expect(formatMoney(5, 'EUR')).toBe('€0.05');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(123456789, 'INR')).toBe('₹1,234,567.89');
  });

  it('keeps negative amounts readable', () => {
    expect(formatMoney(-123456, 'PHP')).toBe('-₱1,234.56');
  });
});
