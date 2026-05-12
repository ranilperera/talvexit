import type { Metadata } from 'next';
import PricingClient, { type PublicPlan } from './PricingClient';
import { BreadcrumbListJsonLd } from '@/components/seo/JsonLd';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Pricing — Subscription only, zero commission',
  description:
    'TalvexIT charges a flat monthly subscription. Zero commission on engagements. Customers pay suppliers directly via Stripe link, AU bank, SWIFT, PayPal, Wise, or any rail. Free tiers on both sides — start without a credit card.',
  openGraph: {
    title: 'Pricing — Zero commission marketplace | TalvexIT',
    description:
      'Subscription-only pricing for the senior IT marketplace. Customers pay suppliers directly — TalvexIT never holds funds and never takes a per-engagement skim.',
  },
};

// ─── Server-side plan fetch (best-effort) ────────────────────────────────────
// If the API is reachable from the Next server, we get a fast first paint with
// plans pre-rendered. If not (build env, API down, etc.) we render with an
// empty list and let the client component fetch on mount.

async function fetchPlansServerSide(): Promise<PublicPlan[]> {
  const baseUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001';
  try {
    const res = await fetch(`${baseUrl}/api/v1/subscriptions/plans`, {
      // Plans change rarely; revalidate hourly. Override per-deploy if needed.
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { success: boolean; data: PublicPlan[] };
    return json.success ? json.data : [];
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const initialPlans = await fetchPlansServerSide();
  return (
    <>
      <BreadcrumbListJsonLd
        items={[
          { name: 'Home', url: siteUrl('/') },
          { name: 'Pricing', url: siteUrl('/pricing') },
        ]}
      />
      <PricingClient initialPlans={initialPlans} />
    </>
  );
}
