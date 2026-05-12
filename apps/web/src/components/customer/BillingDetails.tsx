'use client';

import { useState, useEffect, useRef } from 'react';
import { useForm, Controller, type UseFormSetValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clsx } from 'clsx';
import {
  Building2, Mail, Globe, MapPin, Shield,
  FileText, Upload, CheckCircle2, AlertCircle,
  Loader2, Trash2, ExternalLink, ReceiptText,
  Pencil, X, Check, Eye, Download,
} from 'lucide-react';
import { getToken } from '@/lib/customer-auth';
import customerApi from '@/lib/customer-api';
import { getCountryConfig, ALL_COUNTRIES } from '@/lib/country-tax-data';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BillingUser {
  id: string;
  legal_entity_name?: string | null;
  legal_name?: string | null;
  trading_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  website?: string | null;
  billing_address_1?: string | null;
  billing_address_2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_postcode?: string | null;
  billing_country?: string | null;
  entity_type?: string | null;
  abn?: string | null;
  abn_verified?: boolean;
  abn_verified_name?: string | null;
  acn?: string | null;
  gst_registered?: boolean;
  vat_number?: string | null;
  tax_residency_country?: string | null;
  is_foreign_entity?: boolean;
  customer_terms_signed?: boolean;
  compliance_documents?: ComplianceDoc[];
}

interface ComplianceDoc {
  id: string;
  type: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  blob_path: string;
  uploaded_at: string;
  verified: boolean;
  verified_at: string | null;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors placeholder:text-slate-600 disabled:opacity-60 disabled:cursor-not-allowed';
const selectCls = 'w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 disabled:opacity-60 disabled:cursor-not-allowed';

// Helper: when the User row is abn_verified=true, the API rejects edits to
// these fields unless the ABN itself changes. Reflect that in the UI by
// disabling the corresponding inputs and showing a "from ABR" hint.
const ABR_LOCKED_NOTE = 'Populated from the ABR. Change the ABN to refresh.';

// Shared mutation factory — every section PATCHes /auth/me/billing with only
// its own keys. Centralised so the error handling (LOCKED_BY_ABR_VERIFICATION,
// ABN_REQUIRED_AU_CUSTOMER, VALIDATION_ERROR with field details) stays
// consistent across all three sections.
function useBillingPatch(opts: {
  sectionLabel: string;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      customerApi.patch('/api/v1/auth/me/billing', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
      toast.success(`${opts.sectionLabel} saved.`);
      opts.onSuccess();
    },
    onError: (err: unknown) => {
      const e = err as {
        response?: {
          status?: number;
          data?: {
            error?: {
              code?: string;
              message?: string;
              fields?: Array<{ field: string; message: string }>;
            };
          };
        };
      };
      const code = e.response?.data?.error?.code;
      const msg = e.response?.data?.error?.message;
      const fields = e.response?.data?.error?.fields;
      console.error(`[billing/${opts.sectionLabel}] save failed`, {
        status: e.response?.status, code, message: msg, fields,
      });
      if (code === 'LOCKED_BY_ABR_VERIFICATION') {
        toast.error(msg ?? 'These fields are pulled from the ABR. Change the ABN to refresh them.');
      } else if (code === 'ABN_REQUIRED_AU_CUSTOMER') {
        toast.error('Australian customers must provide a valid, verified ABN before saving.');
      } else if (code === 'VALIDATION_ERROR' && fields && fields.length > 0) {
        toast.error(`Validation: ${fields.map((f) => `${f.field} — ${f.message}`).join('; ')}`);
      } else if (msg) {
        toast.error(msg);
      } else {
        toast.error(`Failed to save ${opts.sectionLabel.toLowerCase()}.`);
      }
    },
  });
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
// Renders the card with header + per-section Edit/Save/Cancel button row.
// Children get the `editing` flag and the form's submit/cancel handlers.

interface SectionShellProps {
  title: string;
  desc: string;
  icon: React.ElementType;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  /** Hide the Edit button (useful for sections that have no read-only mode). */
  hideEdit?: boolean;
  children: React.ReactNode;
}

function SectionShell({
  title, desc, icon: Icon, editing, saving, onEdit, onCancel, onSave, hideEdit, children,
}: SectionShellProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">{title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors disabled:opacity-50"
              >
                <X size={12} /> Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : !hideEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-400 px-3 py-1.5 rounded-lg border border-slate-700 hover:border-teal-500/50 transition-colors"
            >
              <Pencil size={12} /> Edit
            </button>
          ) : null}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// Read-only field renderer used by all sections in their non-editing view.
function ReadField({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={value ? 'text-sm text-slate-200' : 'text-sm text-slate-600 italic'}>
        {value ?? 'Not set'}
      </p>
    </div>
  );
}

// ─── Section 1: Billing Contact ──────────────────────────────────────────────

const contactSchema = z.object({
  legal_entity_name: z.string().min(2, 'Required').max(200),
  trading_name: z.string().max(200).optional(),
  billing_email: z.string().email('Invalid email').optional().or(z.literal('')),
  billing_phone: z.string().max(30).optional(),
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
});
type ContactForm = z.infer<typeof contactSchema>;

function BillingContactSection({ user }: { user: BillingUser }) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      legal_entity_name: user.legal_entity_name ?? user.legal_name ?? '',
      trading_name: user.trading_name ?? '',
      billing_email: user.billing_email ?? '',
      billing_phone: user.billing_phone ?? '',
      website: user.website ?? '',
    },
  });

  const save = useBillingPatch({
    sectionLabel: 'Billing contact',
    onSuccess: () => setEditing(false),
  });

  function onSubmit(data: ContactForm) {
    // Strip legal_entity_name when the row is ABR-verified — the API rejects
    // edits to that field with LOCKED_BY_ABR_VERIFICATION. The user has to
    // change the ABN (in the Tax section) to refresh derived fields.
    const payload: Record<string, unknown> = { ...data };
    if (user.abn_verified) {
      delete payload.legal_entity_name;
    }
    save.mutate(payload);
  }

  function startEdit() {
    reset({
      legal_entity_name: user.legal_entity_name ?? user.legal_name ?? '',
      trading_name: user.trading_name ?? '',
      billing_email: user.billing_email ?? '',
      billing_phone: user.billing_phone ?? '',
      website: user.website ?? '',
    });
    setEditing(true);
  }

  return (
    <SectionShell
      title="Billing Contact"
      desc="Name, email and contact used on invoices"
      icon={Building2}
      editing={editing}
      saving={save.isPending}
      onEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={() => { void handleSubmit(onSubmit)(); }}
    >
      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ReadField label="Legal entity name" value={user.legal_entity_name ?? user.legal_name} />
          <ReadField label="Trading name" value={user.trading_name} />
          <ReadField label="Billing email" value={user.billing_email} />
          <ReadField label="Billing phone" value={user.billing_phone} />
          <ReadField label="Website" value={user.website} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                Legal entity name *
                {user.abn_verified && <CheckCircle2 size={11} className="text-teal-400" />}
              </label>
              <input
                {...register('legal_entity_name')}
                placeholder="Full registered legal name"
                autoComplete="organization"
                disabled={!!user.abn_verified}
                className={inputCls}
              />
              {user.abn_verified && <p className="text-xs text-slate-500 mt-1">{ABR_LOCKED_NOTE}</p>}
              {errors.legal_entity_name && <p className="text-xs text-red-400 mt-1">{errors.legal_entity_name.message}</p>}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Trading name <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <input {...register('trading_name')} placeholder="e.g. Acme Tech" autoComplete="organization" className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5"><Mail size={11} /> Billing email</label>
              <input {...register('billing_email')} type="email" placeholder="billing@yourcompany.com" autoComplete="email" className={inputCls} />
              {errors.billing_email && <p className="text-xs text-red-400 mt-1">{errors.billing_email.message}</p>}
              <p className="text-xs text-slate-600 mt-1">Invoices sent here</p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">
                Billing phone <span className="text-slate-600 font-normal">(optional)</span>
              </label>
              <input {...register('billing_phone')} type="tel" placeholder="+61 4 1234 5678" autoComplete="tel" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
              <Globe size={11} /> Website <span className="text-slate-600 font-normal">(optional)</span>
            </label>
            <input {...register('website')} type="url" placeholder="https://yourcompany.com" autoComplete="url" className={inputCls} />
            {errors.website && <p className="text-xs text-red-400 mt-1">{errors.website.message}</p>}
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// ─── Section 2: Billing Address ──────────────────────────────────────────────

const addressSchema = z.object({
  billing_country: z.string().length(2, 'Select a country'),
  billing_address_1: z.string().min(2, 'Required').max(200),
  billing_address_2: z.string().max(200).optional(),
  billing_city: z.string().min(1, 'Required').max(100),
  billing_state: z.string().min(1, 'Required').max(100),
  billing_postcode: z.string().min(1, 'Required').max(20),
});
type AddressForm = z.infer<typeof addressSchema>;

function BillingAddressSection({ user }: { user: BillingUser }) {
  const [editing, setEditing] = useState(false);
  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      billing_country: user.billing_country ?? 'AU',
      billing_address_1: user.billing_address_1 ?? '',
      billing_address_2: user.billing_address_2 ?? '',
      billing_city: user.billing_city ?? '',
      billing_state: user.billing_state ?? '',
      billing_postcode: user.billing_postcode ?? '',
    },
  });

  const country = watch('billing_country');
  const countryConf = getCountryConfig(country);

  const save = useBillingPatch({
    sectionLabel: 'Billing address',
    onSuccess: () => setEditing(false),
  });

  function onSubmit(data: AddressForm) {
    save.mutate({ ...data });
  }

  function startEdit() {
    reset({
      billing_country: user.billing_country ?? 'AU',
      billing_address_1: user.billing_address_1 ?? '',
      billing_address_2: user.billing_address_2 ?? '',
      billing_city: user.billing_city ?? '',
      billing_state: user.billing_state ?? '',
      billing_postcode: user.billing_postcode ?? '',
    });
    setEditing(true);
  }

  return (
    <SectionShell
      title="Billing Address"
      desc="Used on invoices and for tax jurisdiction"
      icon={MapPin}
      editing={editing}
      saving={save.isPending}
      onEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={() => { void handleSubmit(onSubmit)(); }}
    >
      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ReadField label="Country" value={user.billing_country ?? 'AU'} />
          <ReadField
            label="Street address"
            value={[user.billing_address_1, user.billing_address_2].filter(Boolean).join(', ') || undefined}
          />
          <ReadField label="City / suburb" value={user.billing_city} />
          <ReadField label="State / region" value={user.billing_state} />
          <ReadField label="Postcode" value={user.billing_postcode} />
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5">Country *</label>
            <Controller
              name="billing_country"
              control={control}
              render={({ field }) => (
                <select {...field} className={selectCls}>
                  {ALL_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                  ))}
                </select>
              )}
            />
          </div>
          <input {...register('billing_address_1')} placeholder="Street address, building" autoComplete="address-line1" className={inputCls} />
          {errors.billing_address_1 && <p className="text-xs text-red-400">{errors.billing_address_1.message}</p>}
          <input {...register('billing_address_2')} placeholder="Suite, floor, unit (optional)" autoComplete="address-line2" className={inputCls} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <input {...register('billing_city')} placeholder={country === 'AU' ? 'Suburb' : 'City'} autoComplete="address-level2" className={inputCls} />
              {errors.billing_city && <p className="text-xs text-red-400 mt-1">{errors.billing_city.message}</p>}
            </div>
            <div>
              {countryConf.states ? (
                <Controller
                  name="billing_state"
                  control={control}
                  render={({ field }) => (
                    <select {...field} value={field.value ?? ''} className={selectCls}>
                      <option value="">{countryConf.stateLabel}...</option>
                      {countryConf.states!.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  )}
                />
              ) : (
                <input {...register('billing_state')} placeholder={countryConf.stateLabel} autoComplete="address-level1" className={inputCls} />
              )}
              {errors.billing_state && <p className="text-xs text-red-400 mt-1">{errors.billing_state.message}</p>}
            </div>
            <div>
              <input {...register('billing_postcode')} placeholder={countryConf.postcodeLabel} autoComplete="postal-code" className={inputCls} />
              {errors.billing_postcode && <p className="text-xs text-red-400 mt-1">{errors.billing_postcode.message}</p>}
            </div>
          </div>
        </div>
      )}
    </SectionShell>
  );
}

// ─── Section 3: Tax & Business Registration ──────────────────────────────────

const taxSchema = z.object({
  entity_type: z.string().min(1, 'Required'),
  abn: z.string().optional(),
  acn: z.string().optional(),
  gst_registered: z.boolean().optional(),
  vat_number: z.string().optional(),
  tax_residency_country: z.string().length(2, 'Select a tax residency country'),
  is_foreign_entity: z.boolean(),
});
type TaxForm = z.infer<typeof taxSchema>;

function BillingTaxSection({ user }: { user: BillingUser }) {
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const [abnStatus, setAbnStatus] = useState<{ verified: boolean; entity_name?: string; gst_active?: boolean; message?: string } | null>(
    user.abn_verified
      ? {
          verified: true,
          ...(user.abn_verified_name != null ? { entity_name: user.abn_verified_name } : {}),
        }
      : null,
  );
  const [verifyingAbn, setVerifyingAbn] = useState(false);

  const { register, handleSubmit, reset, watch, control, setValue, formState: { errors } } = useForm<TaxForm>({
    resolver: zodResolver(taxSchema),
    defaultValues: {
      entity_type: user.entity_type ?? 'COMPANY',
      abn: user.abn ?? '',
      acn: user.acn ?? '',
      gst_registered: user.gst_registered ?? false,
      vat_number: user.vat_number ?? '',
      tax_residency_country: user.tax_residency_country ?? 'AU',
      is_foreign_entity: user.is_foreign_entity ?? false,
    },
  });

  const taxResidency = watch('tax_residency_country');
  const abn = watch('abn');
  const countryConf = getCountryConfig(taxResidency);
  const isAu = taxResidency === 'AU';
  const canVerifyAbn = isAu;

  // Keep is_foreign_entity in sync with tax_residency_country
  useEffect(() => {
    setValue('is_foreign_entity', taxResidency !== 'AU');
  }, [taxResidency, setValue]);

  const save = useBillingPatch({
    sectionLabel: 'Tax & business registration',
    onSuccess: () => setEditing(false),
  });

  function onSubmit(data: TaxForm) {
    // Strip ABR-derived fields when ABN unchanged + verified — same logic
    // as before, applied per-section now.
    const abnChanged = (data.abn ?? '').replace(/\s/g, '') !== (user.abn ?? '').replace(/\s/g, '');
    const payload: Record<string, unknown> = { ...data };
    if (user.abn_verified && !abnChanged) {
      delete payload.entity_type;
      delete payload.gst_registered;
      delete payload.acn;
    }
    save.mutate(payload);
  }

  function startEdit() {
    reset({
      entity_type: user.entity_type ?? 'COMPANY',
      abn: user.abn ?? '',
      acn: user.acn ?? '',
      gst_registered: user.gst_registered ?? false,
      vat_number: user.vat_number ?? '',
      tax_residency_country: user.tax_residency_country ?? 'AU',
      is_foreign_entity: user.is_foreign_entity ?? false,
    });
    setEditing(true);
  }

  async function verifyAbn() {
    const cleanAbn = (abn ?? '').replace(/\s/g, '');
    if (cleanAbn.length !== 11) return;
    if (cleanAbn === (user?.abn ?? '').replace(/\s/g, '') && user?.abn_verified) {
      return;
    }
    setVerifyingAbn(true);
    try {
      const res = await customerApi.post<{
        success: boolean;
        data: {
          abn: string;
          legal_name: string | null;
          legal_entity_name: string | null;
          gst_registered: boolean;
          entity_type: string | null;
          acn: string | null;
          abn_verified: boolean;
          abn_verified_name: string | null;
          abr: {
            entity_name: string | null;
            entity_type_name: string | null;
            gst_registered: boolean;
            address_state: string | null;
            address_postcode: string | null;
          };
        };
      }>('/api/v1/auth/me/abn-verify', { abn: cleanAbn });

      const data = res.data.data;
      // Mirror the ABR response into the local form state so the user
      // sees the populated, locked values immediately. The API has
      // already persisted them — we refresh customer-me below to flip
      // abn_verified and lock the inputs.
      setValue('gst_registered', data.gst_registered);
      if (data.entity_type) setValue('entity_type', data.entity_type);
      if (data.acn) setValue('acn', data.acn);
      const en = data.abr.entity_name ?? data.abn_verified_name;
      setAbnStatus({
        verified: true,
        ...(en ? { entity_name: en } : {}),
        gst_active: data.abr.gst_registered,
      });
      toast.success(`ABN verified: ${data.abr.entity_name ?? data.legal_entity_name ?? cleanAbn}`);
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { code?: string; message?: string } } } };
      const code = e.response?.data?.error?.code;
      const message = e.response?.data?.error?.message;
      if (code === 'ABN_INACTIVE') {
        setAbnStatus({ verified: false, ...(message ? { message } : {}) });
        toast.error(message ?? 'ABN is not active.');
      } else if (code === 'ABR_NOT_FOUND') {
        setAbnStatus({ verified: false, ...(message ? { message } : {}) });
        toast.error('ABN not found in the ABR.');
      } else if (code === 'INVALID_FORMAT') {
        setAbnStatus({ verified: false, ...(message ? { message } : {}) });
        toast.error('ABN failed checksum validation.');
      } else if (code === 'ABR_UNAVAILABLE') {
        toast.error('ABR is temporarily unavailable. Please try again shortly.');
      } else if (code === 'ABR_NOT_CONFIGURED') {
        toast.error('ABN verification is not configured on the server. Contact support.');
      } else {
        toast.error('ABN verification failed.');
      }
    } finally {
      setVerifyingAbn(false);
    }
  }

  return (
    <SectionShell
      title="Tax & Business Registration"
      desc="Required for correct invoice treatment globally"
      icon={Shield}
      editing={editing}
      saving={save.isPending}
      onEdit={startEdit}
      onCancel={() => setEditing(false)}
      onSave={() => { void handleSubmit(onSubmit)(); }}
    >
      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
          <ReadField label="Entity type" value={user.entity_type} />
          <ReadField label="Tax residency" value={user.tax_residency_country ?? 'AU'} />
          <ReadField
            label="ABN"
            value={user.abn ? `${user.abn}${user.abn_verified ? ' ✓ Verified' : ''}` : undefined}
          />
          <ReadField label="ACN" value={user.acn} />
          <ReadField label="GST registered" value={user.gst_registered ? 'Yes' : 'No'} />
          <ReadField label="VAT / Tax ID" value={user.vat_number} />
        </div>
      ) : (
        <TaxFormFields
          register={register}
          control={control}
          setValue={setValue}
          errors={errors}
          countryConf={countryConf}
          isAu={isAu}
          user={user}
          abn={abn ?? ''}
          canVerifyAbn={canVerifyAbn}
          verifyingAbn={verifyingAbn}
          abnStatus={abnStatus}
          onVerifyAbn={verifyAbn}
        />
      )}
    </SectionShell>
  );
}

// Edit-view body for the Tax section. Extracted so the section component
// stays under 200 lines.
function TaxFormFields(props: {
  register: ReturnType<typeof useForm<TaxForm>>['register'];
  control: ReturnType<typeof useForm<TaxForm>>['control'];
  setValue: UseFormSetValue<TaxForm>;
  errors: ReturnType<typeof useForm<TaxForm>>['formState']['errors'];
  countryConf: ReturnType<typeof getCountryConfig>;
  isAu: boolean;
  user: BillingUser;
  abn: string;
  canVerifyAbn: boolean;
  verifyingAbn: boolean;
  abnStatus: { verified: boolean; entity_name?: string; gst_active?: boolean; message?: string } | null;
  onVerifyAbn: () => void;
}) {
  const { register, control, errors, countryConf, isAu, user, abn, canVerifyAbn, verifyingAbn, abnStatus, onVerifyAbn } = props;
  // setValue not used inside the body — the parent owns ABR side-effects.
  void props.setValue;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
            Entity type *
            {user.abn_verified && <CheckCircle2 size={11} className="text-teal-400" />}
          </label>
          {user.abn_verified ? (
            <input type="text" value={user.entity_type ?? ''} disabled className={inputCls} />
          ) : (
            <select {...register('entity_type')} className={selectCls}>
              <option value="">Select entity type…</option>
              <option value="COMPANY">Company (Pty Ltd / Ltd)</option>
              <option value="SOLE_TRADER">Sole Trader</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="PARTNERSHIP">Partnership</option>
              <option value="TRUST">Trust</option>
              <option value="GOVERNMENT">Government / Public Sector</option>
              <option value="NON_PROFIT">Non-profit / NFP</option>
              <option value="OTHER">Other</option>
            </select>
          )}
          {errors.entity_type && <p className="text-xs text-red-400 mt-1">{errors.entity_type.message}</p>}
          {user.abn_verified && <p className="text-xs text-slate-500 mt-1">{ABR_LOCKED_NOTE}</p>}
        </div>
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">Tax residency country *</label>
          <Controller
            name="tax_residency_country"
            control={control}
            render={({ field }) => (
              <select {...field} className={selectCls}>
                <option value="">Select…</option>
                {ALL_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </select>
            )}
          />
          {errors.tax_residency_country && <p className="text-xs text-red-400 mt-1">{errors.tax_residency_country.message}</p>}
        </div>
      </div>

      {countryConf.registrationTypes.map((rt) => (
        <div key={rt.type}>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">
            {rt.label}
            {rt.required && <span className="text-red-400 ml-1">*</span>}
            {rt.lookupUrl && (
              <a href={rt.lookupUrl} target="_blank" rel="noreferrer" className="ml-2 text-teal-400 hover:underline">
                <ExternalLink size={10} className="inline" /> {rt.lookupLabel}
              </a>
            )}
          </label>

          {rt.type === 'ABN' ? (
            <div>
              <div className="flex gap-2">
                <input
                  {...register('abn')}
                  placeholder={rt.placeholder}
                  autoComplete="off"
                  onBlur={() => { if (canVerifyAbn) onVerifyAbn(); }}
                  className={clsx(inputCls, 'flex-1 font-mono')}
                />
                <button
                  type="button"
                  onClick={onVerifyAbn}
                  disabled={!canVerifyAbn || !abn || verifyingAbn || (abn?.replace(/\s/g, '').length ?? 0) !== 11}
                  className="h-10 px-4 text-xs font-medium rounded-xl border bg-slate-800 border-slate-700 text-slate-300 hover:border-teal-500 hover:text-teal-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {verifyingAbn ? <Loader2 size={13} className="animate-spin" /> : (user.abn_verified ? 'Re-verify' : 'Verify ABN')}
                </button>
              </div>
              {!canVerifyAbn && (
                <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> ABN verification is only available when tax residency is set to Australia.
                </p>
              )}
              {abnStatus && (
                <div className={clsx(
                  'flex items-center gap-2 mt-2 text-xs px-3 py-2 rounded-lg',
                  abnStatus.verified ? 'bg-teal-500/10 text-teal-300' : 'bg-amber-500/10 text-amber-300',
                )}>
                  {abnStatus.verified ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  {abnStatus.verified
                    ? `✓ ${abnStatus.entity_name ?? 'Verified'} ${abnStatus.gst_active ? '· GST Active' : ''}`
                    : (abnStatus.message ?? 'Could not verify')}
                </div>
              )}
              <p className="text-xs text-slate-600 mt-1">{rt.hint} ABR fields below auto-fill the moment your ABN is verified.</p>
            </div>
          ) : rt.type === 'ACN' ? (
            <div>
              <input
                {...register('acn')}
                placeholder={rt.placeholder}
                autoComplete="off"
                disabled={!!user.abn_verified}
                className={clsx(inputCls, 'font-mono')}
              />
              <p className="text-xs text-slate-600 mt-1">{user.abn_verified ? ABR_LOCKED_NOTE : rt.hint}</p>
            </div>
          ) : (
            <div>
              <input {...register('vat_number')} placeholder={rt.placeholder} autoComplete="off" className={clsx(inputCls, 'font-mono')} />
              <p className="text-xs text-slate-600 mt-1">{rt.hint}</p>
            </div>
          )}
        </div>
      ))}

      {isAu && (
        <div>
          <label className={clsx('flex items-center gap-3', user.abn_verified ? 'cursor-not-allowed' : 'cursor-pointer')}>
            <input
              type="checkbox"
              {...register('gst_registered')}
              disabled={!!user.abn_verified}
              className="rounded border-slate-600 bg-slate-800 accent-teal-500 disabled:opacity-60"
            />
            <span className="text-sm text-slate-300 flex items-center gap-1.5">
              Registered for GST (turnover ≥ $75,000/yr)
              {user.abn_verified && <CheckCircle2 size={11} className="text-teal-400" />}
            </span>
          </label>
          {user.abn_verified && <p className="text-xs text-slate-500 mt-1 ml-7">{ABR_LOCKED_NOTE}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Section 4: Compliance Documents ─────────────────────────────────────────
// Each document upload/delete is its own action — no edit mode needed for
// this section, so we hide the section-level Edit button.

const DOC_CONFIGS = [
  {
    type: 'BUSINESS_REGISTRATION',
    title: 'Business Registration Certificate',
    desc: 'ASIC extract, Certificate of Incorporation, or equivalent',
  },
  {
    type: 'BOARD_RESOLUTION',
    title: 'Board Resolution',
    desc: 'Authorising use of talvex.com.au for procurement',
  },
  {
    type: 'TAX_CERTIFICATE',
    title: 'Tax Registration Certificate',
    desc: 'GST/VAT certificate or tax ID document',
  },
  {
    type: 'OTHER',
    title: 'Other Supporting Document',
    desc: 'Power of attorney, trade licence, or compliance doc',
  },
];

function BillingDocumentsSection({ user }: { user: BillingUser }) {
  const queryClient = useQueryClient();
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  async function uploadDoc(type: string, file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('File must be under 10MB.'); return; }
    setUploadingDoc(type);
    try {
      const extMime: Record<string, string> = {
        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      };
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const mimeType = file.type || extMime[ext] || 'application/octet-stream';
      const buffer = await file.arrayBuffer();
      await customerApi.post(
        `/api/v1/auth/me/documents?doc_type=${encodeURIComponent(type)}`,
        buffer,
        { headers: { 'Content-Type': mimeType, 'X-File-Name': file.name } },
      );
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
      toast.success('Document uploaded.');
    } catch {
      toast.error('Failed to upload document.');
    } finally {
      setUploadingDoc(null);
    }
  }

  async function deleteDoc(docId: string) {
    try {
      await customerApi.delete(`/api/v1/auth/me/documents/${docId}`);
      queryClient.invalidateQueries({ queryKey: ['customer-me'] });
      toast.success('Document removed.');
    } catch {
      toast.error('Failed to remove document.');
    }
  }

  const docs: ComplianceDoc[] = (user.compliance_documents ?? []) as ComplianceDoc[];
  const getDoc = (type: string) => docs.find((d) => d.type === type) ?? null;

  return (
    <SectionShell
      title="Compliance Documents"
      desc="Optional supporting documents for enterprise procurement"
      icon={FileText}
      editing={false}
      saving={false}
      onEdit={() => {}}
      onCancel={() => {}}
      onSave={() => {}}
      hideEdit
    >
      <div className="space-y-4">
        {DOC_CONFIGS.map((cfg) => (
          <DocZone
            key={cfg.type}
            config={cfg}
            existingDoc={getDoc(cfg.type)}
            uploading={uploadingDoc === cfg.type}
            onUpload={uploadDoc}
            onDelete={deleteDoc}
          />
        ))}
      </div>
    </SectionShell>
  );
}

// ─── Document upload tile (extracted, unchanged behaviour) ───────────────────

function DocZone({
  config,
  existingDoc,
  uploading,
  onUpload,
  onDelete,
}: {
  config: { type: string; title: string; desc: string };
  existingDoc: ComplianceDoc | null;
  uploading: boolean;
  onUpload: (type: string, file: File) => void;
  onDelete: (docId: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (existingDoc) {
    async function viewDoc() {
      try {
        const token = getToken();
        const res = await fetch(`/api/v1/auth/me/documents/${existingDoc!.id}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const tab = window.open(url, '_blank');
        if (tab) setTimeout(() => URL.revokeObjectURL(url), 30_000);
      } catch {
        toast.error('Could not open document.');
      }
    }

    async function downloadDoc() {
      try {
        const token = getToken();
        const res = await fetch(`/api/v1/auth/me/documents/${existingDoc!.id}/download?dl=1`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = existingDoc!.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        toast.error('Could not download document.');
      }
    }

    return (
      <div className="bg-teal-500/5 border border-teal-500/25 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <FileText size={15} className="text-teal-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{existingDoc.file_name}</p>
            <p className="text-xs text-slate-500">
              {existingDoc.file_size ? `${Math.round(existingDoc.file_size / 1024)} KB · ` : ''}
              {new Date(existingDoc.uploaded_at).toLocaleDateString('en-AU')}
              {existingDoc.verified && <span className="ml-2 text-teal-400 font-medium">✓ Verified</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={viewDoc}
              title="View document"
              className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 px-2.5 py-1.5 rounded-lg border border-teal-500/30 hover:bg-teal-500/10 transition-colors"
            >
              <Eye size={12} /> View
            </button>
            <button
              type="button"
              onClick={downloadDoc}
              title="Download document"
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 transition-colors"
            >
              <Download size={12} /> Download
            </button>
            <button
              type="button"
              onClick={() => onDelete(existingDoc.id)}
              title="Remove document"
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-1">{config.title}</p>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) onUpload(config.type, file);
        }}
        className={clsx(
          'flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all',
          dragging ? 'border-teal-500 bg-teal-500/5' : 'border-slate-700 hover:border-slate-500 bg-slate-800/50',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(config.type, f); }}
        />
        {uploading ? <Loader2 size={18} className="text-teal-400 animate-spin" /> : <Upload size={18} className="text-slate-500" />}
        <p className="text-xs text-slate-400 text-center">{config.desc}</p>
        <p className="text-xs text-slate-600">PDF · JPG · PNG · max 10MB</p>
      </label>
    </div>
  );
}

// ─── Invoice preview ─────────────────────────────────────────────────────────

function InvoicePreview({ user }: { user: BillingUser }) {
  if (!(user.legal_entity_name ?? user.legal_name)) return null;
  const isAu = user.billing_country === 'AU';
  const isTaxInvoice = isAu && !!user.gst_registered;
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ReceiptText size={11} /> Invoice will show
      </p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Bill to:</span>
          <span className="text-slate-200 font-medium">{user.legal_entity_name ?? user.legal_name}</span>
        </div>
        {user.abn && (
          <div className="flex justify-between">
            <span className="text-slate-500">ABN:</span>
            <span className="text-slate-300 font-mono">{user.abn}</span>
          </div>
        )}
        {user.billing_city && (
          <div className="flex justify-between">
            <span className="text-slate-500">Address:</span>
            <span className="text-slate-300 text-right max-w-48">
              {[user.billing_address_1, user.billing_city, user.billing_state, user.billing_postcode].filter(Boolean).join(', ')}
            </span>
          </div>
        )}
        <div className="flex justify-between border-t border-slate-700 pt-1.5">
          <span className="text-slate-500">Invoice type:</span>
          <span className={clsx('font-semibold text-xs px-2 py-0.5 rounded-full', isTaxInvoice ? 'bg-teal-500/20 text-teal-300' : 'bg-slate-700 text-slate-400')}>
            {isTaxInvoice ? '✓ Tax Invoice (GST)' : 'Invoice (no GST)'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Public component ───────────────────────────────────────────────────────

export default function BillingDetails({ user }: { user: BillingUser }) {
  return (
    <div className="space-y-4">
      <BillingContactSection user={user} />
      <BillingAddressSection user={user} />
      <BillingTaxSection user={user} />
      <BillingDocumentsSection user={user} />
      <InvoicePreview user={user} />
    </div>
  );
}
