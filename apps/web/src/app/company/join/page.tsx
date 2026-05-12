'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, AlertTriangle, Building2, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { getUser, getToken } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvitationDetails {
  invited_email: string;
  role: 'COMPANY_ADMIN' | 'SENIOR_CONSULTANT' | 'CONSULTANT' | 'JUNIOR_CONSULTANT';
  job_title: string | null;
  company_name: string;
  company_logo_blob_path: string | null;
  inviter_name: string;
  expires_at: string;
  invited_email_has_account: boolean;
}

// ─── Role labels ─────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  COMPANY_ADMIN: 'Company Admin',
  SENIOR_CONSULTANT: 'Senior Consultant',
  CONSULTANT: 'Consultant',
  JUNIOR_CONSULTANT: 'Junior Consultant',
};

const ROLE_COLORS: Record<string, 'teal' | 'blue' | 'slate'> = {
  COMPANY_ADMIN: 'teal',
  SENIOR_CONSULTANT: 'blue',
  CONSULTANT: 'slate',
  JUNIOR_CONSULTANT: 'slate',
};

// ─── Password strength ────────────────────────────────────────────────────────

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Number', pass: /[0-9]/.test(password) },
    { label: 'Special char', pass: /[^a-zA-Z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-amber-400', 'bg-teal-500'];
  if (!password) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={clsx(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i <= score ? colors[score] : 'bg-slate-700',
            )}
          />
        ))}
      </div>
      <div className="flex gap-3 flex-wrap">
        {checks.map(({ label, pass }) => (
          <span
            key={label}
            className={clsx('text-[10px] flex items-center gap-1', pass ? 'text-teal-400' : 'text-slate-600')}
          >
            <span className="inline-block h-1 w-1 rounded-full" style={{ background: 'currentColor' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Company header card ──────────────────────────────────────────────────────

function CompanyCard({ inv }: { inv: InvitationDetails }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-4">
        {inv.company_logo_blob_path ? (
          <img
            src={inv.company_logo_blob_path}
            alt={inv.company_name}
            className="h-14 w-14 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="h-14 w-14 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <span className="text-xl font-bold text-amber-400">
              {inv.company_name[0] ?? 'C'}
            </span>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500 mb-1">You&apos;ve been invited to join</p>
          <h2 className="font-display font-bold text-xl text-slate-100">{inv.company_name}</h2>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Invited by</span>
          <span className="text-slate-200 font-medium">{inv.inviter_name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Role</span>
          <Badge color={ROLE_COLORS[inv.role] ?? 'slate'}>
            {ROLE_LABELS[inv.role] ?? inv.role}
          </Badge>
        </div>
        {inv.job_title && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Job title</span>
            <span className="text-slate-200">{inv.job_title}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Expires</span>
          <span className="text-slate-400 text-xs">
            {new Date(inv.expires_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main join content ────────────────────────────────────────────────────────

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loadingInv, setLoadingInv] = useState(true);
  const [invError, setInvError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [acceptedAsLoggedIn, setAcceptedAsLoggedIn] = useState(false);

  // Auth states
  const loggedInUser = getUser();
  const isLoggedIn = !!getToken();

  // Login form (path A — existing account, not logged in)
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Register form (path B — new account)
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regError, setRegError] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);

  // Accept (logged-in path)
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState('');

  // ── Load invitation ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setInvError('No invitation token found.');
      setLoadingInv(false);
      return;
    }
    customerApi
      .get<{ success: boolean; data: { invitation: InvitationDetails } }>(
        `/api/v1/company/join?token=${encodeURIComponent(token)}`,
      )
      .then((res) => {
        setInvitation(res.data.data.invitation);
      })
      .catch((err: unknown) => {
        const e = err as { response?: { data?: { error?: { code?: string } } } };
        const code = e.response?.data?.error?.code;
        if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
          setInvError('This invitation link is invalid or has expired.');
        } else {
          setInvError('Could not load invitation details. Please try again.');
        }
      })
      .finally(() => setLoadingInv(false));
  }, [token]);

  // ── Accept as logged-in user ───────────────────────────────────────────────

  async function handleAcceptLoggedIn() {
    setAcceptError('');
    setAcceptLoading(true);
    try {
      await customerApi.post('/api/v1/company/join', { token, existing: true });
      setAcceptedAsLoggedIn(true);
      setAccepted(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setAcceptError(e.response?.data?.error?.message ?? 'Failed to accept invitation.');
    } finally {
      setAcceptLoading(false);
    }
  }

  // ── Login and accept ───────────────────────────────────────────────────────

  async function handleLoginAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation) return;
    setLoginError('');
    setLoginLoading(true);
    try {
      // Login first
      const loginRes = await customerApi.post<{
        success: boolean;
        data: { access_token: string; refresh_token: string };
      }>('/api/v1/auth/login', {
        email: invitation.invited_email,
        password: loginPassword,
      });

      // Store tokens
      const { setToken, setRefreshToken, setUser } = await import('@/lib/customer-auth');
      const meRes = await customerApi.get<{
        success: boolean;
        data: { user: { id: string; email: string; account_type: string; full_name: string } };
      }>('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${loginRes.data.data.access_token}` },
      });
      setToken(loginRes.data.data.access_token);
      setRefreshToken(loginRes.data.data.refresh_token);
      setUser(meRes.data.data.user);

      // Accept invitation
      await customerApi.post('/api/v1/company/join', { token, existing: true });
      setAcceptedAsLoggedIn(true);
      setAccepted(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'INVALID_CREDENTIALS') {
        setLoginError('Incorrect password. Please try again.');
      } else if (code === 'EMAIL_NOT_VERIFIED') {
        setLoginError('Please verify your email before accepting an invitation.');
      } else {
        setLoginError(e.response?.data?.error?.message ?? 'Login failed. Please try again.');
      }
    } finally {
      setLoginLoading(false);
    }
  }

  // ── Register and accept ────────────────────────────────────────────────────

  async function handleRegisterAccept(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation) return;
    if (regPassword !== regConfirm) { setRegError('Passwords do not match.'); return; }
    if (regPassword.length < 8) { setRegError('Password must be at least 8 characters.'); return; }
    setRegError('');
    setRegLoading(true);
    try {
      await customerApi.post('/api/v1/company/join', {
        token,
        full_name: regName,
        password: regPassword,
        confirmed: true,
      });
      setAccepted(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'EMAIL_EXISTS') {
        setRegError('An account with this email already exists. Please log in instead.');
      } else {
        setRegError(e.response?.data?.error?.message ?? 'Registration failed. Please try again.');
      }
    } finally {
      setRegLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  // Loading
  if (loadingInv) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        <div className="h-48 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
      </div>
    );
  }

  // Error / invalid token
  if (invError || !invitation) {
    return (
      <div className="space-y-6 text-center py-4">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle size={28} className="text-red-400" />
          </div>
        </div>
        <div>
          <h1 className="font-display font-bold text-xl text-slate-100">Invalid invitation</h1>
          <p className="mt-2 text-sm text-slate-400">
            {invError || 'This invitation link is invalid or has expired.'}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            If you have questions, contact your company admin.
          </p>
        </div>
        <Button variant="ghost" fullWidth onClick={() => router.push('/login')}>
          Go to sign in
        </Button>
      </div>
    );
  }

  // Success state
  if (accepted) {
    return (
      <div className="text-center space-y-6 py-4">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <CheckCircle2 size={28} className="text-teal-400" />
          </div>
        </div>
        <div>
          <h1 className="font-display font-bold text-xl text-slate-100">
            Welcome to {invitation.company_name}!
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            You&apos;ve joined as{' '}
            <span className="text-slate-200 font-medium">
              {ROLE_LABELS[invitation.role] ?? invitation.role}
            </span>
            .
          </p>
        </div>
        {acceptedAsLoggedIn ? (
          <Button fullWidth onClick={() => router.push('/company/dashboard')}>
            Go to Company Dashboard
          </Button>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              Log in with your new account to access your company dashboard.
            </p>
            <Button fullWidth onClick={() => router.push('/login')}>
              Log in to get started
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── Logged in path ──────────────────────────────────────────────────────────

  if (isLoggedIn && loggedInUser) {
    const emailMatch = loggedInUser.email.toLowerCase() === invitation.invited_email.toLowerCase();

    if (emailMatch) {
      // Accept with logged-in account
      return (
        <div className="space-y-6">
          <CompanyCard inv={invitation} />

          {acceptError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {acceptError}
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-sm font-bold text-teal-400 shrink-0">
                {loggedInUser.full_name?.[0] ?? '?'}
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">{loggedInUser.full_name}</p>
                <p className="text-xs text-slate-500">{loggedInUser.email}</p>
              </div>
            </div>
            <Button fullWidth loading={acceptLoading} onClick={() => { void handleAcceptLoggedIn(); }}>
              Accept as {loggedInUser.full_name?.split(' ')[0]}
            </Button>
          </div>

          <p className="text-center text-xs text-slate-600">
            Not you?{' '}
            <button
              onClick={() => {
                const { clearToken } = require('@/lib/customer-auth') as { clearToken: () => void };
                clearToken();
                window.location.reload();
              }}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              Log out and switch account
            </button>
          </p>
        </div>
      );
    }

    // Email mismatch
    return (
      <div className="space-y-6">
        <CompanyCard inv={invitation} />

        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-300">Account mismatch</p>
              <p className="text-xs text-amber-400/80">
                This invitation was sent to{' '}
                <span className="font-medium text-amber-300">{invitation.invited_email}</span>.
                You&apos;re currently logged in as{' '}
                <span className="font-medium text-amber-300">{loggedInUser.email}</span>.
              </p>
            </div>
          </div>
        </div>

        <Button
          fullWidth
          variant="secondary"
          onClick={() => {
            import('@/lib/customer-auth').then(({ clearToken }) => {
              clearToken();
              window.location.reload();
            }).catch(() => {});
          }}
        >
          Log out and switch account
        </Button>

        <p className="text-center text-xs text-slate-600">
          Or{' '}
          <Link href="/contractor/dashboard" className="text-slate-500 hover:text-slate-300 transition-colors no-underline">
            continue to your dashboard
          </Link>
        </p>
      </div>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <CompanyCard inv={invitation} />

      {invitation.invited_email_has_account ? (
        // Path A: existing account — login form
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-800 pt-4">
            <Building2 size={12} className="shrink-0" />
            Log in to accept this invitation
          </div>

          {loginError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {loginError}
            </div>
          )}

          <form onSubmit={(e) => { void handleLoginAccept(e); }} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 tracking-wide">Email</label>
              <input
                type="email"
                value={invitation.invited_email}
                readOnly
                className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-800/60 border border-slate-700/60 outline-none cursor-not-allowed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 tracking-wide">Password</label>
              <div className="relative">
                <input
                  type={showLoginPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showLoginPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <Button type="submit" fullWidth loading={loginLoading}>
              Log in and join {invitation.company_name}
            </Button>
          </form>

          <p className="text-center text-xs text-slate-600">
            <Link href="/forgot-password" className="text-slate-500 hover:text-slate-300 transition-colors no-underline">
              Forgot password?
            </Link>
          </p>
        </div>
      ) : (
        // Path B: new to platform — register form
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-800 pt-4">
            <Building2 size={12} className="shrink-0" />
            Create your account to accept this invitation
          </div>

          {regError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {regError}
            </div>
          )}

          <form onSubmit={(e) => { void handleRegisterAccept(e); }} className="space-y-4">
            <Input
              label="Full name"
              type="text"
              autoComplete="name"
              placeholder="Alex Smith"
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 tracking-wide">Email</label>
              <input
                type="email"
                value={invitation.invited_email}
                readOnly
                className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-800/60 border border-slate-700/60 outline-none cursor-not-allowed"
              />
            </div>

            <div className="space-y-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showRegPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    className="w-full rounded-xl px-4 py-2.5 pr-11 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showRegPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <PasswordStrength password={regPassword} />
            </div>

            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={regConfirm}
              onChange={(e) => setRegConfirm(e.target.value)}
              required
              error={regConfirm && regConfirm !== regPassword ? 'Passwords do not match' : undefined}
            />

            <div className="rounded-xl bg-slate-800/40 border border-slate-700 px-4 py-3 text-xs text-slate-500">
              Your account will be created as a Company Member. You can also work independently on
              the platform using your personal contractor profile.
            </div>

            <Button type="submit" fullWidth loading={regLoading}>
              Create account and join {invitation.company_name}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="font-display font-bold text-2xl text-slate-100 no-underline">
            onys<span className="text-teal-400">.</span>online
          </Link>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-card-lg">
          <Suspense fallback={
            <div className="space-y-4">
              <div className="h-32 bg-slate-800 rounded-2xl animate-pulse" />
              <div className="h-48 bg-slate-800 rounded-2xl animate-pulse" />
            </div>
          }>
            <JoinPageContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
