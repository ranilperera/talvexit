'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import customerApi from '@/lib/customer-api';

interface RatingCriteria {
  technical_quality: number;
  communication: number;
  timeliness: number;
  documentation: number;
  professionalism: number;
}

interface RatingSummary {
  rating_avg: number | null;
  rating_count: number;
  rating_visible: boolean;
  rating_criteria_avg: RatingCriteria | null;
}

interface SubmitRatingPayload {
  criteria: RatingCriteria;
  review_text?: string;
  tags?: string[];
}

interface RatingsParams {
  page?: number;
  limit?: number;
}

export function useContractorRatings(profileId: string, params: RatingsParams = {}) {
  const searchString = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ),
  ).toString();

  return useQuery({
    queryKey: ['contractor-ratings', profileId, params],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { reviews: unknown[]; total: number } }>(
          `/api/v1/contractors/${profileId}/reviews${searchString ? `?${searchString}` : ''}`,
        )
        .then((r) => r.data.data),
    enabled: !!profileId,
  });
}

export function useRatingSummary(profileId: string) {
  return useQuery({
    queryKey: ['rating-summary', profileId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: RatingSummary }>(
          `/api/v1/contractors/${profileId}/rating-summary`,
        )
        .then((r) => r.data.data),
    enabled: !!profileId,
    staleTime: 5 * 60_000,
  });
}

export function useSubmitRating(orderId: string) {
  return useMutation({
    mutationFn: (data: SubmitRatingPayload) =>
      customerApi
        .post<{ success: boolean; data: { id: string } }>(
          `/api/v1/orders/${orderId}/rating`,
          data,
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['contractor-ratings'] });
      void queryClient.invalidateQueries({ queryKey: ['rating-summary'] });
      toast.success('Rating submitted — thank you!');
    },
  });
}

export function useSubmitRatingResponse(ratingId: string) {
  return useMutation({
    mutationFn: (data: { response_text: string }) =>
      customerApi.post(`/api/v1/ratings/${ratingId}/response`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['contractor-ratings'] });
      toast.success('Response submitted.');
    },
  });
}
