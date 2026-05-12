import { describe, it, expect } from 'vitest';
import { convertToAUD, convertFromAUD } from '../currency.js';

describe('currencyUtils.convertToAUD()', () => {
  it('CU-01: AUD 100 → 100 (no conversion)', () => {
    expect(convertToAUD(100, 'AUD')).toBe(100);
  });

  it('CU-02: USD 100 → 155 (at 1.55 rate)', () => {
    expect(convertToAUD(100, 'USD')).toBe(155);
  });

  it('CU-03: GBP 100 → 197 (at 1.97 rate)', () => {
    expect(convertToAUD(100, 'GBP')).toBe(197);
  });

  it('CU-04: unsupported currency JPY → throws Error', () => {
    expect(() => convertToAUD(100, 'JPY')).toThrow('Unsupported currency: JPY');
  });

  it('CU-05: convertFromAUD(155, USD) → 100 (round trip)', () => {
    expect(convertFromAUD(155, 'USD')).toBe(100);
  });
});
