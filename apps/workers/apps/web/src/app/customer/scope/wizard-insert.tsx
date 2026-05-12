// ─── Step 3 Select — Path selector ───────────────────────────────────────────

function Step3Select({ onDirect, onTender }: { onDirect: () => void; onTender: (path: 'A' | 'B') => void }) {
  return (
    <div className="space-y-8 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">How do you want to proceed?</h2>
        <p className="mt-1 text-sm text-slate-400">Choose how to engage providers for your project.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <button
          onClick={onDirect}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-teal-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mb-4">
            <CheckCircle2 size={18} className="text-teal-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Place order</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Book directly from the catalog. No proposal needed — instant start.</p>
        </button>

        <button
          onClick={() => onTender('A')}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-blue-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4">
            <Users size={18} className="text-blue-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Invite specific providers</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Search and hand-pick companies or contractors you know and trust.</p>
        </button>

        <button
          onClick={() => onTender('B')}
          className="text-left rounded-2xl border border-slate-700 bg-slate-900 p-5 hover:border-purple-500 transition-colors"
        >
          <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4">
            <Zap size={18} className="text-purple-400" />
          </div>
          <h3 className="font-semibold text-slate-100 mb-1">Find matching providers</h3>
          <p className="text-xs text-slate-500 leading-relaxed">Set eligibility criteria and let the platform match qualified providers automatically.</p>
        </button>
      </div>
    </div>
  );
}

// ─── Provider result card ─────────────────────────────────────────────────────

interface ProviderCard {
  profile_id?: string;
  company_id?: string;
  user_id?: string;
  primary_admin_id?: string;
  full_name?: string;
  company_name?: string;
  domains: string[];
  overall_rating: number | null;
  completed_orders_count: number;
  is_foreign_entity?: boolean;
}

function ProviderResultCard({
  provider,
  selected,
  onToggle,
}: {
  provider: ProviderCard;
  selected: boolean;
  onToggle: () => void;
}) {
  const name = provider.full_name ?? provider.company_name ?? 'Unknown';
  const rating = provider.overall_rating;
  const isCompany = !!provider.company_id;
  return (
    <button
      onClick={onToggle}
      className={clsx(
        'w-full text-left rounded-xl border p-4 transition-colors',
        selected ? 'border-teal-500 bg-teal-500/5' : 'border-slate-700 bg-slate-900 hover:border-slate-600',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-slate-100 truncate">{name}</span>
            {isCompany && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/20">
                Company
              </span>
            )}
            {provider.is_foreign_entity && (
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                Overseas
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {provider.domains.slice(0, 3).map((d) => (
              <span key={d} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {DOMAIN_LABELS[d] ?? d}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            {rating !== null && <span>★ {rating.toFixed(1)}</span>}
            <span>{provider.completed_orders_count} orders</span>
          </div>
        </div>
        <div className={clsx(
          'h-5 w-5 rounded-full border-2 shrink-0 mt-0.5 transition-colors',
          selected ? 'border-teal-500 bg-teal-500' : 'border-slate-600',
        )} />
      </div>
    </button>
  );
}

// ─── Step 3A — Direct provider search (Path A) ────────────────────────────────

interface SelectedProvider { type: 'contractor' | 'company'; id: string; userId?: string }

function Step3ASearch({
  scope,
  onNext,
  onBack,
}: {
  scope: EditableScope;
  onNext: (selected: SelectedProvider[]) => void;
  onBack: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ individual_contractors: ProviderCard[]; companies: ProviderCard[] }>({ individual_contractors: [], companies: [] });
  const [selected, setSelected] = useState<SelectedProvider[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (scope.domain) params.set('domain', scope.domain);
      if (q.trim()) params.set('q', q.trim());
      const res = await customerApi.get<{ success: boolean; data: { individual_contractors: ProviderCard[]; companies: ProviderCard[] } }>(
        `/api/v1/tenders/providers/search?${params}`,
      );
      setResults(res.data.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void search(); }, []);

  function toggle(p: ProviderCard) {
    const key = p.profile_id ?? p.company_id ?? '';
    const type: 'contractor' | 'company' = p.company_id ? 'company' : 'contractor';
    const userId = p.user_id ?? p.primary_admin_id ?? '';
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === key);
      return exists ? prev.filter((s) => s.id !== key) : [...prev, { type, id: key, userId }];
    });
  }

  const isSelected = (p: ProviderCard) => selected.some((s) => s.id === (p.profile_id ?? p.company_id ?? ''));
  const all = [...results.individual_contractors, ...results.companies];

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Select providers</h2>
        <p className="mt-1 text-sm text-slate-400">Search by name or browse {DOMAIN_LABELS[scope.domain] ?? scope.domain} providers.</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="Search by name…"
          className="flex-1 px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
        />
        <Button variant="secondary" onClick={() => void search()} loading={loading}>Search</Button>
      </div>

      {all.length === 0 && !loading && (
        <p className="text-sm text-slate-500 text-center py-8">No providers found. Try a different search.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {all.map((p) => (
          <ProviderResultCard
            key={p.profile_id ?? p.company_id}
            provider={p}
            selected={isSelected(p)}
            onToggle={() => toggle(p)}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-teal-400">{selected.length} provider{selected.length > 1 ? 's' : ''} selected</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth disabled={selected.length === 0} onClick={() => onNext(selected)}>
          Continue with {selected.length || 0} provider{selected.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3B — Eligibility criteria (Path B) ─────────────────────────────────

interface EligibilityCriteria {
  provider_types: Array<'individual' | 'company' | 'overseas'>;
  requires_kyc: boolean;
  requires_insurance: boolean;
  min_experience_years: number;
  required_certs: string[];
}

function Step3BCriteria({
  onNext,
  onBack,
}: {
  onNext: (criteria: EligibilityCriteria) => void;
  onBack: () => void;
}) {
  const [criteria, setCriteria] = useState<EligibilityCriteria>({
    provider_types: ['individual', 'company'],
    requires_kyc: false,
    requires_insurance: false,
    min_experience_years: 0,
    required_certs: [],
  });
  const [certInput, setCertInput] = useState('');

  function toggleType(t: 'individual' | 'company' | 'overseas') {
    setCriteria((c) => ({
      ...c,
      provider_types: c.provider_types.includes(t)
        ? c.provider_types.filter((x) => x !== t)
        : [...c.provider_types, t],
    }));
  }

  function addCert() {
    const cert = certInput.trim();
    if (cert && !criteria.required_certs.includes(cert)) {
      setCriteria((c) => ({ ...c, required_certs: [...c.required_certs, cert] }));
    }
    setCertInput('');
  }

  return (
    <div className="space-y-6 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Eligibility criteria</h2>
        <p className="mt-1 text-sm text-slate-400">The platform will invite providers matching all selected criteria.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Provider types</p>
        <div className="flex flex-wrap gap-2">
          {([['individual', 'Individual contractors'], ['company', 'Australian companies'], ['overseas', 'Overseas companies']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => toggleType(val)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                criteria.provider_types.includes(val)
                  ? 'bg-teal-500/15 border-teal-500 text-teal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Compliance requirements</p>
        <div className="space-y-2">
          {([
            ['requires_kyc', 'Identity verified (KYC approved)'],
            ['requires_insurance', 'Insurance coverage verified'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={criteria[key]}
                onChange={(e) => setCriteria((c) => ({ ...c, [key]: e.target.checked }))}
                className="h-4 w-4 rounded accent-teal-500"
              />
              <span className="text-sm text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Minimum completed orders</p>
        <input
          type="number"
          min={0}
          max={100}
          value={criteria.min_experience_years}
          onChange={(e) => setCriteria((c) => ({ ...c, min_experience_years: Number(e.target.value) }))}
          className="w-32 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Required certifications</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCert()}
            placeholder="e.g. CISSP, ISO27001…"
            className="flex-1 px-3 py-2 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-600 focus:border-teal-500 focus:outline-none"
          />
          <Button variant="secondary" onClick={addCert}>Add</Button>
        </div>
        {criteria.required_certs.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {criteria.required_certs.map((cert) => (
              <span key={cert} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
                {cert}
                <button
                  onClick={() => setCriteria((c) => ({ ...c, required_certs: c.required_certs.filter((x) => x !== cert) }))}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth disabled={criteria.provider_types.length === 0} onClick={() => onNext(criteria)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4 Tender Confirm — deadline + publish ───────────────────────────────

function Step4TenderConfirm({
  scope,
  jobId,
  path,
  selectedProviders,
  eligibilityCriteria,
  onBack,
}: {
  scope: EditableScope;
  jobId: string;
  path: 'A' | 'B';
  selectedProviders: SelectedProvider[];
  eligibilityCriteria: EligibilityCriteria | null;
  onBack: () => void;
}) {
  const router = useRouter();
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [maxProposals, setMaxProposals] = useState(5);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  async function handlePublish() {
    setError('');
    setPublishing(true);
    try {
      if (path === 'A') {
        const contractorUserIds = selectedProviders.filter((s) => s.type === 'contractor').map((s) => s.userId ?? s.id);
        const companyIds = selectedProviders.filter((s) => s.type === 'company').map((s) => s.id);
        const res = await customerApi.post<{ success: boolean; data: { tender: { id: string } } }>(
          '/api/v1/tenders/publish/direct',
          { pending_scope_id: jobId, contractor_user_ids: contractorUserIds, company_ids: companyIds, deadline_days: deadlineDays, max_proposals: maxProposals },
        );
        router.push(`/customer/tenders/${res.data.data.tender.id}`);
      } else {
        const res = await customerApi.post<{ success: boolean; data: { tender: { id: string } } }>(
          '/api/v1/tenders/publish/auto-match',
          { pending_scope_id: jobId, eligibility_criteria: { ...eligibilityCriteria, domain: scope.domain }, deadline_days: deadlineDays, max_proposals: maxProposals },
        );
        router.push(`/customer/tenders/${res.data.data.tender.id}`);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Failed to publish tender. Please try again.');
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-8 mt-8">
      <div>
        <h2 className="font-display font-bold text-2xl text-slate-100">Confirm &amp; publish tender</h2>
        <p className="mt-1 text-sm text-slate-400">
          {path === 'A'
            ? `Inviting ${selectedProviders.length} provider${selectedProviders.length !== 1 ? 's' : ''} to submit proposals.`
            : 'Platform will automatically invite matching providers.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Project scope</p>
        <p className="font-semibold text-slate-100 text-base">{scope.title}</p>
        <p className="text-sm text-slate-400 mt-1">{scope.objective.slice(0, 120)}{scope.objective.length > 120 ? '…' : ''}</p>
        <div className="flex gap-3 mt-3 text-xs text-slate-500">
          <span>{DOMAIN_LABELS[scope.domain] ?? scope.domain}</span>
          <span>·</span>
          <span>{scope.currency} {scope.price.toLocaleString()}</span>
          <span>·</span>
          <span>{scope.hours_min}–{scope.hours_max} hrs</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Proposal deadline</label>
          <select
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
          >
            {[3, 5, 7, 10, 14, 21, 30].map((d) => (
              <option key={d} value={d}>{d} days ({new Date(Date.now() + d * 86_400_000).toLocaleDateString('en-AU')})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Max proposals</label>
          <select
            value={maxProposals}
            onChange={(e) => setMaxProposals(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-slate-800 border border-slate-700 rounded-xl text-slate-200 focus:border-teal-500 focus:outline-none"
          >
            {[1, 2, 3, 5, 7, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n} proposal{n !== 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 text-sm text-slate-400">
        <p>Invitations sent immediately. Providers have until <strong className="text-slate-200">{new Date(Date.now() + deadlineDays * 86_400_000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</strong> to submit proposals.</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">{error}</div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack}>Back</Button>
        <Button fullWidth size="lg" loading={publishing} onClick={() => { void handlePublish(); }}>
          Publish Tender
        </Button>
      </div>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

function ScopeWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [jobId, setJobId] = useState('');
  const [generatedScope, setGeneratedScope] = useState<EditableScope | null>(null);
  const [tenderPath, setTenderPath] = useState<'A' | 'B'>('A');
  const [selectedProviders, setSelectedProviders] = useState<SelectedProvider[]>([]);
  const [eligibilityCriteria, setEligibilityCriteria] = useState<EligibilityCriteria | null>(null);

  async function handleGenerate(payload: GeneratePayload) {
    const res = await customerApi.post<{ success: boolean; data: { job_id: string } }>(
      '/api/v1/scoping/generate',
      payload,
    );
    setJobId(res.data.data.job_id);
    setStep('2a');
  }

  async function handleAccept(finalScope: EditableScope) {
    await customerApi.post(`/api/v1/scoping/${jobId}/accept`, { scope: finalScope });
    setGeneratedScope(finalScope);
    setStep('3-select');
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <StepIndicator step={step} />

      {step === 1 && <Step1 onGenerate={handleGenerate} />}

      {step === '2a' && (
        <GeneratingState
          jobId={jobId}
          onComplete={(scope) => { setGeneratedScope(scope); setStep('2b'); }}
          onRetry={() => setStep(1)}
        />
      )}

      {step === '2b' && generatedScope && (
        <ScopeReview scope={generatedScope} jobId={jobId} onAccept={handleAccept} />
      )}

      {step === '3-select' && (
        <Step3Select
          onDirect={() => setStep('4-order')}
          onTender={(path) => { setTenderPath(path); setStep(path === 'A' ? '3a' : '3b'); }}
        />
      )}

      {step === '3a' && generatedScope && (
        <Step3ASearch
          scope={generatedScope}
          onNext={(sel) => { setSelectedProviders(sel); setStep('4-tender'); }}
          onBack={() => setStep('3-select')}
        />
      )}

      {step === '3b' && (
        <Step3BCriteria
          onNext={(crit) => { setEligibilityCriteria(crit); setStep('4-tender'); }}
          onBack={() => setStep('3-select')}
        />
      )}

      {step === '4-order' && generatedScope && (
        <Step3Confirm scope={generatedScope} jobId={jobId} onBack={() => setStep('3-select')} />
      )}

      {step === '4-tender' && generatedScope && (
        <Step4TenderConfirm
          scope={generatedScope}
          jobId={jobId}
          path={tenderPath}
          selectedProviders={selectedProviders}
          eligibilityCriteria={eligibilityCriteria}
          onBack={() => setStep(tenderPath === 'A' ? '3a' : '3b')}
        />
      )}
    </div>
  );
}

