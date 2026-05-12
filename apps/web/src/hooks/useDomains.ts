'use client';

import { useQuery } from '@tanstack/react-query';

export interface ITDomain {
  id: string;
  key: string;
  label: string;
  short_label: string | null;
  icon: string | null;
  description: string | null;
  sort_order: number;
  insurance_tier: string;
}

async function fetchDomains(): Promise<ITDomain[]> {
  const res = await fetch('/api/v1/domains');
  if (!res.ok) throw new Error('Failed to fetch domains');
  const body = (await res.json()) as { success: boolean; data: ITDomain[] };
  return body.data;
}

/** Returns all active IT domains sorted by sort_order. Cached for 10 minutes. */
export function useDomains() {
  return useQuery<ITDomain[]>({
    queryKey: ['it-domains'],
    queryFn: fetchDomains,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Returns a key→domain map for fast label lookups. */
export function useDomainMap(): Record<string, ITDomain> {
  const { data = [] } = useDomains();
  return Object.fromEntries(data.map((d) => [d.key, d]));
}

/** Returns domains formatted as { value, label } for select/combobox components. */
export function useDomainOptions(): { value: string; label: string }[] {
  const { data = [] } = useDomains();
  return data.map((d) => ({ value: d.key, label: d.label }));
}

/** Returns domains formatted as { key, label, icon } for checkbox/tile pickers. */
export function useDomainTiles(): { key: string; label: string; icon: string }[] {
  const { data = [] } = useDomains();
  return data.map((d) => ({ key: d.key, label: d.short_label ?? d.label, icon: d.icon ?? '🔧' }));
}

/** Resolves a domain key to its label. Falls back to the key itself if not found. */
export function getDomainLabel(key: string, map: Record<string, ITDomain>): string {
  return map[key]?.label ?? key;
}

/** Resolves a domain key to its short label. Falls back to label then key. */
export function getDomainShortLabel(key: string, map: Record<string, ITDomain>): string {
  return map[key]?.short_label ?? map[key]?.label ?? key;
}
