'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Lock,
  Shield,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Smartphone,
  KeyRound,
} from 'lucide-react';
import { clsx } from 'clsx';
import customerApi from '@/lib/customer-api';
import { Button } from '@/components/ui/Button';
import { clearToken } from '@/lib/customer-auth';
import { useRouter } from 'next/navigation';
import { PageContainer } from '@/components/layout/PageContainer';

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Lock;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-teal-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── PasswordField ────────────────────────────────────────────────────────────

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 pr-10 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── ChangePasswordSection ────────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const passwordOk =
    next.length >= 12 &&
    /[A-Z]/.test(next) &&
    /[0-9]/.test(next) &&
    /[^A-Za-z0-9]/.test(next);
  const match = next === confirm && confirm.length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      customerApi.patch('/api/v1/auth/change-password', {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      toast.success('Password updated. You will need to log in again on other devices.');
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to update password.';
      toast.error(msg);
    },
  });

  return (
    <Section icon={Lock} title="Change Password" description="Update your account password">
      <div className="max-w-md space-y-4">
        <PasswordField label="Current Password" value={current} onChange={setCurrent} />
        <PasswordField
          label="New Password"
          value={next}
          onChange={setNext}
          placeholder="Min 12 chars, 1 uppercase, 1 number, 1 special"
        />

        {/* Strength hints */}
        {next.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {[
              { ok: next.length >= 12,           label: '12+ characters' },
              { ok: /[A-Z]/.test(next),           label: 'Uppercase letter' },
              { ok: /[0-9]/.test(next),           label: 'Number' },
              { ok: /[^A-Za-z0-9]/.test(next),    label: 'Special character' },
            ].map(({ ok, label }) => (
              <span key={label} className={clsx('flex items-center gap-1', ok ? 'text-teal-400' : 'text-slate-500')}>
                <CheckCircle2 size={10} className={ok ? 'opacity-100' : 'opacity-30'} /> {label}
              </span>
            ))}
          </div>
        )}

        <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm} />
        {confirm.length > 0 && !match && (
          <p className="text-xs text-red-400">Passwords do not match.</p>
        )}

        <Button
          className="w-full"
          loading={mutation.isPending}
          disabled={!current || !passwordOk || !match}
          onClick={() => mutation.mutate()}
        >
          <KeyRound size={14} className="mr-1.5" />
          Update Password
        </Button>
      </div>
    </Section>
  );
}

// ─── MfaSection ───────────────────────────────────────────────────────────────

function MfaSection() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const { data: me, refetch } = useQuery({
    queryKey: ['auth-me-settings'],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: { mfa_enabled: boolean; email: string } }>('/api/v1/auth/me')
        .then((r) => r.data.data),
  });

  const setupMutation = useMutation({
    mutationFn: () =>
      customerApi
        .post<{ success: boolean; data: { qr_code_url: string; backup_codes: string[] } }>(
          '/api/v1/auth/mfa/setup',
        )
        .then((r) => r.data.data),
    onSuccess: (d) => { setQrCode(d.qr_code_url); setBackupCodes(d.backup_codes); },
    onError: () => toast.error('Failed to start MFA setup.'),
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      customerApi.post('/api/v1/auth/mfa/verify', { totp_code: totpCode }),
    onSuccess: () => {
      toast.success('Authenticator app linked. MFA is now active.');
      setQrCode(null); setBackupCodes([]); setTotpCode('');
      void refetch();
    },
    onError: () => toast.error('Invalid code. Try again.'),
  });

  const disableMutation = useMutation({
    mutationFn: () =>
      customerApi.post('/api/v1/auth/mfa/disable', { totp_code: disableCode }),
    onSuccess: () => {
      toast.success('MFA disabled.');
      setShowDisable(false); setDisableCode('');
      void refetch();
    },
    onError: () => toast.error('Invalid code.'),
  });

  const mfaEnabled = me?.mfa_enabled ?? false;

  return (
    <Section
      icon={Smartphone}
      title="Two-Factor Authentication"
      description="Add an extra layer of security with an authenticator app"
    >
      {mfaEnabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-teal-400 p-3 bg-teal-500/5 border border-teal-500/20 rounded-lg">
            <Shield size={14} className="shrink-0" />
            MFA is active on your account.
          </div>
          {!showDisable ? (
            <Button
              variant="secondary"
              onClick={() => setShowDisable(true)}
              className="text-red-400 border-red-500/20 hover:border-red-500/40"
            >
              Disable MFA
            </Button>
          ) : (
            <div className="space-y-3 max-w-xs">
              <p className="text-sm text-slate-400">Enter your 6-digit authenticator code to confirm.</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm text-center tracking-widest font-mono placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setShowDisable(false)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 !bg-red-500/20 !text-red-400 hover:!bg-red-500/30 border border-red-500/20"
                  loading={disableMutation.isPending}
                  disabled={disableCode.length !== 6}
                  onClick={() => disableMutation.mutate()}
                >
                  Disable
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {!qrCode ? (
            <>
              <p className="text-sm text-slate-400">
                Use an authenticator app (Google Authenticator, Authy) to generate one-time codes at login.
              </p>
              <Button loading={setupMutation.isPending} onClick={() => setupMutation.mutate()}>
                <Shield size={14} className="mr-1.5" />
                Set Up Authenticator App
              </Button>
            </>
          ) : (
            <div className="space-y-4 max-w-sm">
              <p className="text-sm text-slate-400">
                Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
              </p>
              <img src={qrCode} alt="MFA QR Code" className="w-40 h-40 rounded-lg border border-slate-700" />

              {backupCodes.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-300 mb-2">
                    Save these backup codes — shown once only
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {backupCodes.map((c) => (
                      <code key={c} className="text-xs font-mono text-slate-300 bg-slate-900 px-2 py-1 rounded">
                        {c}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-200 text-sm text-center tracking-widest font-mono placeholder:text-slate-600 focus:border-teal-500 focus:outline-none"
                />
              </div>
              <Button
                className="w-full"
                loading={verifyMutation.isPending}
                disabled={totpCode.length !== 6}
                onClick={() => verifyMutation.mutate()}
              >
                <CheckCircle2 size={14} className="mr-1.5" />
                Confirm &amp; Enable MFA
              </Button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── NotificationsSection ─────────────────────────────────────────────────────

function NotificationsSection() {
  const [emailNotifs, setEmailNotifs] = useState(true);

  return (
    <Section icon={Bell} title="Notifications" description="Control what emails you receive">
      <div className="space-y-3 max-w-md">
        {[
          { key: 'orders',    label: 'New order bookings',         checked: true, locked: true  },
          { key: 'invoices',  label: 'Invoice & payment updates',  checked: true, locked: true  },
          { key: 'payouts',   label: 'Payout processed',           checked: true, locked: true  },
          { key: 'marketing', label: 'Product updates & news',     checked: emailNotifs, locked: false },
        ].map(({ key, label, checked, locked }) => (
          <label
            key={key}
            className={clsx(
              'flex items-center justify-between p-3 rounded-lg border transition-colors',
              locked
                ? 'border-slate-800 bg-slate-800/50 cursor-default'
                : 'border-slate-700 bg-slate-800 cursor-pointer hover:border-slate-600',
            )}
          >
            <span className="text-sm text-slate-300">{label}</span>
            <div className="flex items-center gap-2">
              {locked && <span className="text-[10px] text-slate-600">Required</span>}
              <div
                className={clsx(
                  'w-9 h-5 rounded-full transition-colors relative',
                  (locked ? checked : emailNotifs) ? 'bg-teal-500' : 'bg-slate-700',
                  locked && 'opacity-60',
                )}
                onClick={() => { if (!locked) setEmailNotifs((v) => !v); }}
              >
                <div className={clsx(
                  'w-3.5 h-3.5 rounded-full bg-white absolute top-0.75 transition-transform',
                  (locked ? checked : emailNotifs) ? 'translate-x-4' : 'translate-x-0.5',
                )} style={{ top: '3px', left: (locked ? checked : emailNotifs) ? '17px' : '3px' }} />
              </div>
            </div>
          </label>
        ))}
        <p className="text-xs text-slate-600">
          Transactional emails (orders, invoices, payouts) are always sent and cannot be disabled.
        </p>
      </div>
    </Section>
  );
}

// ─── DangerZoneSection ────────────────────────────────────────────────────────

function DangerZoneSection() {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');

  async function handleLogoutAll() {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('onys_refresh_token') : null;
      if (raw) await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
    } finally {
      clearToken();
      router.push('/login');
    }
  }

  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-red-500/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <AlertTriangle size={15} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-300">Danger Zone</p>
          <p className="text-xs text-red-400/60">These actions are irreversible</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-center justify-between py-3 border-b border-red-500/10">
          <div>
            <p className="text-sm font-medium text-slate-300">Log out all devices</p>
            <p className="text-xs text-slate-500 mt-0.5">Revokes all active sessions immediately.</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="text-red-400 border-red-500/20 hover:border-red-500/40 shrink-0 ml-4"
            onClick={() => { void handleLogoutAll(); }}
          >
            Log Out All
          </Button>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-300 mb-1">Delete account</p>
          <p className="text-xs text-slate-500 mb-3">
            Permanently deletes your user account. Active orders and company memberships must be
            resolved first. Contact <span className="text-teal-400">support@onys.online</span> to
            proceed.
          </p>
          <div className="space-y-2">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "DELETE" to enable'
              className="w-full max-w-xs px-3 py-2 bg-slate-900 border border-red-500/20 rounded-lg text-slate-200 text-sm placeholder:text-slate-600 focus:border-red-500/50 focus:outline-none"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={confirmText !== 'DELETE'}
              className="text-red-400 border-red-500/20 hover:border-red-500/40 disabled:opacity-30"
              onClick={() => toast.error('Please contact support@onys.online to delete your account.')}
            >
              Request Account Deletion
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanySettingsPage() {
  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100">Account Settings</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your password, two-factor authentication, and account preferences.
        </p>
      </div>

      {/* Two-column layout on lg+ — Security on the left (Password + MFA),
          Account on the right (Notifications + Danger Zone). Stacks back to
          a single column below 1024 px so phones/tablets get the same flow
          as before. items-start prevents the right column from stretching
          to match the height of the (taller) left column when MFA is in
          its multi-step setup state. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <ChangePasswordSection />
          <MfaSection />
        </div>
        <div className="space-y-6">
          <NotificationsSection />
          <DangerZoneSection />
        </div>
      </div>
    </PageContainer>
  );
}
