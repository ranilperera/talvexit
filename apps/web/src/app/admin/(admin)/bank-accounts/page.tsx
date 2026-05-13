'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Globe, Smartphone, ToggleLeft, ToggleRight, Save, Info } from 'lucide-react';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuBankConfig {
  bsb: string;
  account_number: string;
  account_name: string;
  bank_name: string;
  enabled: boolean;
}

interface SwiftConfig {
  swift_code: string;
  iban: string;
  account_name: string;
  bank_name: string;
  bank_address: string;
  currency: string;
  enabled: boolean;
}

interface PayIdConfig {
  email: string;
  name: string;
  enabled: boolean;
}

interface ConfigRow {
  key: string;
  value: unknown;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_AU: AuBankConfig = { bsb: '', account_number: '', account_name: '', bank_name: '', enabled: true };
const DEFAULT_SWIFT: SwiftConfig = { swift_code: '', iban: '', account_name: '', bank_name: '', bank_address: '', currency: 'AUD', enabled: false };
const DEFAULT_PAYID: PayIdConfig = { email: '', name: '', enabled: false };

// ─── Field component ──────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, mono = false }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm
          text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50
          ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, enabled, onToggle, children, hint }: {
  title: string;
  icon: React.ElementType;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${enabled ? 'border-teal-500/30' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between px-5 py-4 bg-slate-900">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${enabled ? 'bg-teal-500/20' : 'bg-slate-800'}`}>
            <Icon size={16} className={enabled ? 'text-teal-400' : 'text-slate-500'} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{title}</p>
            {hint && <p className="text-xs text-slate-500 mt-0.5">{hint}</p>}
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className="flex items-center gap-2 text-xs font-medium transition-colors"
        >
          {enabled
            ? <><ToggleRight size={20} className="text-teal-400" /><span className="text-teal-400">Enabled</span></>
            : <><ToggleLeft size={20} className="text-slate-600" /><span className="text-slate-500">Disabled</span></>
          }
        </button>
      </div>
      {enabled && (
        <div className="px-5 py-4 bg-slate-900 border-t border-slate-800 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BankAccountsPage() {
  const qc = useQueryClient();

  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [au, setAu] = useState<AuBankConfig>(DEFAULT_AU);
  const [swift, setSwift] = useState<SwiftConfig>(DEFAULT_SWIFT);
  const [payid, setPayid] = useState<PayIdConfig>(DEFAULT_PAYID);

  const { isLoading } = useQuery({
    queryKey: ['admin-bank-config'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: { configs: ConfigRow[] } }>('/api/v1/admin/config');
      const configs = res.data.data.configs;
      const map: Record<string, unknown> = {};
      for (const c of configs) { map[c.key] = c.value; }

      setGlobalEnabled(map['bank_transfer_enabled'] === true);
      if (map['platform_bank_au']) setAu(map['platform_bank_au'] as AuBankConfig);
      if (map['platform_bank_swift']) setSwift(map['platform_bank_swift'] as SwiftConfig);
      if (map['platform_payid']) setPayid(map['platform_payid'] as PayIdConfig);
      return map;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.patch('/api/v1/admin/config/bank_transfer_enabled', {
          value: globalEnabled,
          description: 'Allow customers to pay via bank transfer',
        }),
        api.patch('/api/v1/admin/config/platform_bank_au', {
          value: au,
          description: 'Platform AU BSB/account for customer bank transfers',
        }),
        api.patch('/api/v1/admin/config/platform_bank_swift', {
          value: swift,
          description: 'Platform SWIFT/IBAN for international transfers',
        }),
        api.patch('/api/v1/admin/config/platform_payid', {
          value: payid,
          description: 'Platform PayID for customer bank transfers',
        }),
      ]);
    },
    onSuccess: () => {
      toast.success('Bank account settings saved.');
      void qc.invalidateQueries({ queryKey: ['admin-bank-config'] });
    },
    onError: () => toast.error('Save failed. Please try again.'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-100">Platform Bank Accounts</h1>
          <p className="text-sm text-slate-500 mt-1">
            Configure payment details shown to customers when they choose bank transfer.
          </p>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50
            text-slate-950 text-sm font-semibold rounded-xl transition-colors shrink-0"
        >
          <Save size={14} />
          {saveMutation.isPending ? 'Saving…' : 'Save All'}
        </button>
      </div>

      {/* Master toggle */}
      <div className={`flex items-center justify-between px-5 py-4 border rounded-2xl transition-colors ${
        globalEnabled ? 'border-teal-500/40 bg-teal-500/5' : 'border-slate-800 bg-slate-900'
      }`}>
        <div>
          <p className="text-sm font-semibold text-slate-200">Enable Bank Transfer Payments</p>
          <p className="text-xs text-slate-500 mt-0.5">
            When enabled, customers see "Pay by Bank Transfer" as an option on the invoice payment page.
          </p>
        </div>
        <button onClick={() => setGlobalEnabled((v) => !v)}>
          {globalEnabled
            ? <ToggleRight size={28} className="text-teal-400" />
            : <ToggleLeft size={28} className="text-slate-600" />
          }
        </button>
      </div>

      {globalEnabled && (
        <>
          {/* Info note */}
          <div className="flex gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Enable at least one payment method below. Customers will only see methods that are individually enabled.
              Waveful Digital Platforms is authorised to collect payments on behalf of the service provider — these are platform receiving accounts.
            </p>
          </div>

          {/* Method cards in 2-col grid */}
          <div className="grid lg:grid-cols-2 gap-6 items-start">

            {/* AU BSB */}
            <SectionCard
              title="AU Bank Transfer (BSB / Account)"
              icon={Building2}
              enabled={au.enabled}
              onToggle={(v) => setAu((s) => ({ ...s, enabled: v }))}
              hint="For domestic Australian customers"
            >
              <div className="grid grid-cols-2 gap-4">
                <Field label="BSB" value={au.bsb} onChange={(v) => setAu((s) => ({ ...s, bsb: v }))} placeholder="123-456" mono />
                <Field label="Account Number" value={au.account_number} onChange={(v) => setAu((s) => ({ ...s, account_number: v }))} placeholder="12345678" mono />
              </div>
              <Field label="Account Name" value={au.account_name} onChange={(v) => setAu((s) => ({ ...s, account_name: v }))} placeholder="Waveful Digital Platforms" />
              <Field label="Bank Name" value={au.bank_name} onChange={(v) => setAu((s) => ({ ...s, bank_name: v }))} placeholder="Commonwealth Bank of Australia" />
            </SectionCard>

            {/* PayID */}
            <SectionCard
              title="PayID"
              icon={Smartphone}
              enabled={payid.enabled}
              onToggle={(v) => setPayid((s) => ({ ...s, enabled: v }))}
              hint="Instant transfers via PayID email"
            >
              <Field label="PayID Email" value={payid.email} onChange={(v) => setPayid((s) => ({ ...s, email: v }))} placeholder="payments@onsys.com.au" mono />
              <Field label="Account Name (shown to customer)" value={payid.name} onChange={(v) => setPayid((s) => ({ ...s, name: v }))} placeholder="Waveful Digital Platforms" />
            </SectionCard>

            {/* SWIFT — wider, span 2 cols on lg since it has more fields */}
            <div className="lg:col-span-2">
              <SectionCard
                title="SWIFT / International Wire"
                icon={Globe}
                enabled={swift.enabled}
                onToggle={(v) => setSwift((s) => ({ ...s, enabled: v }))}
                hint="For overseas customers and cross-border payments"
              >
                <div className="grid grid-cols-2 gap-4">
                  <Field label="SWIFT / BIC Code" value={swift.swift_code} onChange={(v) => setSwift((s) => ({ ...s, swift_code: v }))} placeholder="CTBAAU2S" mono />
                  <Field label="Currency" value={swift.currency} onChange={(v) => setSwift((s) => ({ ...s, currency: v }))} placeholder="AUD" />
                </div>
                <Field label="IBAN / Account Number" value={swift.iban} onChange={(v) => setSwift((s) => ({ ...s, iban: v }))} placeholder="AU00 0000 0000 0000 0000 00" mono />
                <Field label="Account Name" value={swift.account_name} onChange={(v) => setSwift((s) => ({ ...s, account_name: v }))} placeholder="Waveful Digital Platforms" />
                <Field label="Bank Name" value={swift.bank_name} onChange={(v) => setSwift((s) => ({ ...s, bank_name: v }))} placeholder="Commonwealth Bank of Australia" />
                <Field label="Bank Address" value={swift.bank_address} onChange={(v) => setSwift((s) => ({ ...s, bank_address: v }))} placeholder="48 Martin Place, Sydney NSW 2000" />
              </SectionCard>
            </div>

          </div>
        </>
      )}
    </div>
  );
}
