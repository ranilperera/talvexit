import type { Metadata } from 'next';
import PrivacyClient from './PrivacyClient';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'talvex.com.au Privacy Policy. Compliant with the Australian Privacy Act 1988 (APPs) and GDPR. How we collect, use, and protect your personal information.',
};

export default function PrivacyPage() {
  return <PrivacyClient />;
}
