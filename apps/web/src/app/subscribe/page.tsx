import type { Metadata } from 'next';
import { Suspense } from 'react';
import SubscribeClient from './SubscribeClient';

export const metadata: Metadata = {
  title: 'Subscribe',
  robots: { index: false },
};

export default function SubscribePage() {
  return (
    <Suspense fallback={null}>
      <SubscribeClient />
    </Suspense>
  );
}
