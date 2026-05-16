import type { Metadata } from 'next';
import CustomerAgreementClient from './CustomerAgreementClient';

export const metadata: Metadata = {
  title: 'Customer Agreement | TalvexIT',
  description:
    'Full text of the Waveful Digital Platforms Customer Agreement v1.0-2026 — terms for customers using TalvexIT to find and engage IT providers. Subscription-only platform, customer pays providers directly, no commission.',
};

export default function CustomerAgreementPage() {
  return <CustomerAgreementClient />;
}
