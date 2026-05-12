import type { ReactNode } from 'react';

// The (shared) route group inherits the root layout and adds no shell of its own.
// Pages within decide their own chrome based on the user's role context.
export default function SharedLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
