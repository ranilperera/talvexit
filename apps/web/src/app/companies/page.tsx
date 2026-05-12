import type { Metadata } from 'next';
import CompaniesClient from './CompaniesClient';

export const metadata: Metadata = {
  title: 'For IT Consulting Companies — Win enterprise contracts',
  description:
    'List your IT consulting firm on TalvexIT and win enterprise contracts on a fair commercial model. Zero commission on engagements. Central billing for all your members. Direct customer-to-company payments. Verified Australian buyers.',
  openGraph: {
    title: 'For IT Consulting Companies | TalvexIT',
    description: 'Subscription-only marketplace for senior IT consulting firms. Zero commission. Central billing. Multi-member teams. Verified enterprise clients.',
  },
};

export default function CompaniesPage() {
  return <CompaniesClient />;
}
