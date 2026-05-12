'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import customerApi from '@/lib/customer-api';
import AuthShell from '@/components/auth/AuthShell';

function PasswordStrengthBar({ password }: { password: string }) {
  const rules = [
    password.length >= 12,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ];
  const score = rules.filter(Boolean).length;
  const colors = ['bg-slate-700', 'bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-teal-500'];

  if (!password) return null;
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? colors[score] : 'bg-slate-700'}`}
        />
      ))}
    </div>
  );
}

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Capture the token then scrub it from the URL so it doesn't end up in
  // browser history / Referer / screen-share recordings.
  const initialToken = searchParams.get('token') ?? '';
  const [token] = useState(initialToken);

  useEffect(() => {
    if (typeof window !== 'undefined' && initialToken) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [initialToken]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <AuthShell
        leftHeadline="Reset your password."
        leftSubtext="Enter your email and we'll send a secure reset link. Links expire after 30 minutes."
      >
        <div className="text-center space-y-4 py-4">
          <p className="text-red-400 text-sm">Invalid or missing reset token.</p>
          <Link href="/forgot-password" className="text-teal-400 hover:text-teal-300 no-underline text-sm">
            Request a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 12) { setError('Password must be at least 12 characters.'); return; }

    setLoading(true);
    try {
      await customerApi.post('/api/v1/auth/reset-password', { token, password });
      toast.success('Password updated. Please sign in.');
      router.push('/login');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'INVALID_TOKEN') setError('This reset link has expired. Please request a new one.');
      else setError(e.response?.data?.error?.message ?? 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      leftHeadline="Set your new password."
      leftSubtext="Choose a strong password of at least 12 characters. You'll be signed in after updating."
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-display font-bold text-xl text-slate-100">Set new password</h1>
          <p className="mt-1 text-sm text-slate-400">Choose a strong password for your account.</p>
        </div>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}{' '}
            {error.includes('expired') && (
              <Link href="/forgot-password" className="underline text-red-300">
                Request new link
              </Link>
            )}
          </div>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div className="space-y-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 tracking-wide">
                New password <span className="text-slate-600">(min 12 characters)</span>
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <PasswordStrengthBar password={password} />
          </div>

          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            error={confirm && confirm !== password ? 'Passwords do not match' : undefined}
          />

          <Button type="submit" fullWidth loading={loading}>
            Update password
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
