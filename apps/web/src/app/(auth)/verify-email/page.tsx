'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import AuthShell from '@/components/auth/AuthShell';

type State = 'loading' | 'success' | 'expired' | 'error';

function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';

  const [state, setState] = useState<State>('loading');
  const [countdown, setCountdown] = useState(3);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [resendEmail, setResendEmail] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);
  // Prevents React StrictMode's double-invoke from firing the API call twice.
  // The first call clears the token from DB; without this guard the second call
  // finds no token and overwrites 'success' state with 'error'.
  const hasVerified = useRef(false);

  useEffect(() => {
    if (hasVerified.current) return;
    if (!token) { setState('error'); return; }

    hasVerified.current = true;

    // Scrub the token from the URL so it doesn't show up in browser history,
    // tab titles, screen-share recordings, or the Referer of any subsequent
    // outbound link. Replace, don't push, so Back doesn't go to a stale link.
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }

    customerApi
      .post('/api/v1/auth/verify-email', { token })
      .then(() => {
        setState('success');
      })
      .catch((err: unknown) => {
        const code = (err as { response?: { data?: { error?: { code?: string } } } })
          ?.response?.data?.error?.code;
        setState(code === 'EXPIRED_TOKEN' ? 'expired' : 'error');
      });
  }, [token]);

  // Countdown redirect after success
  useEffect(() => {
    if (state !== 'success') return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          router.push('/login?verified=true');
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state, router]);

  async function resendVerification(email: string) {
    setResending(true);
    try {
      await customerApi.post('/api/v1/auth/resend-verification', { email });
      setResent(true);
    } catch {
      // handled by interceptor
    } finally {
      setResending(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="text-center space-y-4">
        <Loader2 size={32} className="animate-spin text-teal-400 mx-auto" />
        <p className="text-slate-300 text-sm">Verifying your email&hellip;</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center space-y-5">
        {/* Animated checkmark */}
        <div className="w-16 h-16 rounded-full bg-teal-500/15 border border-teal-500/30 flex items-center justify-center mx-auto animate-[scale-in_0.3s_ease-out]">
          <CheckCircle size={28} className="text-teal-400" />
        </div>

        <div className="space-y-2">
          <h1 className="font-display font-bold text-xl text-slate-100">Email verified!</h1>
          <p className="text-sm text-slate-400">
            Your account is ready. Redirecting to login in {countdown}s&hellip;
          </p>
        </div>

        <Button onClick={() => router.push('/login?verified=true')} fullWidth>
          Log In Now
        </Button>
      </div>
    );
  }

  const isExpired = state === 'expired';

  return (
    <div className="text-center space-y-5">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
        <AlertTriangle size={28} className="text-amber-400" />
      </div>

      <div className="space-y-2">
        <h1 className="font-display font-bold text-xl text-slate-100">
          {isExpired ? 'Link expired' : 'Invalid link'}
        </h1>
        <p className="text-sm text-slate-400">
          {isExpired
            ? 'This verification link has expired. Links are valid for 24 hours.'
            : 'This verification link is invalid or has already been used.'}
        </p>
      </div>

      {resent ? (
        <p className="text-sm text-teal-400">
          ✓ A new verification email has been sent. Please check your inbox.
        </p>
      ) : showEmailInput ? (
        <form
          onSubmit={(e) => { e.preventDefault(); void resendVerification(resendEmail); }}
          className="space-y-3 text-left"
        >
          <input
            type="email"
            required
            placeholder="your@email.com"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            autoFocus
            className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
          />
          <Button type="submit" fullWidth loading={resending}>
            Send verification email
          </Button>
        </form>
      ) : (
        <Button
          fullWidth
          variant="secondary"
          onClick={() => setShowEmailInput(true)}
        >
          Request a new verification email
        </Button>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell
      leftHeadline="Secure your account"
      leftSubtext="One-click email verification keeps your account safe and unlocks full platform access."
    >
      <Suspense>
        <VerifyEmailPageContent />
      </Suspense>
    </AuthShell>
  );
}
