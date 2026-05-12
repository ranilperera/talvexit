'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import customerApi from '@/lib/customer-api';

export interface OrderSummary {
  id: string;
  status: string;
  company_order_status?: string | null;
  task?: { title?: string };
  scope_snapshot?: { title?: string } | null;
  contractor_user?: { full_name?: string; id?: string };
  customer?: { full_name?: string; id?: string } | null;
  customer_user?: { full_name?: string; id?: string };
  price_aud?: number | null;
  sla_deadline?: string | null;
  created_at: string;
}

interface OrdersData {
  orders: OrderSummary[];
  total: number;
}

interface WorkLogEntry {
  hours: number;
  description: string;
  started_at: string;
}

interface DisputePayload {
  grounds: string;
  description: string;
  evidence_blob_paths?: string[];
}

export function useOrders(params: Record<string, string> = {}) {
  const searchString = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: OrdersData }>(
          `/api/v1/orders${searchString ? `?${searchString}` : ''}`,
        )
        .then((r) => r.data.data),
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: unknown }>(`/api/v1/orders/${id}`)
        .then((r) => r.data.data),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

export function useSubmitDeliverables(orderId: string) {
  return useMutation({
    mutationFn: () => customerApi.post(`/api/v1/orders/${orderId}/submit`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Deliverables submitted for review!');
    },
  });
}

export function useApproveDeliverables(orderId: string) {
  return useMutation({
    mutationFn: () => customerApi.post(`/api/v1/orders/${orderId}/approve`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order approved! Payout initiated.');
    },
  });
}

export function useRequestRevision(orderId: string) {
  return useMutation({
    mutationFn: (data: { reason: string }) =>
      customerApi.post(`/api/v1/orders/${orderId}/revision`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Revision requested.');
    },
  });
}

export function useAddWorkLog(orderId: string) {
  return useMutation({
    mutationFn: (data: WorkLogEntry) =>
      customerApi.post(`/api/v1/orders/${orderId}/work-log`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      toast.success('Work log entry added.');
    },
  });
}

export function useFileDispute(orderId: string) {
  return useMutation({
    mutationFn: (data: DisputePayload) =>
      customerApi.post<{ success: boolean; data: { id: string } }>(
        `/api/v1/orders/${orderId}/disputes`,
        data,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
}
