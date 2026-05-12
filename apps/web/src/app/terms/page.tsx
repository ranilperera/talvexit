import type { Metadata } from 'next';
import TermsClient from './TermsClient';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'talvex.com.au Terms of Service. Read our terms for enterprise buyers, IT engineers, and IT consulting companies using the platform.',
};

export default function TermsPage() {
  return <TermsClient />;
}
