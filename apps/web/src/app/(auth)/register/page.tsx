'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Terminal,
  Building2,
  Eye,
  EyeOff,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import customerApi from '@/lib/customer-api';
import AuthShell from '@/components/auth/AuthShell';
import { getActiveTheme } from '@/lib/homepage-themes';
import { ALL_COUNTRIES } from '@/lib/country-tax-data';

const t = getActiveTheme();
const isLight = t.key === 'corporate-light' || t.key === 'arctic-minimal';

// Theme-adaptive class helpers
const inputCls = isLight
  ? 'w-full rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-white border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150'
  : 'w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 bg-slate-800 border border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all duration-150';

const labelCls = isLight ? 'text-xs font-medium text-slate-600 tracking-wide' : 'text-xs font-medium text-slate-400 tracking-wide';
const headingCls = isLight ? 'font-display font-bold text-xl text-slate-800' : 'font-display font-bold text-xl text-slate-100';
const subCls = isLight ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-400';
const mutedCls = isLight ? 'text-slate-500' : 'text-slate-500';
const linkCls = 'text-teal-500 hover:text-teal-400 transition-colors no-underline';
const separatorCls = isLight ? 'divide-slate-100' : 'divide-slate-700/60';
const agreeTextCls = isLight ? 'text-xs text-slate-500 leading-relaxed' : 'text-xs text-slate-400 leading-relaxed';

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountPath = 'CUSTOMER' | 'INDIVIDUAL_CONTRACTOR' | 'COMPANY';

// ─── ABN validation ───────────────────────────────────────────────────────────

function validateABN(raw: string): boolean {
  const digits = raw.replace(/\s/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split('').map(Number);
  nums[0] -= 1;
  const sum = nums.reduce((acc, d, i) => acc + d * weights[i]!, 0);
  return sum % 89 === 0;
}

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
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  if (!password) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={clsx(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i <= score ? colors[score] : isLight ? 'bg-slate-200' : 'bg-slate-700',
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {checks.map(({ label, pass }) => (
            <span
              key={label}
              className={clsx(
                'text-[10px] flex items-center gap-1',
                pass ? 'text-teal-500' : isLight ? 'text-slate-400' : 'text-slate-600',
              )}
            >
              <span className="inline-block h-1 w-1 rounded-full" style={{ background: 'currentColor' }} />
              {label}
            </span>
          ))}
        </div>
        <span className={clsx('text-[11px] font-medium', colors[score]?.replace('bg-', 'text-'))}>
          {labels[score]}
        </span>
      </div>
    </div>
  );
}

// ─── Password field with toggle ───────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  placeholder = 'Min. 8 characters',
  showStrength = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
  showStrength?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <label className={labelCls}>{label}</label>
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required
            className={clsx(inputCls, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2 transition-colors',
              isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      </div>
      {showStrength && <PasswordStrength password={value} />}
    </div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-500">
      {msg}
    </div>
  );
}

// ─── Path selection card ──────────────────────────────────────────────────────

function PathCard({
  selected,
  onClick,
  icon,
  title,
  desc,
  tag,
  accent = 'teal',
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  tag: string;
  accent?: 'teal' | 'amber';
}) {
  const isTeal = accent === 'teal';
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left p-4 rounded-xl border transition-all duration-150 space-y-3 w-full',
        selected
          ? isTeal
            ? 'border-teal-500 bg-teal-500/5'
            : 'border-amber-500 bg-amber-500/5'
          : isLight
          ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
          : 'border-slate-700 bg-slate-800/50 hover:border-slate-600',
      )}
    >
      <div
        className={clsx(
          'h-9 w-9 rounded-lg flex items-center justify-center',
          selected
            ? isTeal
              ? 'bg-teal-500/15'
              : 'bg-amber-500/15'
            : isLight
            ? 'bg-slate-100'
            : 'bg-slate-700',
        )}
      >
        <span
          className={clsx(
            selected
              ? isTeal
                ? 'text-teal-500'
                : 'text-amber-500'
              : isLight
              ? 'text-slate-500'
              : 'text-slate-400',
          )}
        >
          {icon}
        </span>
      </div>
      <div>
        <p className={clsx('text-sm font-semibold', isLight ? 'text-slate-800' : 'text-slate-100')}>{title}</p>
        <p className={clsx('mt-1 text-xs leading-relaxed', isLight ? 'text-slate-500' : 'text-slate-400')}>{desc}</p>
      </div>
      <span
        className={clsx(
          'inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
          selected
            ? isTeal
              ? 'bg-teal-500/20 text-teal-600'
              : 'bg-amber-500/20 text-amber-600'
            : isLight
            ? 'bg-slate-100 text-slate-500'
            : 'bg-slate-700 text-slate-500',
        )}
      >
        {tag}
      </span>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RegisterPageContent() {
  const router = useRouter();

  // Top-level path
  const [path, setPath] = useState<AccountPath | null>(null);

  // ── Customer / Contractor form state ──
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [entityType, setEntityType] = useState<'AU_SOLE_TRADER' | 'OVERSEAS_INDIVIDUAL'>('AU_SOLE_TRADER');
  const [agreed, setAgreed] = useState(false);
  const [stdDone, setStdDone] = useState(false);
  const [stdEmail, setStdEmail] = useState('');

  // ── Company form state ──
  const [companyDone, setCompanyDone] = useState(false);
  const [companyRegisteredEmail, setCompanyRegisteredEmail] = useState('');
  const [repName, setRepName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repPassword, setRepPassword] = useState('');
  const [repConfirm, setRepConfirm] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyCountry, setCompanyCountry] = useState('AU');
  const [abn, setAbn] = useState('');
  const [companyAgreed, setCompanyAgreed] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const abnValid = validateABN(abn);
  const abnDirty = abn.length > 0;

  // ── Standard registration submit ──────────────────────────────────────────

  async function handleStdSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPw) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!agreed) { setError('Please accept the terms to continue.'); return; }
    setLoading(true);
    try {
      await customerApi.post('/api/v1/auth/register', {
        email,
        password,
        full_name: fullName,
        account_type: path,
        ...(path === 'INDIVIDUAL_CONTRACTOR' ? { entity_type: entityType } : {}),
      });
      setStdEmail(email);
      setStdDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'EMAIL_EXISTS') setError('An account with this email already exists.');
      else setError(e.response?.data?.error?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ── Company registration submit ───────────────────────────────────────────

  async function handleCompanySubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!repName.trim()) { setError('Full name is required.'); return; }
    if (!repEmail.trim()) { setError('Email is required.'); return; }
    if (repPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (repPassword !== repConfirm) { setError('Passwords do not match.'); return; }
    if (!jobTitle.trim()) { setError('Job title is required.'); return; }
    if (!companyName.trim()) { setError('Company name is required.'); return; }
    if (companyCountry === 'AU' && abn.trim() && !abnValid) { setError('ABN is invalid — please check and re-enter.'); return; }
    if (!companyAgreed) { setError('Please accept the terms to continue.'); return; }
    setLoading(true);
    try {
      await customerApi.post('/api/v1/companies/register', {
        full_name: repName,
        email: repEmail,
        password: repPassword,
        job_title: jobTitle,
        company_name: companyName,
        country: companyCountry,
        ...(abn.trim() ? { abn: abn.replace(/\s/g, '') } : {}),
        agreed_to_terms: true,
      });
      setCompanyRegisteredEmail(repEmail);
      setCompanyDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      if (code === 'EMAIL_IN_USE' || code === 'EMAIL_EXISTS') setError('An account with this email already exists.');
      else if (code === 'ABN_IN_USE') setError('A company with this ABN is already registered.');
      else setError(e.response?.data?.error?.message ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Renders
  // ─────────────────────────────────────────────────────────────────────────

  // Standard success
  if (stdDone) {
    return (
      <AuthShell
        leftHeadline="Almost there."
        leftSubtext="Verify your email to activate your account and get started."
      >
        <div className="text-center space-y-6 py-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-teal-500" />
            </div>
          </div>
          <div>
            <h1 className={headingCls}>Check your email</h1>
            <p className={clsx('mt-2 text-sm', isLight ? 'text-slate-500' : 'text-slate-400')}>
              We&apos;ve sent a verification link to<br />
              <span className={clsx('font-medium', isLight ? 'text-slate-700' : 'text-slate-200')}>{stdEmail}</span>
            </p>
          </div>
          <p className={clsx('text-xs', mutedCls)}>
            Didn&apos;t receive it?{' '}
            <button
              onClick={() => { void customerApi.post('/api/v1/auth/forgot-password', { email: stdEmail }); }}
              className={linkCls}
            >
              Resend link
            </button>
          </p>
          <Button variant="ghost" fullWidth onClick={() => router.push('/login')}>
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ── Path selection ─────────────────────────────────────────────────────────
  if (!path) {
    return (
      <AuthShell
        leftHeadline="Create your account."
        leftSubtext="Choose how you'll use Talvex and get set up in minutes."
      >
        <div className="space-y-6">
          <div>
            <h1 className={headingCls}>Create an account</h1>
            <p className={subCls}>How will you use Talvex?</p>
          </div>

          <div className="space-y-3">
            <PathCard
              selected={false}
              onClick={() => setPath('CUSTOMER')}
              icon={<Briefcase size={17} />}
              title="Engage Expertise"
              desc="Post IT requirements, receive proposals, and engage senior IT consultants on fixed-scope contracts. Customers pay providers directly per their invoice."
              tag="Customer account"
              accent="teal"
            />
            <PathCard
              selected={false}
              onClick={() => setPath('INDIVIDUAL_CONTRACTOR')}
              icon={<Terminal size={17} />}
              title="Join as Engineer"
              desc="Offer your L2/L3 skills globally. Get KYC-verified, get matched, win fixed-scope contracts."
              tag="Contractor account"
              accent="teal"
            />
            <PathCard
              selected={false}
              onClick={() => setPath('COMPANY')}
              icon={<Building2 size={17} />}
              title="Register Your Company"
              desc="Offer managed IT services with full PO and invoicing support. Win enterprise contracts."
              tag="Consulting company"
              accent="amber"
            />
          </div>

          <p className={clsx('text-center text-sm', mutedCls)}>
            Already have an account?{' '}
            <Link href="/login" className={linkCls}>
              Sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  // ── Customer / Contractor form ─────────────────────────────────────────────
  if (path === 'CUSTOMER' || path === 'INDIVIDUAL_CONTRACTOR') {
    return (
      <AuthShell
        leftHeadline={path === 'CUSTOMER' ? 'Engage senior IT consultants — on scoped contracts.' : 'Join as an engineer.'}
        leftSubtext={
          path === 'CUSTOMER'
            ? 'Engage pre-vetted IT consultants for fixed-scope infrastructure projects.'
            : 'Get verified, get matched, and win enterprise contracts.'
        }
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={headingCls}>Create your account</h1>
              <p className={subCls}>
                {path === 'CUSTOMER' ? 'Customer' : 'Contractor'} account
              </p>
            </div>
            <button
              onClick={() => setPath(null)}
              className={clsx('text-xs transition-colors flex items-center gap-1', isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300')}
            >
              <ChevronLeft size={12} /> Change
            </button>
          </div>

          {error && <ErrorBanner msg={error} />}

          <form onSubmit={(e) => { void handleStdSubmit(e); }} className="space-y-4">
            <Input
              label="Full name"
              type="text"
              autoComplete="name"
              placeholder="Alex Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={setPassword}
              showStrength
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              required
              error={confirmPw && confirmPw !== password ? 'Passwords do not match' : undefined}
            />

            {path === 'INDIVIDUAL_CONTRACTOR' && (
              <div className="space-y-3">
                <p className={labelCls}>Entity type</p>
                <div className="space-y-2">
                  {/* AU Sole Trader */}
                  <label
                    className={clsx(
                      'flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-all duration-150 group',
                      entityType === 'AU_SOLE_TRADER'
                        ? 'border-teal-500 bg-teal-500/5'
                        : isLight
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600',
                    )}
                  >
                    <input
                      type="radio"
                      name="entity_type"
                      value="AU_SOLE_TRADER"
                      checked={entityType === 'AU_SOLE_TRADER'}
                      onChange={() => setEntityType('AU_SOLE_TRADER')}
                      className="mt-1 accent-teal-500 shrink-0"
                    />
                    <div className="space-y-1">
                      <p className={clsx('text-sm font-semibold', isLight ? 'text-slate-800' : 'text-slate-100')}>
                        Individual / Sole trader (AU)
                      </p>
                      <p className={clsx('text-xs leading-relaxed', isLight ? 'text-slate-500' : 'text-slate-400')}>
                        ABN required (verified against the ABR). You raise tax invoices in your name and ABN; customers pay you directly.
                      </p>
                    </div>
                  </label>

                  {/* Overseas individual */}
                  <label
                    className={clsx(
                      'flex items-start gap-3 cursor-pointer rounded-xl border p-4 transition-all duration-150 group',
                      entityType === 'OVERSEAS_INDIVIDUAL'
                        ? 'border-amber-500 bg-amber-500/5'
                        : isLight
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600',
                    )}
                  >
                    <input
                      type="radio"
                      name="entity_type"
                      value="OVERSEAS_INDIVIDUAL"
                      checked={entityType === 'OVERSEAS_INDIVIDUAL'}
                      onChange={() => setEntityType('OVERSEAS_INDIVIDUAL')}
                      className="mt-1 accent-amber-500 shrink-0"
                    />
                    <div className="space-y-1">
                      <p className={clsx('text-sm font-semibold', isLight ? 'text-slate-800' : 'text-slate-100')}>
                        Overseas individual contractor
                      </p>
                      <p className={clsx('text-xs leading-relaxed', isLight ? 'text-slate-500' : 'text-slate-400')}>
                        Operate from outside Australia. Use your own country&apos;s tax registration. You raise invoices and customers pay you directly via SWIFT, Wise, PayPal or any method you support.
                      </p>
                    </div>
                  </label>
                </div>

                {entityType === 'OVERSEAS_INDIVIDUAL' && (
                  <div className={clsx(
                    'rounded-xl border px-4 py-3 text-xs leading-relaxed space-y-1',
                    isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/30 bg-amber-500/10 text-amber-300',
                  )}>
                    <p className="font-semibold">What happens next</p>
                    <ul className="list-disc list-inside space-y-0.5 opacity-90">
                      <li>You&apos;ll provide your country of tax residency and local business registration during onboarding</li>
                      <li>Customers pay you directly via your preferred rail (SWIFT, Wise, PayPal, etc.)</li>
                      <li>Tax handling stays in your jurisdiction — the platform does not withhold tax or process payments</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 accent-teal-500"
              />
              <span className={agreeTextCls}>
                I agree to the{' '}
                <Link href="/terms" className={linkCls}>
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link href="/privacy" className={linkCls}>
                  Privacy Policy
                </Link>
              </span>
            </label>

            <Button type="submit" fullWidth loading={loading}>
              Create account
            </Button>
          </form>

          <p className={clsx('text-center text-sm', mutedCls)}>
            Already have an account?{' '}
            <Link href="/login" className={linkCls}>
              Sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  // ── Company form ──────────────────────────────────────────────────────────

  if (companyDone) {
    return (
      <AuthShell
        leftHeadline="Account created."
        leftSubtext="Verify your email, then complete your company profile."
      >
        <div className="space-y-6 py-2">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-amber-500" />
            </div>
          </div>
          <div className="text-center">
            <h1 className={headingCls}>Check your email</h1>
            <p className={clsx('mt-2 text-sm', isLight ? 'text-slate-500' : 'text-slate-400')}>
              We&apos;ve sent a verification link to{' '}
              <span className={clsx('font-medium', isLight ? 'text-slate-700' : 'text-slate-200')}>{companyRegisteredEmail}</span>.
              Once verified, log in to complete your company profile and submit for review.
            </p>
          </div>
          <div className={clsx('rounded-xl border divide-y text-sm', isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/40', separatorCls)}>
            {[
              { label: '1. Verify email', desc: 'Click the link we just sent' },
              { label: '2. Complete profile', desc: 'Add domains, address, authority doc' },
              { label: '3. Submit for review', desc: 'Our team approves within 2 business days' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <div className="h-2 w-2 rounded-full bg-amber-500/60 shrink-0" />
                <div>
                  <p className={clsx('font-medium', isLight ? 'text-slate-700' : 'text-slate-200')}>{label}</p>
                  <p className={clsx('text-xs', mutedCls)}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" fullWidth onClick={() => router.push('/login')}>
            Go to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      leftHeadline="Register your company."
      leftSubtext="Create your account in seconds. Complete your profile after login."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className={headingCls}>Company account</h1>
            <p className={clsx('mt-1 text-xs', mutedCls)}>Consulting company</p>
          </div>
          <button
            onClick={() => { setPath(null); setError(''); }}
            className={clsx('text-xs transition-colors flex items-center gap-1', isLight ? 'text-slate-400 hover:text-slate-600' : 'text-slate-500 hover:text-slate-300')}
          >
            <ChevronLeft size={12} /> Change
          </button>
        </div>

        {error && <ErrorBanner msg={error} />}

        <form onSubmit={(e) => { void handleCompanySubmit(e); }} className="space-y-4">
          <Input
            label="Your full name"
            type="text"
            autoComplete="name"
            placeholder="Alex Smith"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            required
          />
          <Input
            label="Work email"
            type="email"
            autoComplete="email"
            placeholder="alex@yourcompany.com"
            value={repEmail}
            onChange={(e) => setRepEmail(e.target.value)}
            required
          />
          <Input
            label="Job title"
            type="text"
            placeholder="Managing Director"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
          />
          <PasswordField label="Password" value={repPassword} onChange={setRepPassword} showStrength />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter password"
            value={repConfirm}
            onChange={(e) => setRepConfirm(e.target.value)}
            required
            error={repConfirm && repConfirm !== repPassword ? 'Passwords do not match' : undefined}
          />

          <div className="border-t pt-4 space-y-4" style={{ borderColor: isLight ? '#e2e8f0' : '#334155' }}>
            <Input
              label="Company name"
              type="text"
              placeholder="Acme IT Consulting Pty Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />

            <div className="space-y-1.5">
              <label className={labelCls}>Country</label>
              <select
                value={companyCountry}
                onChange={(e) => { setCompanyCountry(e.target.value); setAbn(''); }}
                className={inputCls}
              >
                {ALL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </div>

            {companyCountry === 'AU' && (
              <div className="space-y-1.5">
                <label className={labelCls}>
                  ABN{' '}
                  <span className={clsx('font-normal', isLight ? 'text-slate-400' : 'text-slate-500')}>(optional)</span>
                  {abnDirty && (
                    <span className={clsx('ml-2', abnValid ? 'text-teal-500' : 'text-red-500')}>
                      {abnValid ? '✓ Valid' : '✗ Invalid'}
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="12 345 678 901"
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  className={clsx(
                    inputCls,
                    abnDirty && !abnValid ? '!border-red-500/60 focus:!border-red-500 focus:!ring-red-500/20' : '',
                  )}
                />
                <p className={clsx('text-[11px]', isLight ? 'text-slate-400' : 'text-slate-600')}>
                  You can add or verify your ABN later in your company profile.
                </p>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={companyAgreed}
              onChange={(e) => setCompanyAgreed(e.target.checked)}
              className="mt-0.5 accent-amber-500"
            />
            <span className={agreeTextCls}>
              I agree to the{' '}
              <Link href="/terms" className={linkCls}>Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className={linkCls}>Privacy Policy</Link>
            </span>
          </label>

          <Button type="submit" fullWidth loading={loading}>
            Create company account
          </Button>
        </form>

        <p className={clsx('text-center text-sm', mutedCls)}>
          Already have an account?{' '}
          <Link href="/login" className={linkCls}>
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterPageContent />
    </Suspense>
  );
}
