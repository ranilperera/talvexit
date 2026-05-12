import { describe, expect, it } from 'vitest';
import {
  calculateWeightedScore,
  isRatingVisible,
  recalculateAggregateRating,
} from '../rating-calculator.js';

describe('calculateWeightedScore()', () => {
  it('RC-01: all 5s -> 5.0', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 5,
        communication: 5,
        timeliness: 5,
        documentation_quality: 5,
        professionalism: 5,
      }),
    ).toBe(5.0);
  });

  it('RC-02: all 1s -> 1.0', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 1,
        communication: 1,
        timeliness: 1,
        documentation_quality: 1,
        professionalism: 1,
      }),
    ).toBe(1.0);
  });

  it('RC-03: {5,4,4,3,4} -> 4.2', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 5,
        communication: 4,
        timeliness: 4,
        documentation_quality: 3,
        professionalism: 4,
      }),
    ).toBe(4.2);
  });

  it('RC-04: {3,3,3,3,3} -> 3.0', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 3,
        communication: 3,
        timeliness: 3,
        documentation_quality: 3,
        professionalism: 3,
      }),
    ).toBe(3.0);
  });

  it('RC-05: technical heavy {5,1,1,1,1} -> 2.4', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 5,
        communication: 1,
        timeliness: 1,
        documentation_quality: 1,
        professionalism: 1,
      }),
    ).toBe(2.4);
  });

  it('RC-06: {4,5,3,4,5} -> 4.1', () => {
    expect(
      calculateWeightedScore({
        technical_quality: 4,
        communication: 5,
        timeliness: 3,
        documentation_quality: 4,
        professionalism: 5,
      }),
    ).toBe(4.1);
  });

  it('RC-07: always 1 decimal precision', () => {
    const score = calculateWeightedScore({
      technical_quality: 4,
      communication: 5,
      timeliness: 3,
      documentation_quality: 4,
      professionalism: 5,
    });
    expect(score).toBe(Number(score.toFixed(1)));
  });
});

describe('recalculateAggregateRating()', () => {
  it('RC-08: first rating from 0 count gives new score and count 1', () => {
    expect(recalculateAggregateRating(0, 0, 4.2)).toEqual({
      new_overall: 4.2,
      new_count: 1,
    });
  });

  it('RC-09: second rating from 4.0 with new 5.0 -> 4.5', () => {
    expect(recalculateAggregateRating(4.0, 1, 5.0)).toEqual({
      new_overall: 4.5,
      new_count: 2,
    });
  });

  it('RC-10: third rating from 4.5 count 2 with new 3.0 -> 4.0', () => {
    expect(recalculateAggregateRating(4.5, 2, 3.0)).toEqual({
      new_overall: 4.0,
      new_count: 3,
    });
  });

  it('RC-11: result always rounded to 1 decimal', () => {
    const result = recalculateAggregateRating(4.4, 3, 4.9);
    expect(result.new_overall).toBe(Number(result.new_overall.toFixed(1)));
  });
});

describe('isRatingVisible()', () => {
  it('RC-12: 0 completed orders -> false', () => {
    expect(isRatingVisible(0)).toBe(false);
  });

  it('RC-13: 2 completed orders -> false', () => {
    expect(isRatingVisible(2)).toBe(false);
  });

  it('RC-14: 3 completed orders -> true', () => {
    expect(isRatingVisible(3)).toBe(true);
  });

  it('RC-15: 100 completed orders -> true', () => {
    expect(isRatingVisible(100)).toBe(true);
  });
});
