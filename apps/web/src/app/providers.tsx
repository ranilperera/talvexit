'use client';

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/context/ThemeContext';
import { UpgradePromptModal } from '@/components/shared/UpgradePromptModal';

// Suppress Next.js dev-overlay popups for known 429 SUBSCRIPTION_LIMIT_REACHED
// rejections — they're already handled by the customer-api interceptor
// (dispatches the global UpgradePromptModal). Per-page try/catch is no
// longer required for limit-gated calls.
function GlobalRejectionGuard() {
  useEffect(() => {
    function handler(e: PromiseRejectionEvent) {
      const reason = e.reason as
        | {
            response?: {
              status?: number;
              data?: { error?: { code?: string } };
            };
          }
        | undefined;
      const status = reason?.response?.status;
      const code = reason?.response?.data?.error?.code;
      if (status === 429 && code === 'SUBSCRIPTION_LIMIT_REACHED') {
        e.preventDefault();
      }
    }
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);
  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {children}
        <UpgradePromptModal />
        <GlobalRejectionGuard />
        <Toaster
          theme="system"
          position="bottom-right"
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
