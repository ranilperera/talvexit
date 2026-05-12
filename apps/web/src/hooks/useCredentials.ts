'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryClient } from '@/lib/query-client';
import customerApi from '@/lib/customer-api';

interface Credential {
  id: string;
  label: string;
  credential_type: string;
  created_at: string;
  last_retrieved_at: string | null;
}

interface StoreCredentialPayload {
  label: string;
  credential_type: string;
  value: string;
  notes?: string;
}

interface CredentialValueResult {
  value: string;
  label: string;
  credential_type: string;
}

export function useCredentials(orderId: string) {
  return useQuery({
    queryKey: ['credentials', orderId],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { credentials: Credential[] } }>(
          `/api/v1/orders/${orderId}/credentials`,
        )
        .then((r) => r.data.data.credentials),
    enabled: !!orderId,
  });
}

export function useStoreCredential(orderId: string) {
  return useMutation({
    mutationFn: (data: StoreCredentialPayload) =>
      customerApi
        .post<{ success: boolean; data: Credential }>(
          `/api/v1/orders/${orderId}/credentials`,
          data,
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credentials', orderId] });
      toast.success('Credential stored securely.');
    },
  });
}

// This is a mutation not a query because every call is a logged access event
export function useRetrieveCredentialValue(orderId: string) {
  return useMutation({
    mutationFn: (credId: string) =>
      customerApi
        .get<{ success: boolean; data: CredentialValueResult }>(
          `/api/v1/orders/${orderId}/credentials/${credId}/value`,
        )
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credentials', orderId] });
    },
  });
}

export function useDeleteCredential(orderId: string) {
  return useMutation({
    mutationFn: (credId: string) =>
      customerApi.delete(`/api/v1/orders/${orderId}/credentials/${credId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credentials', orderId] });
      toast.success('Credential deleted.');
    },
  });
}
