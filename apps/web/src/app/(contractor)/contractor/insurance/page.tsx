'use client';

import { useEffect, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';
import { BRAND } from '@/lib/brand';

type Color = 'teal' | 'amber' | 'red' | 'slate' | 'green' | 'blue';

const STATUS_CFG: Record<string, { label: string; color: Color }> = {
  VERIFIED:       { label: 'Verified',       color: 'green' },
  PENDING_REVIEW: { label: 'Pending Review', color: 'amber' },
  REJECTED:       { label: 'Rejected',       color: 'red'   },
  EXPIRED:        { label: 'Expired',        color: 'red'   },
};

const INS_TYPES = [
  { key: 'PL',    label: 'Public Liability' },
  { key: 'PI',    label: 'Professional Indemnity' },
  { key: 'CYBER', label: 'Cyber Liability' },
  { key: 'OTHER', label: 'Other Insurance' },
];

interface Certificate {
  id: string;
  insurance_type: string;
  insurer_name: string;
  coverage_amount_aud: number;
  policy_expiry_date: string;
  status: string;
  admin_notes?: string | null;
}

interface InsuranceResp { certificates: Certificate[] }

const EMPTY_FORM = {
  insurance_type: 'PL' as 'PL' | 'PI' | 'CYBER',
  insurer_name: '',
  policy_number: '',
  coverage_amount_aud: 1000000,
  policy_start_date: '',
  policy_expiry_date: '',
};

export default function InsurancePage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fetchCerts = useCallback(async () => {
    try {
      const res = await customerApi.get<{ success: boolean; data: InsuranceResp }>('/api/v1/contractor/insurance');
      setCerts(res.data.data.certificates);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchCerts(); }, [fetchCerts]);

  function handleFile(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large — max 10MB'); return; }
    if (!file.name.endsWith('.pdf')) { toast.error('PDF only'); return; }
    setSelectedFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) { toast.error('Please upload a certificate PDF'); return; }
    if (!form.policy_start_date || !form.policy_expiry_date) { toast.error('Start and expiry dates are required'); return; }

    setUploading(true);
    try {
      // Step 1: Upload PDF binary to API — API uploads to Azure server-side (no CORS needed)
      const uploadRes = await customerApi.post<{ success: boolean; data: { blob_path: string } }>(
        '/api/v1/contractor/insurance/upload',
        selectedFile,
        { headers: { 'Content-Type': 'application/pdf', 'X-File-Name': selectedFile.name } },
      );
      const { blob_path } = uploadRes.data.data;

      // Step 2: Submit certificate metadata
      await customerApi.post('/api/v1/contractor/insurance', {
        insurer_name: form.insurer_name,
        policy_number: form.policy_number,
        insurance_type: form.insurance_type,
        coverage_amount_aud: form.coverage_amount_aud,
        policy_start_date: new Date(form.policy_start_date).toISOString(),
        policy_expiry_date: new Date(form.policy_expiry_date).toISOString(),
        worldwide_coverage: true,
        certificate_blob_path: blob_path,
      });

      toast.success('Certificate submitted for review');
      setForm(EMPTY_FORM);
      setSelectedFile(null);
      void fetchCerts();
    } catch (err) {
      // customer-api interceptor shows toast for API errors (4xx/5xx)
      // Show a generic message for unexpected failures (network, etc.)
      if (!err || typeof err !== 'object' || !('response' in err)) {
        toast.error('Upload failed — check your connection and try again');
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <h1 className="font-display font-bold text-2xl text-slate-100">Insurance</h1>

      <div className="grid lg:grid-cols-3 gap-6 items-start">

      <div className="lg:col-span-2 space-y-8">

      {/* Current certificates */}
      <section>
        <h2 className="font-display font-semibold text-lg text-slate-100 mb-4">Current Certificates</h2>
        {loading ? (
          <div className="space-y-2">
            {[1,2].map((i) => <div key={i} className="h-20 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />)}
          </div>
        ) : certs.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-10 text-center">
            <p className="text-slate-400">No certificates uploaded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {certs.map((cert) => {
              const cfg = STATUS_CFG[cert.status] ?? { label: cert.status, color: 'slate' as Color };
              const typeLabel = INS_TYPES.find((t) => t.key === cert.insurance_type)?.label ?? cert.insurance_type;
              return (
                <div key={cert.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-100">{typeLabel}</p>
                      <p className="text-sm text-slate-400 mt-0.5">{cert.insurer_name}</p>
                    </div>
                    <Badge color={cfg.color}>{cfg.label}</Badge>
                  </div>
                  <div className="flex gap-6 mt-3 text-sm text-slate-400">
                    <span>AUD {Number(cert.coverage_amount_aud).toLocaleString('en-AU')}</span>
                    <span>Expires {format(new Date(cert.policy_expiry_date), 'd MMM yyyy')}</span>
                  </div>
                  {cert.status === 'REJECTED' && cert.admin_notes && (
                    <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-start gap-2">
                      <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-300">{cert.admin_notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Upload new */}
      <section>
        <h2 className="font-display font-semibold text-lg text-slate-100 mb-4">Upload New Certificate</h2>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Insurance Type</label>
              <select
                value={form.insurance_type}
                onChange={(e) => setForm((f) => ({ ...f, insurance_type: e.target.value as 'PL' | 'PI' | 'CYBER' }))}
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              >
                {INS_TYPES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Insurer name</label>
              <input
                value={form.insurer_name}
                onChange={(e) => setForm((f) => ({ ...f, insurer_name: e.target.value }))}
                required
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                placeholder="e.g. Allianz Australia"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Policy number</label>
              <input
                value={form.policy_number}
                onChange={(e) => setForm((f) => ({ ...f, policy_number: e.target.value }))}
                required
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
                placeholder="e.g. PL-2026-123456"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Coverage amount (AUD)</label>
              <input
                type="number"
                min={1}
                value={form.coverage_amount_aud}
                onChange={(e) => setForm((f) => ({ ...f, coverage_amount_aud: Number(e.target.value) }))}
                required
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Policy start date</label>
              <input
                type="date"
                value={form.policy_start_date}
                onChange={(e) => setForm((f) => ({ ...f, policy_start_date: e.target.value }))}
                required
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 block mb-1.5">Policy expiry date</label>
              <input
                type="date"
                value={form.policy_expiry_date}
                onChange={(e) => setForm((f) => ({ ...f, policy_expiry_date: e.target.value }))}
                required
                className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Worldwide coverage note */}
          <p className="text-xs text-slate-500">
            All certificates must have worldwide coverage. Certificates without worldwide coverage cannot be accepted.
          </p>

          {/* File upload */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`border-2 border-dashed rounded-2xl px-6 py-8 text-center transition-all cursor-pointer ${dragging ? 'border-teal-500 bg-teal-500/5' : 'border-slate-700 hover:border-slate-500'}`}
          >
            <Upload size={22} className="mx-auto text-slate-500 mb-2" />
            {selectedFile ? (
              <p className="text-sm text-teal-400">{selectedFile.name}</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  Drag PDF here, or{' '}
                  <label className="text-teal-400 cursor-pointer hover:text-teal-300">
                    browse
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  </label>
                </p>
                <p className="text-xs text-slate-500 mt-1">PDF only — max 10MB</p>
              </>
            )}
          </div>

          <Button type="submit" loading={uploading}>Submit Certificate</Button>
        </form>
      </section>

      </div>{/* end LEFT (col-span-2) */}

      {/* RIGHT: Coverage requirements sidebar */}
      <aside className="lg:col-span-1 space-y-6">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
          <h3 className="font-semibold text-blue-300 text-sm mb-2">Coverage Requirements</h3>
          <p className="text-xs text-slate-400 mb-3">
            Based on your domains, you may require HIGH_RISK coverage:
          </p>
          <ul className="space-y-1 text-xs text-slate-300">
            <li>• Professional Indemnity: $1M minimum</li>
            <li>• Public Liability: $1M minimum</li>
            <li>• Cyber Liability: $1M minimum (for CYBERSECURITY / AI_INTEGRATION)</li>
          </ul>
        </div>

        {/* Compliance contact — pulled from BRAND so the address can be
            overridden per-deployment via NEXT_PUBLIC_COMPLIANCE_EMAIL. */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-slate-400 font-medium">Required coverage:</span> Public Liability /
            PL (min AUD 5M) and Professional Indemnity / PI (min AUD 2M) are required to take on
            platform orders. Certificates are reviewed within 1–2 business days. Contact{' '}
            <a
              href={`mailto:${BRAND.email.compliance}`}
              className="text-teal-400 hover:text-teal-300 underline-offset-2 hover:underline"
            >
              {BRAND.email.compliance}
            </a>{' '}
            with questions.
          </p>
        </div>
      </aside>

      </div>{/* end two-column grid */}
    </div>
  );
}
