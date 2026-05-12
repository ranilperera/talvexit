import type { Metadata } from 'next';
import ContractorsClient from './ContractorsClient';

export const metadata: Metadata = {
  title: 'For IT Consultants — Join the Verified Marketplace',
  description:
    'Senior L2/L3 IT specialists earn more on TalvexIT. Subscription-only — zero commission on engagements. Direct customer-to-supplier payments. Fixed-scope contracts with verified Australian businesses. Apply to join in under 10 minutes.',
  openGraph: {
    title: 'For IT Consultants | TalvexIT',
    description: 'Subscription-only marketplace for senior IT consultants. Zero commission. Direct payments. Verified enterprise clients. Apply to join.',
  },
};

export default function ContractorsPage() {
  return <ContractorsClient />;
}
