'use client';

import { useQuery } from '@tanstack/react-query';
import customerApi from '@/lib/customer-api';
import { getToken } from '@/lib/customer-auth';

export interface SidebarBadges {
  active_orders: number;
  tender_invitations: number;
  disputes: number;
  unread_notifications: number;
  messages: number;
}

/**
 * Polls the supplier-side sidebar badges every 60s. Used by the contractor
 * layout to surface counts on menu items (Active Orders, Tender Invitations,
 * Disputes). Cheap counts only — heavier work belongs in the listing pages.
 *
 * Returns zeroes if not signed in, so the caller never has to null-check.
 */
export function useSidebarBadges(): SidebarBadges & { refetch: () => void } {
  const enabled = typeof window !== 'undefined' && !!getToken();

  const query = useQuery<SidebarBadges>({
    queryKey: ['contractor', 'sidebar-badges'],
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await customerApi.get<{ success: boolean; data: SidebarBadges }>(
        '/api/v1/contractor/sidebar-badges',
      );
      return res.data.data;
    },
  });

  const data = query.data ?? {
    active_orders: 0,
    tender_invitations: 0,
    disputes: 0,
    unread_notifications: 0,
    messages: 0,
  };

  return {
    ...data,
    refetch: () => {
      void query.refetch();
    },
  };
}
