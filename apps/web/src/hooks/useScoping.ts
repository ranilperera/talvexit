'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import customerApi from '@/lib/customer-api';

interface ScopingJobStatus {
  job_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: unknown;
  error?: string;
}

interface GenerateScopePayload {
  description: string;
  domain?: string;
  budget?: number;
  timeline_days?: number;
}

interface RegenerateSectionPayload {
  section: string;
  instruction?: string;
}

export function useGenerateScope() {
  return useMutation({
    mutationFn: (data: GenerateScopePayload) =>
      customerApi
        .post<{ success: boolean; data: { job_id: string } }>('/api/v1/scoping/generate', data)
        .then((r) => r.data.data),
    onSuccess: (data) => {
      // Prime the status query cache
      queryClient.setQueryData(['scoping-status', data.job_id], {
        job_id: data.job_id,
        status: 'PENDING',
      });
    },
  });
}

export function useScopingStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['scoping-status', jobId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: ScopingJobStatus }>(`/api/v1/scoping/${jobId}/status`)
        .then((r) => r.data.data),
    enabled: !!jobId,
    // Poll while not complete
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      return data.status === 'PENDING' || data.status === 'PROCESSING' ? 3_000 : false;
    },
  });
}

export function useAcceptScope(jobId: string) {
  return useMutation({
    mutationFn: () =>
      customerApi
        .post<{ success: boolean; data: { order_id: string } }>(`/api/v1/scoping/${jobId}/accept`)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scoping-status', jobId] });
    },
  });
}

export function useRegenerateSection(jobId: string) {
  return useMutation({
    mutationFn: (data: RegenerateSectionPayload) =>
      customerApi
        .post(`/api/v1/scoping/${jobId}/regenerate-section`, data)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scoping-status', jobId] });
    },
  });
}
