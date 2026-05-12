import type { Metadata } from 'next';
import AdminLayoutShell from './AdminLayoutShell';

// Private (admin) surface — never indexed. robots.ts disallows /admin/ for
// crawlers, this metadata adds the belt-and-braces noindex meta tag.
export const metadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
