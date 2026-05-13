import type { Metadata } from 'next';
import ProviderAgreementClient from './ProviderAgreementClient';

export const metadata: Metadata = {
  title: 'Provider Agreement | talvex.com.au',
  description:
    'Full text of the Waveful Digital Platforms Provider Agreement v2.0-2026 — terms for IT service providers using TalvexIT. Subscription-only platform, zero commission on engagements, direct customer-to-provider payments.',
};

export default function ProviderAgreementPage() {
  return <ProviderAgreementClient />;
}
