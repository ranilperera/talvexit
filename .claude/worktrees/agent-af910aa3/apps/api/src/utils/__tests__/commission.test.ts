import { describe, expect, it } from 'vitest';
import { audToCents, calculatePayout, getCommissionRate } from '../commission.js';

describe('getCommissionRate()', () => {
  it('CM-01: 0 orders -> 0.20, TIER_1_NEW', () => {
    expect(getCommissionRate(0)).toMatchObject({ rate: 0.2, tier: 'TIER_1_NEW' });
  });

  it('CM-02: 1 order -> 0.20', () => {
    expect(getCommissionRate(1).rate).toBe(0.2);
  });

  it('CM-03: 9 orders -> 0.20 boundary still tier 1', () => {
    expect(getCommissionRate(9)).toMatchObject({ rate: 0.2, tier: 'TIER_1_NEW' });
  });

  it('CM-04: 10 orders -> 0.17, TIER_2_ESTABLISHED', () => {
    expect(getCommissionRate(10)).toMatchObject({ rate: 0.17, tier: 'TIER_2_ESTABLISHED' });
  });

  it('CM-05: 49 orders -> 0.17 boundary still tier 2', () => {
    expect(getCommissionRate(49)).toMatchObject({ rate: 0.17, tier: 'TIER_2_ESTABLISHED' });
  });

  it('CM-06: 50 orders -> 0.15, TIER_3_SENIOR', () => {
    expect(getCommissionRate(50)).toMatchObject({ rate: 0.15, tier: 'TIER_3_SENIOR' });
  });

  it('CM-07: 200 orders -> 0.15', () => {
    expect(getCommissionRate(200).rate).toBe(0.15);
  });
});

describe('calculatePayout()', () => {
  it('CM-08: 1000 @ 0 orders -> commission 200, net 800', () => {
    expect(calculatePayout(1000, 0)).toMatchObject({
      commission_amount_aud: 200,
      net_amount_aud: 800,
    });
  });

  it('CM-09: 1000 @ 10 orders -> commission 170, net 830', () => {
    expect(calculatePayout(1000, 10)).toMatchObject({
      commission_amount_aud: 170,
      net_amount_aud: 830,
    });
  });

  it('CM-10: 1000 @ 50 orders -> commission 150, net 850', () => {
    expect(calculatePayout(1000, 50)).toMatchObject({
      commission_amount_aud: 150,
      net_amount_aud: 850,
    });
  });

  it('CM-11: 950 @ 0 orders -> commission 190, net 760', () => {
    expect(calculatePayout(950, 0)).toMatchObject({
      commission_amount_aud: 190,
      net_amount_aud: 760,
    });
  });

  it('CM-12: 0.01 edge case rounds correctly', () => {
    expect(calculatePayout(0.01, 0)).toMatchObject({
      commission_amount_aud: 0,
      net_amount_aud: 0.01,
    });
  });

  it('CM-13: 1234.56 @ 10 orders rounding is 209.88 commission, 1024.68 net', () => {
    expect(calculatePayout(1234.56, 10)).toMatchObject({
      commission_amount_aud: 209.88,
      net_amount_aud: 1024.68,
    });
  });
});

describe('audToCents()', () => {
  it('CM-14: 950.00 -> 95000', () => {
    expect(audToCents(950)).toBe(95000);
  });

  it('CM-15: 0.50 -> 50', () => {
    expect(audToCents(0.5)).toBe(50);
  });

  it('CM-16: 1234.56 -> 123456', () => {
    expect(audToCents(1234.56)).toBe(123456);
  });
});
