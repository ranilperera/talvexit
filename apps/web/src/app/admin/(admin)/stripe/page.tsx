'use client';

import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { RefreshCw, Link as LinkIcon, Settings2, CheckCircle, XCircle, Clock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  ENABLED:    { label: 'Enabled',     color: 'green' },
  RESTRICTED: { label: 'Restricted',  color: 'amber' },
  PENDING:    { label: 'Pending',     color: 'amber' },
  DISABLED:   { label: 'Disabled',    color: 'red'   },
};

interface ConnectAccount {
  id: string;
  stripe_account_id: string;
  status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  requirements_due: string[];
  onboarding_url: string | null;
  country: string;
  created_at: string;
  contractor_profile: {
    id: string;
    user: { id: string; email: string; full_name: string };
  } | null;
}

const OVERRIDE_STATUSES = ['PENDING', 'RESTRICTED', 'ENABLED', 'DISABLED'];

interface LinkForm {
  contractor_profile_id: string;
  stripe_account_id: string;
  status: string;
}

export default function AdminStripePage() {
  const [accounts, setAccounts] = useState<ConnectAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkForm, setLinkForm] = useState<LinkForm>({ contractor_profile_id: '', stripe_account_id: '', status: 'ENABLED' });
  const [linkSaving, setLinkSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await api.get<{ success: boolean; data: { accounts: ConnectAccount[] } }>(
        '/api/v1/admin/stripe/accounts',
      );
      setAccounts(res.data.data.accounts);
    } catch {
      toast.error('Failed to load Stripe accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAccounts(); }, [fetchAccounts]);

  async function handleRefresh(id: string) {
    setRefreshing(id);
    try {
      await api.post(`/api/v1/admin/stripe/accounts/${id}/refresh`);
      toast.success('Account status refreshed from Stripe');
      void fetchAccounts();
    } catch {
      toast.error('Failed to refresh account');
    } finally {
      setRefreshing(null);
    }
  }

  async function handleOnboardingLink(id: string) {
    setLinking(id);
    try {
      const res = await api.post<{ success: boolean; data: { onboarding_url: string } }>(
        `/api/v1/admin/stripe/accounts/${id}/onboarding-link`,
      );
      const url = res.data.data.onboarding_url;
      await navigator.clipboard.writeText(url);
      toast.success('Onboarding link copied to clipboard');
    } catch {
      toast.error('Failed to generate onboarding link');
    } finally {
      setLinking(null);
    }
  }

  async function handleOverride(id: string, status: string) {
    setOverriding(id);
    try {
      await api.patch(`/api/v1/admin/stripe/accounts/${id}/status`, { status });
      toast.success(`Status overridden to ${status}`);
      void fetchAccounts();
    } catch {
      toast.error('Failed to override status');
    } finally {
      setOverriding(null);
    }
  }

  async function handleLinkAccount(e: React.FormEvent) {
    e.preventDefault();
    setLinkSaving(true);
    try {
      await api.post('/api/v1/admin/stripe/accounts/link', linkForm);
      toast.success('Stripe account linked successfully');
      setShowLinkModal(false);
      setLinkForm({ contractor_profile_id: '', stripe_account_id: '', status: 'ENABLED' });
      void fetchAccounts();
    } catch {
      toast.error('Failed to link account');
    } finally {
      setLinkSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Stripe Connect Accounts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage contractor Stripe Connect accounts — refresh status, generate onboarding links, or override status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { void fetchAccounts(); }} loading={loading}>
            <RefreshCw size={14} className="mr-1.5" />
            Refresh
          </Button>
          <Button onClick={() => setShowLinkModal(true)}>
            <Plus size={14} className="mr-1.5" />
            Link Account
          </Button>
        </div>
      </div>

      {/* Link Account Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-semibold text-slate-100">Link Stripe Account</h2>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-100">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Manually link a Stripe Express account to a contractor. Use this to bypass the onboarding flow in test environments.
            </p>
            <form onSubmit={(e) => { void handleLinkAccount(e); }} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Contractor Profile ID</label>
                <input
                  value={linkForm.contractor_profile_id}
                  onChange={(e) => setLinkForm((f) => ({ ...f, contractor_profile_id: e.target.value }))}
                  required
                  placeholder="cuid from ContractorProfile table"
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Stripe Account ID</label>
                <input
                  value={linkForm.stripe_account_id}
                  onChange={(e) => setLinkForm((f) => ({ ...f, stripe_account_id: e.target.value }))}
                  required
                  placeholder="acct_..."
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Initial Status</label>
                <select
                  value={linkForm.status}
                  onChange={(e) => setLinkForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                >
                  {OVERRIDE_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_CFG[s].label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowLinkModal(false)} className="flex-1">Cancel</Button>
                <Button type="submit" loading={linkSaving} className="flex-1">Link Account</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['ENABLED', 'RESTRICTED', 'PENDING', 'DISABLED'] as const).map((s) => {
          const count = accounts.filter((a) => a.status === s).length;
          const cfg = STATUS_CFG[s];
          return (
            <div key={s} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-500 mb-1">{cfg.label}</p>
              <p className="font-display font-bold text-2xl text-slate-100">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="space-y-px">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-900 animate-pulse border-b border-slate-800" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-3">
            <p className="text-slate-400">No Stripe Connect accounts found.</p>
            <p className="text-xs text-slate-500">Contractors connect their accounts via the contractor portal, or you can link one manually.</p>
            <button
              onClick={() => setShowLinkModal(true)}
              className="inline-flex items-center gap-1.5 text-xs text-teal-400 hover:text-teal-300 mt-2"
            >
              <Plus size={12} /> Link account manually
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Contractor</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Stripe Account</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Capabilities</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">Created</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const cfg = STATUS_CFG[account.status] ?? { label: account.status, color: 'slate' as Color };
                const user = account.contractor_profile?.user;
                return (
                  <tr key={account.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-5 py-4">
                      {user ? (
                        <div>
                          <p className="text-slate-100 font-medium">{user.full_name}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500 text-xs">Company account</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs text-slate-400">{account.stripe_account_id}</span>
                    </td>
                    <td className="px-5 py-4">
                      <Badge color={cfg.color}>{cfg.label}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-3 text-xs">
                        <span className={`flex items-center gap-1 ${account.charges_enabled ? 'text-teal-400' : 'text-slate-600'}`}>
                          {account.charges_enabled ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          Charges
                        </span>
                        <span className={`flex items-center gap-1 ${account.payouts_enabled ? 'text-teal-400' : 'text-slate-600'}`}>
                          {account.payouts_enabled ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          Payouts
                        </span>
                      </div>
                      {account.requirements_due.length > 0 && (
                        <p className="text-xs text-amber-400 mt-1">
                          {account.requirements_due.length} requirement{account.requirements_due.length !== 1 ? 's' : ''} due
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        {format(new Date(account.created_at), 'd MMM yyyy')}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Refresh from Stripe */}
                        <button
                          onClick={() => { void handleRefresh(account.id); }}
                          disabled={refreshing === account.id}
                          title="Refresh status from Stripe"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                          <RefreshCw size={13} className={refreshing === account.id ? 'animate-spin' : ''} />
                        </button>

                        {/* Generate onboarding link */}
                        <button
                          onClick={() => { void handleOnboardingLink(account.id); }}
                          disabled={linking === account.id}
                          title="Generate & copy onboarding link"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                        >
                          <LinkIcon size={13} />
                        </button>

                        {/* Override status */}
                        <OverrideDropdown
                          currentStatus={account.status}
                          loading={overriding === account.id}
                          onOverride={(s) => { void handleOverride(account.id, s); }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OverrideDropdown({
  currentStatus,
  loading,
  onOverride,
}: {
  currentStatus: string;
  loading: boolean;
  onOverride: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        title="Override status"
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        <Settings2 size={13} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 min-w-[140px]">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Override Status
            </p>
            {OVERRIDE_STATUSES.filter((s) => s !== currentStatus).map((s) => {
              const cfg = STATUS_CFG[s];
              return (
                <button
                  key={s}
                  onClick={() => { setOpen(false); onOverride(s); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
                >
                  → {cfg.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
