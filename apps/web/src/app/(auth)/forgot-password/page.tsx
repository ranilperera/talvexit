'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import customerApi from '@/lib/customer-api';
import AuthShell from '@/components/auth/AuthShell';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await customerApi.post('/api/v1/auth/forgot-password', { email });
    } finally {
      // Always show success — prevents email enumeration
      setLoading(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthShell
        leftHeadline="Reset your password."
        leftSubtext="Enter your email and we'll send a secure reset link. Links expire after 30 minutes."
      >
        <div className="text-center space-y-6 py-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
              <MailCheck size={28} className="text-teal-400" />
            </div>
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-slate-100">Check your inbox</h1>
            <p className="mt-2 text-sm text-slate-400">
              If <span className="text-slate-200 font-medium">{email}</span> is registered,
              we&apos;ve sent a password reset link. Check your spam folder if it doesn&apos;t arrive.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors no-underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      leftHeadline="Reset your password."
      leftSubtext="Enter your email and we'll send a secure reset link. Links expire after 30 minutes."
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-display font-bold text-xl text-slate-100">Reset your password</h1>
          <p className="mt-1 text-sm text-slate-400">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" fullWidth loading={loading}>
            Send reset link
          </Button>
        </form>

        <p className="text-center text-sm text-slate-500">
          Remembered your password?{' '}
          <Link href="/login" className="text-teal-400 hover:text-teal-300 transition-colors no-underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
