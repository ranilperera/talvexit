// ─── Criterion weights — must sum to 1.00 ─────────────────────────────────────

export const RATING_WEIGHTS = {
  technical_quality: 0.35,
  communication: 0.20,
  timeliness: 0.20,
  documentation_quality: 0.15,
  professionalism: 0.10,
} as const;

export type RatingCriteria = {
  technical_quality: number; // 1–5
  communication: number; // 1–5
  timeliness: number; // 1–5
  documentation_quality: number; // 1–5
  professionalism: number; // 1–5
};

export function calculateWeightedScore(criteria: RatingCriteria): number {
  const raw =
    criteria.technical_quality * RATING_WEIGHTS.technical_quality +
    criteria.communication * RATING_WEIGHTS.communication +
    criteria.timeliness * RATING_WEIGHTS.timeliness +
    criteria.documentation_quality * RATING_WEIGHTS.documentation_quality +
    criteria.professionalism * RATING_WEIGHTS.professionalism;

  // Round to 1 decimal place (display format per spec)
  return Math.round(raw * 10) / 10;
}

// Minimum completed orders before public score is shown
export const RATING_VISIBILITY_THRESHOLD = 3;

export function isRatingVisible(completedOrdersCount: number): boolean {
  return completedOrdersCount >= RATING_VISIBILITY_THRESHOLD;
}

// Recalculate a contractor's cached overall_rating from all their visible ratings.
// Called after every new rating submission.
export function recalculateAggregateRating(
  existingOverallScore: number,
  existingCount: number,
  newScore: number,
): { new_overall: number; new_count: number } {
  // Incremental weighted average:
  // new_avg = ((old_avg * old_count) + new_score) / (old_count + 1)
  const newCount = existingCount + 1;
  const newOverall = (existingOverallScore * existingCount + newScore) / newCount;

  return {
    new_overall: Math.round(newOverall * 10) / 10,
    new_count: newCount,
  };
}
