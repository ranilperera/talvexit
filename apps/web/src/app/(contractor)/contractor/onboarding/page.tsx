'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TimezoneSelect } from '@/components/ui/TimezoneSelect';
import customerApi from '@/lib/customer-api';
import { getUser } from '@/lib/customer-auth';
import { useDomainTiles } from '@/hooks/useDomains';

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_LABELS = [
  'Profile',
  'Domains',
  'Rates',
  'Tax & Legal',
  'Identity',
  'Agreement',
  'Review',
];


const AGREEMENT_TEXT = `INDEPENDENT CONTRACTOR PLATFORM AGREEMENT v1.0

This agreement governs your participation as an independent contractor on the onys.online platform.

1. INDEPENDENT CONTRACTOR STATUS
You are an independent contractor, not an employee of onys.online. You are responsible for your own taxes, superannuation, and insurance obligations.

2. COMMISSION
onys.online charges a commission of 20% on all completed orders. This is deducted automatically before payout.

3. OBLIGATIONS
You agree to:
- Deliver work as described in each task scope
- Maintain valid professional indemnity and public liability insurance
- Comply with all applicable laws and regulations
- Not engage in discriminatory or fraudulent behaviour

4. INTELLECTUAL PROPERTY
All work product delivered to customers is the customer's property unless otherwise agreed in writing.

5. CONFIDENTIALITY
You agree to treat all customer information and credentials as strictly confidential.

6. DISPUTE RESOLUTION
All disputes are subject to the platform dispute resolution process. The platform decision is binding.

7. TERMINATION
Either party may terminate this agreement with 30 days written notice. Immediate termination applies for fraud or serious misconduct.

By clicking "I Agree", you confirm you have read, understood, and accept all terms of this agreement.`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContractorProfile {
  status: string;
  legal_name: string | null;
  bio: string | null;
  phone: string | null;
  timezone: string | null;
  linkedin_url: string | null;
  domains: string[];
  skills: string[];
  hourly_rate_aud: number | null;
  availability_hours_per_week: number | null;
}

// ─── Step components ──────────────────────────────────────────────────────────

interface Step1Data { legal_name: string; bio: string; phone: string; timezone: string; linkedin_url: string }
interface Step3Data { domains: string[]; skills: string[] }
interface Step4Data { hourly_rate_aud: number; availability_hours_per_week: number; available_from: string }
interface Step5DocEntry { type: string; blob_path: string; file_name: string }
interface Step5Data { documents: Step5DocEntry[]; selfie_blob_path: string; selfie_file_name: string }

interface AllData {
  step1: Step1Data;
  step3: Step3Data;
  step4: Step4Data;
  step5: Step5Data;
}

// Step 1 — Personal Profile
function Step1({ data, onChange }: { data: Step1Data; onChange: (d: Step1Data) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          Legal Full Name *
        </label>
        <input
          type="text"
          value={data.legal_name}
          onChange={(e) => onChange({ ...data, legal_name: e.target.value })}
          placeholder="e.g. John David Smith"
          autoComplete="name"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
        />
        <p className="text-xs text-slate-500 mt-1.5">
          Must exactly match your government-issued ID and bank account name. Required for AML compliance and payout processing.
        </p>
      </div>
      <Input
        label="Phone number (optional)"
        type="tel"
        value={data.phone}
        onChange={(e) => onChange({ ...data, phone: e.target.value })}
        placeholder="+61 4XX XXX XXX"
      />
      <TimezoneSelect
        label="Timezone"
        required
        value={data.timezone}
        onChange={(tz) => onChange({ ...data, timezone: tz })}
      />
      <Input
        label="LinkedIn URL (optional)"
        type="url"
        value={data.linkedin_url}
        onChange={(e) => onChange({ ...data, linkedin_url: e.target.value })}
        placeholder="https://linkedin.com/in/yourprofile"
      />
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          Bio (optional) <span className="text-slate-600">{data.bio.length}/500</span>
        </label>
        <textarea
          value={data.bio}
          onChange={(e) => onChange({ ...data, bio: e.target.value })}
          maxLength={500}
          rows={4}
          placeholder="Describe your expertise and what you offer clients"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 resize-none transition-colors"
        />
      </div>
    </div>
  );
}

// Step 2 (UI) / Step 3 (API) — Domains & Skills
function Step3UI({ data, onChange }: { data: Step3Data; onChange: (d: Step3Data) => void }) {
  const domainTiles = useDomainTiles();
  const [skillInput, setSkillInput] = useState('');

  function toggleDomain(key: string) {
    const next = data.domains.includes(key)
      ? data.domains.filter((d) => d !== key)
      : [...data.domains, key];
    onChange({ ...data, domains: next });
  }

  function addSkill(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && skillInput.trim().length >= 2) {
      e.preventDefault();
      if (!data.skills.includes(skillInput.trim())) {
        onChange({ ...data, skills: [...data.skills, skillInput.trim()] });
      }
      setSkillInput('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-400 mb-3">Select all that apply (min 1)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {domainTiles.map(({ key, label, icon }) => {
            const sel = data.domains.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDomain(key)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all text-left',
                  sel
                    ? 'bg-teal-500/15 border-teal-500/50 text-teal-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500',
                )}
              >
                <span>{icon}</span>
                <span className="text-xs font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          Skills — type and press Enter
        </label>
        <input
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={addSkill}
          placeholder="e.g. Cisco ASA, Palo Alto, pfSense"
          className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
        />
        {data.skills.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {data.skills.map((s) => (
              <span
                key={s}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-full text-xs text-slate-300"
              >
                {s}
                <button
                  type="button"
                  onClick={() => onChange({ ...data, skills: data.skills.filter((x) => x !== s) })}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Step 3 (UI) / Step 4 (API) — Rates & Availability
function Step4UI({ data, onChange }: { data: Step4Data; onChange: (d: Step4Data) => void }) {
  const today = new Date().toISOString().split('T')[0];
  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">Hourly rate (AUD) *</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
          <input
            type="number"
            min={50}
            max={500}
            value={data.hourly_rate_aud || ''}
            onChange={(e) => onChange({ ...data, hourly_rate_aud: Number(e.target.value) })}
            className="w-full pl-7 pr-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors"
            placeholder="125"
          />
        </div>
        <p className="text-xs text-slate-500 mt-1">$50 – $300/hr typical for your domains</p>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 block mb-2">
          Availability: <span className="text-teal-400">{data.availability_hours_per_week}h/week</span>
        </label>
        <input
          type="range"
          min={5}
          max={40}
          step={5}
          value={data.availability_hours_per_week}
          onChange={(e) => onChange({ ...data, availability_hours_per_week: Number(e.target.value) })}
          className="w-full accent-teal-500"
        />
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>5h</span><span>40h</span>
        </div>
      </div>

      <Input
        label="Available from"
        type="date"
        min={today}
        value={data.available_from}
        onChange={(e) => onChange({ ...data, available_from: e.target.value })}
      />
    </div>
  );
}

// Step 4 (UI) = Step 5 (API) — Identity

function DocUploadRow({
  entry, index, total, onChange, onRemove,
}: {
  entry: Step5DocEntry; index: number; total: number;
  onChange: (e: Step5DocEntry) => void; onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — max 10MB'); return; }
    setUploading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
        '/api/v1/contractor/profile/identity-document-file?folder=identity',
        file,
        { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': file.name } },
      );
      onChange({ ...entry, blob_path: res.data.data.blob_path, file_name: file.name });
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400">Document {index + 1}</p>
        {total > 1 && (
          <button type="button" onClick={onRemove} className="text-slate-600 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      <select
        value={entry.type}
        onChange={(e) => onChange({ ...entry, type: e.target.value })}
        className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
      >
        <option value="">Select document type</option>
        <option value="PASSPORT">Passport</option>
        <option value="DRIVERS_LICENCE">Driver&apos;s Licence</option>
        <option value="NATIONAL_ID">National ID Card</option>
        <option value="MEDICARE_CARD">Medicare Card (AU)</option>
        <option value="PROOF_OF_AGE_CARD">Proof of Age Card (AU)</option>
        <option value="IMMICARD">ImmiCard (AU)</option>
        <option value="VISA_WITH_PASSPORT">Visa + Passport</option>
        <option value="BIRTH_CERTIFICATE">Birth Certificate</option>
        <option value="RESIDENCE_PERMIT">Residence Permit / PR Card</option>
        <option value="W8BEN">W-8BEN Form</option>
        <option value="TFN_DECLARATION">TFN Declaration</option>
      </select>
      <div
        onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file && !uploading) void handleFile(file);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
        className={clsx(
          'border-2 border-dashed rounded-xl px-4 py-6 text-center transition-all',
          uploading ? 'cursor-wait border-slate-600 bg-slate-800/20' :
          dragging ? 'cursor-pointer border-teal-500 bg-teal-500/5' :
          'cursor-pointer border-slate-700 hover:border-slate-500 bg-slate-800/30',
        )}
      >
        <Upload size={18} className="mx-auto text-slate-500 mb-2" />
        {uploading ? (
          <p className="text-sm text-slate-400">Uploading…</p>
        ) : entry.file_name ? (
          <p className="text-sm text-teal-400 font-medium">{entry.file_name}</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">Drop file or click to browse</p>
            <p className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG — max 10MB</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f && !uploading) void handleFile(f); }}
        />
      </div>
    </div>
  );
}

function Step5UI({ data, onChange }: { data: Step5Data; onChange: (d: Step5Data) => void }) {
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const [selfieDragging, setSelfieDragging] = useState(false);
  const [selfieUploading, setSelfieUploading] = useState(false);

  function updateDoc(index: number, entry: Step5DocEntry) {
    const docs = [...data.documents];
    docs[index] = entry;
    onChange({ ...data, documents: docs });
  }

  function removeDoc(index: number) {
    onChange({ ...data, documents: data.documents.filter((_, i) => i !== index) });
  }

  function addDoc() {
    onChange({ ...data, documents: [...data.documents, { type: '', blob_path: '', file_name: '' }] });
  }

  async function handleSelfie(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — max 10MB'); return; }
    setSelfieUploading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
        '/api/v1/contractor/profile/identity-document-file?folder=selfie',
        file,
        { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': file.name } },
      );
      onChange({ ...data, selfie_blob_path: res.data.data.blob_path, selfie_file_name: file.name });
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setSelfieUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Identity documents — multiple allowed */}
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-2">
          Identity documents <span className="text-red-400">*</span>
          <span className="text-slate-600 ml-1 font-normal">— upload one or more</span>
        </label>
        <div className="space-y-3">
          {data.documents.map((entry, i) => (
            <DocUploadRow
              key={i}
              entry={entry}
              index={i}
              total={data.documents.length}
              onChange={(e) => updateDoc(i, e)}
              onRemove={() => removeDoc(i)}
            />
          ))}
          {data.documents.length < 5 && (
            <button
              type="button"
              onClick={addDoc}
              className="w-full py-2.5 border border-dashed border-slate-700 rounded-xl text-xs text-slate-500 hover:border-teal-500/50 hover:text-teal-400 transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="text-base leading-none">+</span> Add another document
            </button>
          )}
        </div>
      </div>

      {/* Personal photo / selfie */}
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1">
          Photo of yourself <span className="text-red-400">*</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
          A clear, well-lit photo of your face — used by our compliance team to match your identity documents.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); if (!selfieUploading) setSelfieDragging(true); }}
          onDragLeave={() => setSelfieDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setSelfieDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !selfieUploading) void handleSelfie(file);
          }}
          onClick={() => { if (!selfieUploading) selfieInputRef.current?.click(); }}
          className={clsx(
            'border-2 border-dashed rounded-2xl px-6 py-8 text-center transition-all',
            selfieUploading ? 'cursor-wait border-slate-600 bg-slate-800/20' :
            selfieDragging ? 'cursor-pointer border-teal-500 bg-teal-500/5' :
            'cursor-pointer border-slate-700 hover:border-slate-500 bg-slate-800/50',
          )}
        >
          <div className="text-2xl mb-2">{data.selfie_file_name ? '🤳' : '📷'}</div>
          {selfieUploading ? (
            <p className="text-sm text-slate-400">Uploading…</p>
          ) : data.selfie_file_name ? (
            <p className="text-sm text-teal-400 font-medium">{data.selfie_file_name}</p>
          ) : (
            <>
              <p className="text-sm text-slate-300">Drop your photo here, or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">JPG, PNG — max 10MB — face clearly visible</p>
            </>
          )}
          <input
            ref={selfieInputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && !selfieUploading) void handleSelfie(f); }}
          />
        </div>
        {data.selfie_file_name && (
          <button
            type="button"
            onClick={() => onChange({ ...data, selfie_blob_path: '', selfie_file_name: '' })}
            className="mt-1.5 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
          >
            <X size={11} /> Remove photo
          </button>
        )}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-400">
        🔒 Your documents and photo are encrypted and only viewed by our compliance team during KYC verification.
      </div>
    </div>
  );
}

// ─── ABN validator (ATO algorithm) ───────────────────────────────────────────
function isValidABN(abn: string): boolean {
  const clean = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = clean.split('').map(Number);
  digits[0]! -= 1;
  return digits.reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0) % 89 === 0;
}

// Step 3 (UI) — Tax & Legal Details
interface Step6TaxData {
  abn: string;
  gst_registered: boolean;
  is_foreign_entity: boolean;
  no_abn_reason: string;
  provider_agreement_signed: boolean;
  tax_doc_blob_path: string;
  tax_doc_file_name: string;
}

function Step5TaxUI({ data, onChange }: { data: Step6TaxData; onChange: (d: Step6TaxData) => void }) {
  const abnTouched = data.abn.length > 0;
  const abnValid = data.abn ? isValidABN(data.abn) : null;
  const taxDocInputRef = useRef<HTMLInputElement>(null);
  const [taxDocDragging, setTaxDocDragging] = useState(false);
  const [taxDocUploading, setTaxDocUploading] = useState(false);

  async function handleTaxDocFile(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — max 10MB'); return; }
    setTaxDocUploading(true);
    try {
      const res = await customerApi.post<{ success: boolean; data: { blob_path: string; file_name: string } }>(
        '/api/v1/auth/me/documents?doc_type=TAX_DOCUMENT',
        file,
        { headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': file.name } },
      );
      onChange({
        ...data,
        tax_doc_blob_path: res.data.data.blob_path,
        tax_doc_file_name: file.name,
      });
    } catch {
      toast.error('Upload failed — please try again');
    } finally {
      setTaxDocUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          ABN (Australian Business Number)
          {!data.is_foreign_entity && <span className="text-slate-600 ml-1">— required for AU providers</span>}
        </label>
        <input
          type="text"
          value={data.abn}
          onChange={(e) => onChange({ ...data, abn: e.target.value })}
          placeholder="51 824 753 556"
          maxLength={14}
          className={clsx(
            'w-full px-3 py-2.5 text-sm bg-slate-800 border rounded-xl text-slate-100 outline-none focus:border-teal-500 transition-colors font-mono',
            abnTouched && abnValid === false ? 'border-red-500/60' : 'border-slate-700',
            abnTouched && abnValid === true ? 'border-teal-500/60' : '',
          )}
        />
        {abnTouched && abnValid === false && (
          <p className="text-xs text-red-400 mt-1">Invalid ABN — check the number against your ATO confirmation.</p>
        )}
        {abnTouched && abnValid === true && (
          <p className="text-xs text-teal-400 mt-1">ABN format valid.</p>
        )}
      </div>

      {!data.abn && (
        <div>
          <label className="text-xs font-medium text-slate-400 block mb-1.5">
            No ABN — reason <span className="text-red-400">*</span>
          </label>
          <select
            value={data.no_abn_reason}
            onChange={(e) => onChange({ ...data, no_abn_reason: e.target.value })}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
          >
            <option value="">Select reason</option>
            <option value="NOT_YET_REGISTERED">Not yet registered for an ABN</option>
            <option value="FOREIGN_INDIVIDUAL">Foreign individual (non-AU resident)</option>
            <option value="EXEMPT">Exempt under ATO provisions</option>
          </select>
          <p className="text-xs text-amber-400 mt-1.5">
            Note: invoices without an ABN are subject to 47% tax withholding by the payer (ATO requirement).
          </p>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-slate-400 block mb-2">GST registration</label>
        <div className="space-y-2">
          {[
            { value: true, label: 'GST registered', desc: 'I am registered for GST with the ATO (turnover ≥ $75,000/yr)' },
            { value: false, label: 'Not GST registered', desc: 'My turnover is below the $75,000 threshold' },
          ].map(({ value, label, desc }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => onChange({ ...data, gst_registered: value })}
              className={clsx(
                'w-full text-left px-4 py-3 rounded-xl border text-sm transition-all',
                data.gst_registered === value
                  ? 'bg-teal-500/10 border-teal-500/40 text-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500',
              )}
            >
              <p className="font-medium">{label}</p>
              <p className="text-xs mt-0.5 opacity-70">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 block mb-2">Entity type</label>
        <div className="flex gap-3">
          {[
            { value: false, label: 'Australian entity' },
            { value: true, label: 'Foreign entity' },
          ].map(({ value, label }) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => onChange({ ...data, is_foreign_entity: value })}
              className={clsx(
                'flex-1 text-center px-4 py-3 rounded-xl border text-sm transition-all',
                data.is_foreign_entity === value
                  ? 'bg-teal-500/10 border-teal-500/40 text-slate-100'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-slate-400 block mb-1.5">
          Tax document upload <span className="text-slate-600">(optional)</span>
        </label>
        <p className="text-xs text-slate-500 mb-2">
          Upload any relevant tax documents — W-8BEN, TFN declaration, overseas tax ID, or ATO correspondence.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); if (!taxDocUploading) setTaxDocDragging(true); }}
          onDragLeave={() => setTaxDocDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setTaxDocDragging(false);
            const file = e.dataTransfer.files[0];
            if (file && !taxDocUploading) void handleTaxDocFile(file);
          }}
          onClick={() => { if (!taxDocUploading) taxDocInputRef.current?.click(); }}
          className={clsx(
            'border-2 border-dashed rounded-xl px-4 py-6 text-center transition-all',
            taxDocUploading ? 'cursor-wait border-slate-600 bg-slate-800/20' :
            taxDocDragging ? 'cursor-pointer border-teal-500 bg-teal-500/5' :
            'cursor-pointer border-slate-700 hover:border-slate-500 bg-slate-800/50',
          )}
        >
          <Upload size={18} className="mx-auto text-slate-500 mb-2" />
          {taxDocUploading ? (
            <p className="text-sm text-slate-400">Uploading…</p>
          ) : data.tax_doc_file_name ? (
            <p className="text-sm text-teal-400 font-medium">{data.tax_doc_file_name}</p>
          ) : (
            <>
              <p className="text-sm text-slate-400">Drop file here or click to browse</p>
              <p className="text-xs text-slate-600 mt-0.5">PDF, JPG, PNG — max 10MB</p>
            </>
          )}
          <input
            ref={taxDocInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f && !taxDocUploading) void handleTaxDocFile(f); }}
          />
        </div>
        {data.tax_doc_file_name && (
          <button
            type="button"
            onClick={() => onChange({ ...data, tax_doc_blob_path: '', tax_doc_file_name: '' })}
            className="mt-1.5 text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
          >
            <X size={11} /> Remove file
          </button>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Provider Agreement</p>
        <p className="text-xs text-slate-400 leading-relaxed">
          By checking the box below you accept the{' '}
          <a href="/provider-agreement" target="_blank" rel="noreferrer" className="text-teal-400 underline underline-offset-2">
            Provider Agreement v1.0
          </a>{' '}
          which sets out the terms for providers using the TalvexIT platform.
          TalvexIT is subscription-only with zero commission on engagements — you invoice your customer directly in your own name and they pay you direct on your nominated rail.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={data.provider_agreement_signed}
            onChange={(e) => onChange({ ...data, provider_agreement_signed: e.target.checked })}
            className="mt-0.5 rounded border-slate-600 bg-slate-800 accent-teal-500"
          />
          <span className="text-sm text-slate-300">
            I accept the Provider Agreement
          </span>
        </label>
      </div>
    </div>
  );
}

// Step 6 (UI) = Step 7 (API) — Agreement
function Step6UI({ accepted, onAccept }: { accepted: boolean; onAccept: (v: boolean) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setScrolledToBottom(true);
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-80 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl p-4 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-mono"
      >
        {AGREEMENT_TEXT}
      </div>
      {!scrolledToBottom && (
        <p className="text-xs text-amber-400">Scroll to the bottom to continue</p>
      )}
      <label className={clsx('flex items-start gap-3 cursor-pointer', !scrolledToBottom && 'opacity-50 pointer-events-none')}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAccept(e.target.checked)}
          className="mt-0.5 rounded border-slate-600 bg-slate-800 accent-teal-500"
        />
        <span className="text-sm text-slate-300">
          I have read and agree to the Independent Contractor Platform Agreement v1.0
        </span>
      </label>
    </div>
  );
}

// Step 6 (UI) — Review & Submit
function Step7UI({ allData, email, onEdit }: { allData: AllData; email: string; onEdit: (step: number) => void }) {
  const { step1, step3, step4, step5 } = allData;

  const checks = [
    { ok: !!step1.timezone, label: 'Profile complete' },
    { ok: step3.domains.length > 0, label: `${step3.domains.length} domain${step3.domains.length !== 1 ? 's' : ''} selected` },
    { ok: step4.hourly_rate_aud >= 50, label: `AUD ${step4.hourly_rate_aud}/hr rate set` },
    { ok: step5.documents.some((d) => !!d.blob_path) && !!step5.selfie_blob_path, label: 'Identity documents & photo uploaded' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {checks.map(({ ok, label }) => (
          <div key={label} className="flex items-center gap-3">
            <span className={clsx('text-lg', ok ? 'text-teal-400' : 'text-slate-600')}>
              {ok ? '✓' : '○'}
            </span>
            <span className={clsx('text-sm', ok ? 'text-slate-200' : 'text-slate-500')}>{label}</span>
          </div>
        ))}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700">
        {[
          { label: 'Profile',  summary: step1.timezone || 'Not set', step: 0 },
          { label: 'Domains',  summary: step3.domains.slice(0, 3).map(d => d.replace(/_/g, ' ')).join(', ') || 'None', step: 1 },
          { label: 'Rates',    summary: step4.hourly_rate_aud ? `AUD ${step4.hourly_rate_aud}/hr` : 'Not set', step: 2 },
          { label: 'Identity', summary: step5.documents.filter((d) => d.blob_path).length > 0 ? `${step5.documents.filter((d) => d.blob_path).length} doc(s)${step5.selfie_blob_path ? ' + photo' : ''}` : 'Not uploaded', step: 4 },
        ].map(({ label, summary, step }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className="text-sm text-slate-200">{summary}</p>
            </div>
            <button onClick={() => onEdit(step)} className="text-xs text-teal-400 hover:text-teal-300">Edit</button>
          </div>
        ))}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-400">
        After submission, our team will review your profile. You&apos;ll receive an email at <strong className="text-slate-200">{email}</strong> within 2 business days.
      </div>
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const user = getUser();
  const [uiStep, setUiStep] = useState(0); // 0-6
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [step1, setStep1] = useState<Step1Data>({
    legal_name: '', bio: '', phone: '', timezone: 'Australia/Sydney', linkedin_url: '',
  });
  const [step3, setStep3] = useState<Step3Data>({ domains: [], skills: [] });
  const [step4, setStep4] = useState<Step4Data>({
    hourly_rate_aud: 100, availability_hours_per_week: 20, available_from: new Date().toISOString().split('T')[0],
  });
  const [step5, setStep5] = useState<Step5Data>({
    documents: [{ type: '', blob_path: '', file_name: '' }],
    selfie_blob_path: '',
    selfie_file_name: '',
  });
  const [stepTax, setStepTax] = useState<Step6TaxData>({
    abn: '', gst_registered: false, is_foreign_entity: false,
    no_abn_reason: '', provider_agreement_signed: false,
    tax_doc_blob_path: '', tax_doc_file_name: '',
  });
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  // Load existing profile data and pre-populate form
  useEffect(() => {
    customerApi
      .get<{ success: boolean; data: { profile: ContractorProfile } }>(
        '/api/v1/contractor/profile',
      )
      .then((res) => {
        const p = res.data.data.profile;

        // If INCOMPLETE, stay in onboarding flow normally
        // If ACTIVE/PENDING/SUSPENDED, pre-populate and enter edit mode
        if (p.status !== 'INCOMPLETE') {
          setIsEditMode(true);
        }

        // Pre-populate step 1
        setStep1({
          legal_name: p.legal_name ?? '',
          bio: p.bio ?? '',
          phone: p.phone ?? '',
          timezone: p.timezone ?? 'Australia/Sydney',
          linkedin_url: p.linkedin_url ?? '',
        });

        // Pre-populate step 3 (domains & skills)
        setStep3({
          domains: p.domains ?? [],
          skills: p.skills ?? [],
        });

        // Pre-populate step 4 (rates)
        setStep4({
          hourly_rate_aud: p.hourly_rate_aud ? Number(p.hourly_rate_aud) : 100,
          availability_hours_per_week: p.availability_hours_per_week ?? 20,
          available_from: new Date().toISOString().split('T')[0],
        });
      })
      .catch(() => {});
  }, [router]);

  // Map UI step → API step number (step 3 = tax declaration, handled separately)
  const API_STEPS: Record<number, number> = { 0: 1, 1: 3, 2: 4, 4: 5, 5: 7 };

  async function saveCurrentStep() {
    setStepError(null);

    // ── Step 3: Tax & Legal (custom endpoint) ─────────────────────────────────
    if (uiStep === 3) {
      if (!stepTax.abn.trim() && !stepTax.no_abn_reason) {
        setStepError('Please select a reason for not having an ABN, or enter your ABN above.');
        return false;
      }
      if (!stepTax.provider_agreement_signed) {
        setStepError('You must accept the Provider Agreement to continue.');
        return false;
      }
      if (stepTax.abn && !isValidABN(stepTax.abn)) {
        setStepError('ABN failed validation. Please check the number.');
        return false;
      }
      try {
        await customerApi.patch('/api/v1/contractor/tax-declaration', {
          ...(stepTax.abn.trim() ? { abn: stepTax.abn.trim() } : {}),
          ...(!stepTax.abn.trim() && stepTax.no_abn_reason ? { no_abn_reason: stepTax.no_abn_reason } : {}),
          gst_registered: stepTax.gst_registered,
          is_foreign_entity: stepTax.is_foreign_entity,
          provider_agreement_signed: true,
        });
        return true;
      } catch (err: unknown) {
        const e = err as { response?: { data?: { error?: { message?: string; code?: string } } }; message?: string };
        const msg = e.response?.data?.error?.message ?? 'Could not save tax declaration.';
        setStepError(msg);
        return false;
      }
    }

    const apiStep = API_STEPS[uiStep];
    if (apiStep === undefined) return; // step 6 = review, no save

    let body: Record<string, unknown> = {};
    switch (uiStep) {
      case 0: body = { legal_name: step1.legal_name || undefined, bio: step1.bio || undefined, phone: step1.phone || undefined, timezone: step1.timezone, linkedin_url: step1.linkedin_url || undefined }; break;
      case 1: body = { domains: step3.domains, skills: step3.skills }; break;
      case 2: body = { hourly_rate_aud: step4.hourly_rate_aud, availability_hours_per_week: step4.availability_hours_per_week, available_from: new Date(step4.available_from).toISOString() }; break;
      case 4: {
        const validDocs = step5.documents.filter((d) => d.type && d.blob_path);
        if (validDocs.length === 0) {
          setStepError('Please select a document type and upload at least one identity document.');
          return false;
        }
        if (step5.documents.some((d) => d.blob_path && !d.type)) {
          setStepError('Please select a document type for each uploaded file.');
          return false;
        }
        if (!step5.selfie_blob_path) {
          setStepError('Please upload a photo of yourself.');
          return false;
        }
        body = {
          identity_document_type: validDocs[0]!.type,
          identity_document_blob_path: validDocs[0]!.blob_path,
          identity_documents: validDocs.map((d) => ({ type: d.type, blob_path: d.blob_path })),
          selfie_blob_path: step5.selfie_blob_path,
        };
        break;
      }
      case 5:
        if (!agreementAccepted) { setStepError('Please read and accept the agreement to continue'); return false; }
        body = { agreement_version: 'v1.0', agreement_accepted: true };
        break;
    }

    try {
      await customerApi.patch(`/api/v1/contractor/profile/step/${apiStep}`, body);
      return true;
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string; code?: string; fields?: { field: string; message: string }[] } } }; message?: string };
      const apiError = e.response?.data?.error;
      if (apiError?.fields && apiError.fields.length > 0) {
        setStepError(apiError.fields.map((f) => `${f.field}: ${f.message}`).join(' · '));
      } else if (apiError?.message) {
        setStepError(`${apiError.message}${apiError.code ? ` (${apiError.code})` : ''}`);
      } else if (!e.response) {
        setStepError('Cannot connect to the server. Check that the API is running on port 3001.');
      } else {
        setStepError('An unexpected error occurred. Please try again.');
      }
      console.error('[onboarding] step save failed:', err);
      return false;
    }
  }

  async function handleNext() {
    setSubmitting(true);
    try {
      if (uiStep < 6) {
        const ok = await saveCurrentStep();
        if (ok !== false) setUiStep((s) => s + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      if (isEditMode) {
        // Already active/pending — save the current step then go back to profile
        await saveCurrentStep();
        toast.success('Profile updated');
        router.push('/contractor/profile');
      } else {
        await customerApi.post('/api/v1/contractor/profile/submit');
        setSubmitted(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-6">
          <p className="text-5xl">🎉</p>
          <h1 className="font-display font-bold text-3xl text-slate-100">Application submitted!</h1>
          <p className="text-slate-400">
            Our team will review your application within 2 business days. We&apos;ll email you at{' '}
            <strong className="text-slate-200">{user?.email}</strong> when your account is activated.
          </p>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-left space-y-3">
            <p className="text-sm font-semibold text-slate-300">What happens next:</p>
            {[
              'Admin verifies your identity document',
              'KYC video call is scheduled (1–2 business days)',
              'Account activated automatically after KYC approval',
              'Optionally connect Stripe & upload insurance',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-xs text-teal-400 shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm text-slate-300">{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const progress = (uiStep / (STEP_LABELS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="font-display font-bold text-lg text-slate-100">
              onys<span className="text-teal-400">.</span>online
            </span>
            <span className="text-xs text-slate-500">Step {uiStep + 1} of {STEP_LABELS.length}</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Step labels */}
          <div className="flex justify-between mt-2">
            {STEP_LABELS.map((label, i) => (
              <span
                key={label}
                className={clsx(
                  'text-xs transition-colors hidden sm:block',
                  i === uiStep ? 'text-teal-400 font-medium' : i < uiStep ? 'text-slate-400' : 'text-slate-700',
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <h2 className="font-display font-bold text-xl text-slate-100 mb-1">
            {[
              'Personal Profile',
              'Domains & Skills',
              'Rates & Availability',
              'Tax & Legal Details',
              'Verify Your Identity',
              'Platform Agreement',
              'Submit for Review',
            ][uiStep]}
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            {[
              'Tell clients about yourself',
              'What are your specialties?',
              'Set your hourly rate and availability',
              'ABN, GST registration, and Provider Agreement',
              'Verify your identity — required for compliance',
              'Read and accept the platform terms',
              'Review your application before submission',
            ][uiStep]}
          </p>

          {uiStep === 0 && <Step1 data={step1} onChange={setStep1} />}
          {uiStep === 1 && <Step3UI data={step3} onChange={setStep3} />}
          {uiStep === 2 && <Step4UI data={step4} onChange={setStep4} />}
          {uiStep === 3 && <Step5TaxUI data={stepTax} onChange={setStepTax} />}
          {uiStep === 4 && <Step5UI data={step5} onChange={setStep5} />}
          {uiStep === 5 && <Step6UI accepted={agreementAccepted} onAccept={setAgreementAccepted} />}
          {uiStep === 6 && (
            <Step7UI
              allData={{ step1, step3, step4, step5 }}
              email={user?.email ?? ''}
              onEdit={(s) => setUiStep(s)}
            />
          )}

          {stepError && (
            <div className="mt-6 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {stepError}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {uiStep > 0 && (
              <Button variant="secondary" onClick={() => { setStepError(null); setUiStep((s) => s - 1); }} disabled={submitting}>
                Back
              </Button>
            )}
            {uiStep < 6 ? (
              <Button onClick={() => { void handleNext(); }} loading={submitting} fullWidth={uiStep === 0}>
                {isEditMode ? 'Save & Continue' : 'Continue'}
              </Button>
            ) : (
              <Button onClick={() => { void handleSubmit(); }} loading={submitting} size="lg">
                {isEditMode ? 'Save Changes' : 'Submit for Review'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
