'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, ShieldCheck, ArrowLeft, RefreshCw, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import customerApi from '@/lib/customer-api';
import { setToken, setRefreshToken, setUser } from '@/lib/customer-auth';
import { setAdminToken } from '@/lib/auth';
import AuthShell from '@/components/auth/AuthShell';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'credentials' | 'otp' | 'totp';

interface LoginApiResponse {
  // Credentials step → OTP required
  otp_required?: true;
  challenge_token?: string;
  email_hint?: string;
  expires_in?: number;
  // TOTP required (after OTP or TEST_BYPASS_OTP)
  mfa_required?: true;
  mfa_token?: string;
  // Direct tokens (TEST_BYPASS_OTP or after all factors)
  access_token?: string;
  refresh_token?: string;
  must_change_password?: boolean;
  user?: { id: string; email: string; account_type: string; full_name: string };
}

function resolveRedirect(accountType: string): string {
  if (['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'].includes(accountType)) return '/admin/dashboard';
  if (['INDIVIDUAL_CONTRACTOR', 'ORGANISATION_ADMIN', 'ORG_MEMBER'].includes(accountType)) return '/contractor/dashboard';
  if (accountType === 'COMPANY_ADMIN' || accountType === 'COMPANY_MEMBER') return '/company/dashboard';
  return '/customer/dashboard';
}

// ─── OtpInput component ───────────────────────────────────────────────────────

function OtpInput({
  value,
  onChange,
  disabled,
  hasError,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  hasError: boolean;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').slice(0, 6);

  function handleChange(index: number, char: string) {
    const arr = digits.split('');
    if (char === '') {
      arr[index] = ' ';
      const joined = arr.join('').trimEnd();
      onChange(joined);
      if (index > 0) inputRefs.current[index - 1]?.focus();
    } else {
      const digit = char.replace(/\D/g, '').slice(-1);
      if (!digit) return;
      arr[index] = digit;
      onChange(arr.join('').trimEnd());
      if (index < 5) inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const lastIdx = Math.min(pasted.length, 5);
      inputRefs.current[lastIdx]?.focus();
    }
  }

  return (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] === ' ' ? '' : digits[i]}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Backspace' && (!digits[i] || digits[i] === ' ')) handleChange(i, ''); }}
          onPaste={handlePaste}
          className={[
            'w-11 h-13 text-center text-xl font-bold font-display',
            'rounded-xl border-2 transition-all bg-slate-800 text-slate-100',
            'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
            hasError
              ? 'border-red-500'
              : digits[i] && digits[i] !== ' '
                ? 'border-teal-500 text-teal-400'
                : 'border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

// ─── CountdownTimer component ─────────────────────────────────────────────────

function CountdownTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (remaining <= 0) { onExpireRef.current(); return; }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  return (
    <span className={remaining < 60 ? 'text-red-400' : 'text-slate-400'}>
      {mins}:{String(secs).padStart(2, '0')}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === 'true';
  const otpSubmittingRef = useRef(false);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [credsLoading, setCredsLoading] = useState(false);
  const [credsError, setCredsError] = useState('');

  const [challengeToken, setChallengeToken] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpExpired, setOtpExpired] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [mfaToken, setMfaToken] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const ADMIN_ROLES = ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'];
  const BLOCKED_RETURN_PATHS = ['/login', '/admin/login', '/register', '/forgot-password', '/reset-password'];

  function finishLogin(data: LoginApiResponse) {
    if (!data.access_token || !data.user) return;
    setToken(data.access_token);
    if (data.refresh_token) setRefreshToken(data.refresh_token);
    setUser(data.user);

    // Admin accounts also need admin_token for the admin panel's API client
    if (ADMIN_ROLES.includes(data.user.account_type)) {
      setAdminToken(data.access_token);
      if (data.refresh_token) localStorage.setItem('admin_refresh_token', data.refresh_token);
    }

    if (data.must_change_password && ADMIN_ROLES.includes(data.user.account_type)) {
      router.push('/admin/change-password');
      return;
    }

    // Respect ?redirect= param (e.g. from middleware or task page auth prompt)
    // but never redirect back to a login/auth page — that creates a loop
    const redirectParam = searchParams.get('redirect');
    const decoded = redirectParam ? decodeURIComponent(redirectParam) : '';
    const isBlocked = !decoded || BLOCKED_RETURN_PATHS.some((p) => decoded === p || decoded.startsWith(p + '?') || decoded.startsWith(p + '/'));
    const dest = isBlocked ? resolveRedirect(data.user.account_type) : decoded;
    router.push(dest);
  }

  // ── Step 1: Credentials ──

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setCredsError('');
    setCredsLoading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: LoginApiResponse }>(
        '/api/v1/auth/login', { email, password },
      );
      const data = res.data.data;
      if (data.otp_required && data.challenge_token) {
        setChallengeToken(data.challenge_token);
        setEmailHint(data.email_hint ?? '');
        setOtpValue(''); setOtpError(''); setOtpExpired(false); setAttemptsRemaining(5);
        setStep('otp');
        return;
      }
      if (data.mfa_required && data.mfa_token) {
        setMfaToken(data.mfa_token); setStep('totp'); return;
      }
      finishLogin(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'INVALID_CREDENTIALS') setCredsError('Incorrect email or password.');
      else if (code === 'ACCOUNT_LOCKED') setCredsError('Account locked after too many failed attempts. Try again in 15 minutes.');
      else if (code === 'EMAIL_NOT_VERIFIED') setCredsError('Please verify your email before signing in.');
      else setCredsError(e.response?.data?.error?.message ?? 'Login failed. Please try again.');
    } finally {
      setCredsLoading(false);
    }
  }

  // ── Step 2: OTP Verify ──

  const verifyOtp = useCallback(async (code: string) => {
    if (code.replace(/\s/g, '').length < 6) return;
    if (otpSubmittingRef.current) return;  // prevent double-fire
    otpSubmittingRef.current = true;
    setOtpLoading(true); setOtpError('');
    try {
      const res = await customerApi.post<{ success: boolean; data: LoginApiResponse }>(
        '/api/v1/auth/verify-otp', { challenge_token: challengeToken, otp_code: code.trim() },
      );
      const data = res.data.data;
      // Clear value immediately so the useEffect doesn't re-fire when otpLoading → false
      setOtpValue('');
      if (data.mfa_required && data.mfa_token) {
        setMfaToken(data.mfa_token); setStep('totp'); return;
      }
      finishLogin(data);
    } catch (err: unknown) {
      otpSubmittingRef.current = false;  // allow retry on error
      const e = err as { response?: { data?: { error?: { code?: string; message?: string; attempts_remaining?: number } } } };
      const errData = e.response?.data?.error;
      setOtpValue('');
      if (errData?.code === 'OTP_INCORRECT') {
        const rem = errData.attempts_remaining ?? 0;
        setAttemptsRemaining(rem);
        setOtpError(errData.message ?? 'Incorrect code.');
        if (rem <= 0) setTimeout(() => setStep('credentials'), 2500);
      } else if (errData?.code === 'OTP_EXPIRED') {
        setOtpExpired(true); setOtpError('Code expired. Please request a new one.');
      } else if (errData?.code === 'OTP_MAX_ATTEMPTS') {
        setOtpError(errData.message ?? 'Too many attempts.'); setTimeout(() => setStep('credentials'), 2500);
      } else {
        setOtpError(errData?.message ?? 'Verification failed. Please try again.');
      }
    } finally {
      setOtpLoading(false);
    }
  }, [challengeToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-submit on 6th digit
  useEffect(() => {
    const clean = otpValue.replace(/\s/g, '');
    if (clean.length === 6 && !otpLoading && step === 'otp') {
      void verifyOtp(clean);
    }
  }, [otpValue, otpLoading, step, verifyOtp]);

  async function handleResend() {
    setResendLoading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { challenge_token: string; email_hint: string } }>(
        '/api/v1/auth/resend-otp', { challenge_token: challengeToken },
      );
      const data = res.data.data;
      setChallengeToken(data.challenge_token);
      setOtpValue(''); setOtpError(''); setOtpExpired(false); setAttemptsRemaining(5);
      setResendCooldown(60);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setOtpError(e.response?.data?.error?.message ?? 'Could not resend. Please log in again.');
    } finally {
      setResendLoading(false);
    }
  }

  // ── Step 3: TOTP ──

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault(); setMfaError(''); setMfaLoading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: LoginApiResponse }>(
        '/api/v1/auth/mfa/validate', { mfa_token: mfaToken, totp_code: totp },
      );
      finishLogin(res.data.data);
    } catch {
      setMfaError('Invalid code. Please try again.');
    } finally {
      setMfaLoading(false);
    }
  }

  // ── RENDER: TOTP step ──

  if (step === 'totp') {
    return (
      <AuthShell
        leftHeadline="Two-factor authentication."
        leftSubtext="Enter the code from your authenticator app to complete sign in."
      >
      <div className="space-y-6">
        <div>
          <h1 className="font-display font-bold text-xl text-slate-100">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-slate-400">Enter the 6-digit code from your authenticator app.</p>
        </div>
        {mfaError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{mfaError}</div>
        )}
        <form onSubmit={(e) => { void handleMfa(e); }} className="space-y-4">
          <Input label="Authentication code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={totp} onChange={(e) => setTotp(e.target.value)} required />
          <Button type="submit" fullWidth loading={mfaLoading}>Verify</Button>
        </form>
        <button onClick={() => { setStep('otp'); setTotp(''); setMfaError(''); }} className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
          Back
        </button>
      </div>
      </AuthShell>
    );
  }

  // ── RENDER: OTP step ──

  if (step === 'otp') {
    return (
      <AuthShell
        leftHeadline="Two-step security."
        leftSubtext="We send a one-time code to your email on every sign in. This keeps your account and your clients' data safe."
        leftContent={
          <div
            className="p-4 rounded-xl border text-sm"
            style={{ background: 'rgba(29,158,117,.08)', borderColor: 'rgba(29,158,117,.2)' }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: '#5DCAA5' }}>Why we require this</p>
            <p className="text-xs leading-relaxed text-slate-500">
              Talvex handles enterprise procurement, financial transactions, and identity-verified contractor data.
              Email verification on every login is part of our security model.
            </p>
          </div>
        }
      >
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={24} className="text-teal-400" />
          </div>
          <h1 className="font-display font-bold text-xl text-slate-100">Check your email</h1>
          <p className="mt-1 text-sm text-slate-400">
            We sent a 6-digit code to{' '}
            <span className="text-slate-200 font-medium">{emailHint}</span>
          </p>
        </div>

        <div className="space-y-4">
          <OtpInput value={otpValue} onChange={(v) => { setOtpValue(v); setOtpError(''); }} disabled={otpLoading || otpExpired} hasError={!!otpError} />

          {otpLoading && <p className="text-center text-sm text-teal-400">Verifying…</p>}
          {otpError && <p className="text-center text-sm text-red-400">{otpError}</p>}
          {!otpError && attemptsRemaining < 5 && attemptsRemaining > 0 && (
            <p className="text-center text-xs text-amber-400">{attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining</p>
          )}
        </div>

        <div className="text-center space-y-3">
          {!otpExpired
            ? <p className="text-sm text-slate-500">Code expires in <CountdownTimer seconds={600} onExpire={() => setOtpExpired(true)} /></p>
            : <p className="text-sm text-red-400">Code expired.</p>
          }
          <button
            onClick={() => { void handleResend(); }}
            disabled={resendLoading || resendCooldown > 0}
            className="flex items-center gap-1.5 text-sm text-teal-400 hover:text-teal-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mx-auto"
          >
            <RefreshCw size={13} className={resendLoading ? 'animate-spin' : ''} />
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Send a new code'}
          </button>
        </div>

        <button
          onClick={() => { setStep('credentials'); setOtpValue(''); setOtpError(''); }}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mx-auto"
        >
          <ArrowLeft size={14} /> Back to sign in
        </button>

        <p className="text-center text-xs text-slate-600">Didn&apos;t receive the email? Check your spam folder or click &ldquo;Send a new code&rdquo; above.</p>
      </div>
      </AuthShell>
    );
  }

  // ── RENDER: Credentials step ──

  return (
    <AuthShell
      leftHeadline="Welcome back."
      leftSubtext="Sign in to your TalvexIT account to manage your engagements, proposals, and payments."
    >
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-xl text-slate-100">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Enter your credentials to continue</p>
      </div>

      {verified && (
        <div className="flex items-center gap-3 rounded-xl bg-teal-500/10 border border-teal-500/30 px-4 py-3 text-sm text-teal-300">
          <CheckCircle size={16} className="shrink-0 text-teal-400" />
          Email verified! You can now sign in.
        </div>
      )}

      {credsError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{credsError}</div>
      )}

      <form onSubmit={(e) => { void handleLogin(e); }} className="space-y-4">
        <Input label="Email address" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 tracking-wide">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150"
            />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded border-slate-600 bg-slate-800 accent-teal-500" />
            <span className="text-xs text-slate-400">Remember me</span>
          </label>
          <Link href="/forgot-password" className="text-xs text-teal-400 hover:text-teal-300 transition-colors no-underline">Forgot password?</Link>
        </div>

        <Button type="submit" fullWidth loading={credsLoading} className="mt-2">Continue</Button>
      </form>

      <div className="flex items-start gap-2.5 pt-4 border-t border-slate-800">
        <ShieldCheck size={14} className="text-teal-500 mt-0.5 shrink-0" />
        <p className="text-xs text-slate-500">A verification code will be sent to your email after entering your password.</p>
      </div>

      <p className="text-center text-sm text-slate-500">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-teal-400 hover:text-teal-300 transition-colors no-underline">Create account</Link>
      </p>
    </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}
