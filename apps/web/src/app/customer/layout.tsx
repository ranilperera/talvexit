import type { Metadata } from 'next';
import CustomerLayoutShell from './CustomerLayoutShell';

// Private (authenticated) surface — never indexed. robots.ts disallows the
// path for crawlers, this metadata adds the belt-and-braces noindex meta tag.
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <CustomerLayoutShell>{children}</CustomerLayoutShell>;
}
