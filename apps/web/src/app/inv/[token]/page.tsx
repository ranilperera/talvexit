import type { Metadata } from 'next';
import PublicInvoiceClient from './PublicInvoiceClient';

export const metadata: Metadata = {
  title: 'Invoice',
  robots: { index: false, follow: false },
};

export default function PublicInvoicePage() {
  return <PublicInvoiceClient />;
}
