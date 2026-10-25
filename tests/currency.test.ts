import { describe, expect, it } from 'vitest';
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  currencySymbol,
  formatMoney,
  getCurrency,
  isCurrencyCode,
  parseAmount,
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

describe('parseAmount', () => {
  it('turns typed decimal money into exact integer minor units', () => {
    expect(parseAmount('12.50')).toBe(1250);
    expect(parseAmount('12.5')).toBe(1250);
    expect(parseAmount('0.05')).toBe(5);
    expect(parseAmount('.99')).toBe(99);
    expect(parseAmount('0')).toBe(0);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount(' 42 ')).toBe(4200);
  });

  it('refuses what a person did not actually type as an amount', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('   ')).toBeNull();
    expect(parseAmount('.')).toBeNull();
    expect(parseAmount('12.345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('1e3')).toBeNull();
    expect(parseAmount('12.')).toBeNull();
  });

  it('refuses a value too large to hold as an integer', () => {
    expect(parseAmount('99999999999999')).toBeNull();
    expect(parseAmount('999999999999')).toBe(99_999_999_999_900);
  });
});
