import type { Metadata } from 'next';
import FaqClient from './FaqClient';

export const metadata: Metadata = {
  title: 'FAQ | TalvexIT',
  description:
    'Frequently asked questions about the TalvexIT platform — payments, subscriptions, engagements, KYC, disputes, and data handling. Operated by Waveful Digital Platforms (ABN 49 602 081 005).',
};

export default function FaqPage() {
  return <FaqClient />;
}
