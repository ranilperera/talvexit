'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, User, Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getUser } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
          <Icon size={14} className="text-teal-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (next.length < 12) {
      setError('New password must be at least 12 characters.');
      return;
    }
    if (next !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await customerApi.patch('/api/v1/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      toast.success('Password updated. You will need to log in again on other devices.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      const msg = e.response?.data?.error?.message ?? 'Failed to update password.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section icon={KeyRound} title="Password" description="Change your login password">
      <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4 max-w-sm">
        <Input
          label="Current password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          disabled={saving}
        />
        <Input
          label="New password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          disabled={saving}
        />
        <Input
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          disabled={saving}
        />
        <p className="text-xs text-slate-500">
          Minimum 12 characters. Changing your password will sign you out on other devices.
        </p>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <Button type="submit" loading={saving} disabled={!current || !next || !confirm}>
          Update Password
        </Button>
      </form>
    </Section>
  );
}

// ─── Account Info ─────────────────────────────────────────────────────────────

function AccountInfoSection() {
  const user = getUser();

  return (
    <Section icon={User} title="Account" description="Your account details">
      <div className="space-y-3 max-w-sm">
        <div className="flex items-center justify-between py-2 border-b border-slate-800">
          <span className="text-xs text-slate-500">Full name</span>
          <span className="text-sm text-slate-200">{user?.full_name ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-800">
          <span className="text-xs text-slate-500">Email</span>
          <span className="text-sm text-slate-200">{user?.email ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-slate-800">
          <span className="text-xs text-slate-500">Account type</span>
          <span className="text-sm text-slate-200">Individual Contractor</span>
        </div>
        <p className="text-xs text-slate-600 pt-1">
          To change your name or email, please contact support.
        </p>
      </div>
    </Section>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationsSection() {
  return (
    <Section icon={Bell} title="Notifications" description="Email notification preferences">
      <div className="space-y-3">
        {[
          { label: 'New order received',          desc: 'When a customer places an order on your task' },
          { label: 'Order status updates',        desc: 'Milestones approved, disputes opened, etc.' },
          { label: 'Payout processed',            desc: 'When a payout is initiated to your Stripe account' },
          { label: 'Insurance expiry reminder',   desc: '30 days before your certificate expires' },
          { label: 'KYC session scheduled',       desc: 'When an admin schedules your KYC video call' },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-start justify-between gap-4 py-3 border-b border-slate-800 last:border-0">
            <div>
              <p className="text-sm text-slate-200">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
            </div>
            <div className="shrink-0 mt-0.5">
              <span className="text-xs text-slate-600 italic">Always on</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-slate-600 pt-1">
          Notification preferences will be configurable in a future update.
        </p>
      </div>
    </Section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your account security and preferences.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6">
          <AccountInfoSection />
          <NotificationsSection />
        </div>
        <div className="space-y-6">
          <ChangePasswordSection />
        </div>
      </div>
    </div>
  );
}
