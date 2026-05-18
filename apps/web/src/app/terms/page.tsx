import type { Metadata } from 'next';
import TermsClient from './TermsClient';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'TalvexIT Terms of Service. Read our terms for customers, IT engineers, and IT consulting companies using the platform.',
};

export default function TermsPage() {
  return <TermsClient />;
}
