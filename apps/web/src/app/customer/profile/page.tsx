'use client';

import { useEffect, useState, forwardRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import {
  User,
  Lock,
  Shield,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Palette,
  Pencil,
  X,
  Check,
  Loader2,
  FileText,
  Download,
  Trash2,
  ShieldCheck,
  ClipboardList,
} from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { clearToken, getToken } from '@/lib/customer-auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import BillingDetails from '@/components/customer/BillingDetails';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Me {
  id: string;
  full_name: string;
  email: string;
  account_type: string;
  email_verified: boolean;
  mfa_enabled: boolean;
  last_login_at?: string | null;
  created_at: string;
  // Legacy billing
  legal_name?: string | null;
  abn?: string | null;
  tax_residency_country?: string | null;
  customer_terms_signed?: boolean;
  // Extended billing contact
  legal_entity_name?: string | null;
  trading_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  website?: string | null;
  // Billing address
  billing_address_1?: string | null;
  billing_address_2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postcode?: string | null;
  billing_country?: string | null;
  // Tax
  entity_type?: string | null;
  abn_verified?: boolean;
  abn_verified_name?: string | null;
  acn?: string | null;
  gst_registered?: boolean;
  vat_number?: string | null;
  is_foreign_entity?: boolean;
  // Compliance
  compliance_documents?: {
    id: string;
    type: string;
    file_name: string;
    file_size: number | null;
    mime_type: string | null;
    blob_path: string;
    uploaded_at: string;
    verified: boolean;
    verified_at: string | null;
  }[];
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(120).trim(),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(12, 'Must be at least 12 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

// ─── Read-only section (no edit controls) ─────────────────────────────────────

function Section({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
          <Icon size={15} className="text-teal-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ─── Editable section (read view → edit view toggle) ──────────────────────────

function EditableSection({
  title,
  description,
  icon: Icon,
  children,
  onSave,
  savePending,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  children: (editing: boolean) => React.ReactNode;
  onSave?: () => Promise<void> | void;
  savePending?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  async function handleSave() {
    try {
      await onSave?.();
      setEditing(false);
    } catch {
      // onError in mutation handles toast — stay in edit mode
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
              >
                <X size={12} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={savePending}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {savePending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {savePending ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-teal-500/50 transition-colors"
            >
              <Pencil size={12} />
              Edit
            </button>
          )}
        </div>
      </div>
      <div className="px-6 py-5">{children(editing)}</div>
    </div>
  );
}

// ─── Read-only field ──────────────────────────────────────────────────────────

function ReadField({ label, value, placeholder = 'Not set' }: { label: string; value?: string | null | undefined; placeholder?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={value ? 'text-sm text-slate-200' : 'text-sm text-slate-600 italic'}>{value ?? placeholder}</p>
    </div>
  );
}

// ─── PasswordInput ────────────────────────────────────────────────────────────

const PasswordInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | undefined }
>(function PasswordInput({ label, error, ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400 tracking-wide">{label}</label>
      <div className="relative">
        <input
          ref={ref}
          type={show ? 'text' : 'password'}
          className={clsx(
            'w-full rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-100 placeholder-slate-600',
            'bg-slate-800 border transition-all duration-150 outline-none',
            error
              ? 'border-red-500 focus:border-red-400 focus:ring-2 focus:ring-red-500/20'
              : 'border-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20',
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          tabIndex={-1}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
});

// ─── Compliance Documents section ────────────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  BUSINESS_REGISTRATION: 'Business Registration Certificate',
  BOARD_RESOLUTION: 'Board Resolution',
  TAX_CERTIFICATE: 'Tax Registration Certificate',
  OTHER: 'Other Supporting Document',
};

interface ComplianceDoc {
  id: string;
  type: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_at: string;
  verified: boolean;
  verified_at: string | null;
  rejected?: boolean;
  rejection_notes?: string | null;
}

function ComplianceDocuments({ docs, onDelete }: { docs: ComplianceDoc[]; onDelete: (id: string) => void }) {
  async function openDoc(docId: string, download = false) {
    try {
      const token = getToken();
      const url = `/api/v1/auth/me/documents/${docId}/download${download ? '?dl=1' : ''}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { toast.error('Could not load document.'); return; }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (download) {
        const a = document.createElement('a');
        a.href = objUrl;
        const doc = docs.find((d) => d.id === docId);
        a.download = doc?.file_name ?? 'document';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
      } else {
        const tab = window.open(objUrl, '_blank');
        if (tab) setTimeout(() => URL.revokeObjectURL(objUrl), 30_000);
      }
    } catch { toast.error('Could not load document.'); }
  }

  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <ClipboardList size={28} className="text-slate-600" />
        <p className="text-sm text-slate-500">No compliance documents uploaded yet.</p>
        <p className="text-xs text-slate-600">Upload documents in the Billing &amp; Tax Details section above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => (
        <div
          key={doc.id}
          className="flex items-start gap-3 bg-slate-800/50 border border-slate-700 rounded-xl p-3.5"
        >
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
            <FileText size={14} className="text-slate-300" />
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-slate-200 truncate">{doc.file_name}</p>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {DOC_TYPE_LABELS[doc.type] ?? doc.type}
              {doc.file_size ? ` · ${Math.round(doc.file_size / 1024)} KB` : ''}
              {' · '}Uploaded {new Date(doc.uploaded_at).toLocaleDateString('en-AU')}
            </p>
            {/* Status */}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {doc.verified ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-400 font-medium">
                  <ShieldCheck size={10} /> Approved
                  {doc.verified_at && ` · ${new Date(doc.verified_at).toLocaleDateString('en-AU')}`}
                </span>
              ) : doc.rejected ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 font-medium">
                  ✗ Rejected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
                  Pending review
                </span>
              )}
            </div>
            {doc.rejected && doc.rejection_notes && (
              <p className="text-xs text-red-400 mt-1">Reason: {doc.rejection_notes}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => openDoc(doc.id)}
              title="View"
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-colors"
            >
              <Eye size={11} /> View
            </button>
            <button
              type="button"
              onClick={() => openDoc(doc.id, true)}
              title="Download"
              className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded-lg border border-slate-700 hover:border-slate-500"
            >
              <Download size={13} />
            </button>
            <button
              type="button"
              onClick={() => onDelete(doc.id)}
              title="Remove"
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const queryClient = useQueryClient();
  const { theme } = useTheme();

  const { data: user, isLoading } = useQuery<Me>({
    queryKey: ['customer-me'],
    queryFn: () =>
      customerApi.get<{ success: boolean; data: Me }>('/api/v1/auth/me').then((r) => r.data.data),
  });

  // ── Profile form ──
  const {
    register: regProfile,
    handleSubmit: handleProfile,
    reset: resetProfile,
    formState: { errors: profileErrors },
  } = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  useEffect(() => {
    if (user) resetProfile({ full_name: user.full_name });
  }, [user, resetProfile]);

  const updateMutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      customerApi.patch<{ success: boolean; data: Me }>('/api/v1/auth/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
      toast.success('Profile updated.');
    },
    onError: () => toast.error('Failed to update profile.'),
  });

  // ── Password form ──
  const {
    register: regPw,
    handleSubmit: handlePw,
    reset: resetPw,
    formState: { errors: pwErrors },
  } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const changePwMutation = useMutation({
    mutationFn: (data: PasswordForm) =>
      customerApi.patch('/api/v1/auth/change-password', {
        current_password: data.current_password,
        new_password: data.new_password,
      }),
    onSuccess: () => {
      resetPw();
      toast.success('Password changed.');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to change password.';
      toast.error(msg);
    },
  });

  // ── Delete compliance doc ──
  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) =>
      customerApi.delete(`/api/v1/auth/me/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
      toast.success('Document removed.');
    },
    onError: () => toast.error('Failed to remove document.'),
  });

  // ── Logout ──
  async function handleLogout() {
    try {
      const raw = localStorage.getItem('onys_refresh_token');
      if (raw) await customerApi.post('/api/v1/auth/logout', { refresh_token: raw }).catch(() => {});
    } finally {
      clearToken();
      window.location.href = '/login';
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-5">
        <div className="h-8 w-48 bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-40 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="h-56 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          <div className="h-56 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  const initials =
    user?.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? 'U';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-5">

      {/* Header */}
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">My Account</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your profile and account settings</p>
      </div>

      {/* Avatar + identity (full width) */}
      <div className="flex items-center gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        <div className="w-14 h-14 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
          <span className="font-display font-bold text-teal-400 text-xl">{initials}</span>
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-100 truncate">{user?.full_name}</p>
          <p className="text-sm text-slate-400 truncate">{user?.email}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-400 font-medium">
              Customer
            </span>
            {user?.email_verified ? (
              <span className="flex items-center gap-1 text-xs text-teal-500">
                <CheckCircle2 size={11} /> Verified
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle size={11} /> Email not verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column grid for the rest */}
      <div className="grid lg:grid-cols-2 gap-5 items-start">

      {/* ── LEFT COLUMN: Identity & business ── */}
      <div className="space-y-5">

      {/* ── Personal Details ── */}
      <EditableSection
        title="Personal Details"
        description="Your display name and account info"
        icon={User}
        onSave={handleProfile(async (data) => {
          await updateMutation.mutateAsync(data);
        })}
        savePending={updateMutation.isPending}
      >
        {(editing) =>
          editing ? (
            <div className="space-y-4">
              <Input
                label="Full Name"
                placeholder="Your full name"
                autoComplete="name"
                error={profileErrors.full_name?.message}
                {...regProfile('full_name')}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400 tracking-wide">Email Address</label>
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    disabled
                    autoComplete="email"
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm text-slate-500 bg-slate-800/50 border border-slate-700/50 cursor-not-allowed"
                  />
                  {user?.email_verified
                    ? <span className="flex items-center gap-1 text-xs text-teal-400 shrink-0"><CheckCircle2 size={12} />Verified</span>
                    : <span className="flex items-center gap-1 text-xs text-amber-400 shrink-0"><AlertTriangle size={12} />Unverified</span>}
                </div>
                <p className="text-xs text-slate-600">Email cannot be changed. Contact support if needed.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <ReadField label="Full Name" value={user?.full_name} />
              <ReadField label="Email" value={user?.email} />
              <ReadField
                label="Email Status"
                value={user?.email_verified ? '✓ Verified' : 'Not verified'}
              />
              {user?.created_at && (
                <ReadField
                  label="Member since"
                  value={new Date(user.created_at).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                />
              )}
            </div>
          )
        }
      </EditableSection>

      {/* ── Billing & Tax Details ── */}
      <BillingDetails user={user ?? { id: '' }} />

      {/* ── Compliance Documents ── */}
      <Section
        title="Compliance Documents"
        description="Documents you've submitted for platform verification"
        icon={ShieldCheck}
      >
        <ComplianceDocuments
          docs={(user?.compliance_documents ?? []) as ComplianceDoc[]}
          onDelete={(id) => deleteDocMutation.mutate(id)}
        />
      </Section>

      </div>{/* end LEFT COLUMN */}

      {/* ── RIGHT COLUMN: Account settings ── */}
      <div className="space-y-5">

      {/* ── Change Password ── */}
      <Section title="Change Password" description="Minimum 12 characters" icon={Lock}>
        <form onSubmit={handlePw((data) => changePwMutation.mutate(data))} className="space-y-4">
          {/* Hidden username field for password managers — accessibility requirement */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            value={user?.email ?? ''}
            readOnly
            style={{ display: 'none' }}
            aria-hidden="true"
          />
          <PasswordInput
            label="Current Password"
            placeholder="Your current password"
            autoComplete="current-password"
            error={pwErrors.current_password?.message}
            {...regPw('current_password')}
          />
          <PasswordInput
            label="New Password"
            placeholder="Min. 12 characters"
            autoComplete="new-password"
            error={pwErrors.new_password?.message}
            {...regPw('new_password')}
          />
          <PasswordInput
            label="Confirm New Password"
            placeholder="Re-enter new password"
            autoComplete="new-password"
            error={pwErrors.confirm_password?.message}
            {...regPw('confirm_password')}
          />
          <Button type="submit" variant="secondary" loading={changePwMutation.isPending}>
            <Lock size={14} className="mr-1.5" />
            Change Password
          </Button>
        </form>
      </Section>

      {/* ── Security ── */}
      <Section title="Security" description="Two-factor authentication and session info" icon={Shield}>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-slate-200">Two-Factor Authentication</p>
              <p className="text-xs text-slate-500 mt-0.5">Protect your account with an authenticator app</p>
            </div>
            {user?.mfa_enabled ? (
              <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 rounded-full font-medium">
                <CheckCircle2 size={11} /> Enabled
              </span>
            ) : (
              <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-full">
                Disabled
              </span>
            )}
          </div>
          {user?.created_at && (
            <div className="flex items-center justify-between py-2 border-t border-slate-800 text-sm">
              <span className="text-slate-500">Account created</span>
              <span className="text-slate-400">
                {new Date(user.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          )}
          {user?.last_login_at && (
            <div className="flex items-center justify-between py-2 border-t border-slate-800 text-sm">
              <span className="text-slate-500">Last login</span>
              <span className="text-slate-400">
                {new Date(user.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Appearance ── */}
      <Section title="Appearance" description="Choose your preferred colour scheme" icon={Palette}>
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Select a theme. <span className="text-slate-500">System</span> follows your OS preference.
          </p>
          <ThemeToggle />
          <p className="text-xs text-slate-600">
            Current preference: <span className="text-slate-500 capitalize">{theme}</span>
          </p>
        </div>
      </Section>

      {/* ── Account Actions ── */}
      <Section title="Account Actions" description="Sign out of your account" icon={LogOut}>
        <Button variant="secondary" className="w-full justify-start" onClick={handleLogout}>
          <LogOut size={14} className="mr-2" />
          Sign Out
        </Button>
      </Section>

      </div>{/* end RIGHT COLUMN */}
      </div>{/* end two-column grid */}

    </div>
  );
}
