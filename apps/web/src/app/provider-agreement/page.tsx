import type { Metadata } from 'next';
import ProviderAgreementClient from './ProviderAgreementClient';

export const metadata: Metadata = {
  title: 'Provider Agreement | talvex.com.au',
  description:
    'Full text of the Onsys Pty Ltd Provider Agreement v1.0-2026 — governing Onsys acting as non-exclusive commercial and billing agent for IT service providers.',
};

export default function ProviderAgreementPage() {
  return <ProviderAgreementClient />;
}
