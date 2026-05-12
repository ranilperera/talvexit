import type { Metadata } from 'next';
import SuccessClient from './SuccessClient';

export const metadata: Metadata = {
  title: 'Subscription confirmed',
  robots: { index: false },
};

export default function SubscribeSuccessPage() {
  return <SuccessClient />;
}
