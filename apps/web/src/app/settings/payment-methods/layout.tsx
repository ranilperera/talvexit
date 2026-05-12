'use client';

import { AppHeader } from '@/components/shared/AppHeader';
import { AppFooter } from '@/components/shared/AppFooter';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <AppHeader />
      <main className="flex-1">
        <div className="animate-fade-up">{children}</div>
      </main>
      <AppFooter />
    </div>
  );
}
