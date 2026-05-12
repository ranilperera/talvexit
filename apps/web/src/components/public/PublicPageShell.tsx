'use client';
import { getActiveTheme } from '@/lib/homepage-themes';
import { PublicNav } from '@/components/shared/PublicNav';
import { PublicFooter } from '@/components/shared/PublicFooter';

const t = getActiveTheme();

// ── SHELL ─────────────────────────────────────────────────────────────────────

interface PublicPageShellProps {
  children: React.ReactNode;
}

export default function PublicPageShell({ children }: PublicPageShellProps) {
  return (
    <>
      <PublicNav />
      <main style={{ background: t.pageBg, minHeight: '100vh' }}>
        {children}
      </main>
      <PublicFooter />
    </>
  );
}

// Re-export theme tokens so pages don't need to re-import
export { t as theme };
