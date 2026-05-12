'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Star, MapPin, Shield, Network, Database, Cloud, Terminal, Monitor,
  ShieldCheck, RefreshCcw, HardDrive, Layers, MailCheck, Server, Cpu,
  Settings, Clock, CheckCircle2,
} from 'lucide-react';
import customerApi from '@/lib/customer-api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

// ─── Domain meta ─────────────────────────────────────────────────────────────

const DOMAIN_META: Record<string, { label: string; Icon: React.ElementType }> = {
  FIREWALL:        { label: 'Firewall',        Icon: Shield },
  NETWORKING:      { label: 'Networking',      Icon: Network },
  DATABASE:        { label: 'Database',        Icon: Database },
  CLOUD_AZURE:     { label: 'Cloud / Azure',   Icon: Cloud },
  LINUX:           { label: 'Linux',           Icon: Terminal },
  WINDOWS_ADMIN:   { label: 'Windows Admin',   Icon: Monitor },
  CYBERSECURITY:   { label: 'Cybersecurity',   Icon: ShieldCheck },
  DEVOPS:          { label: 'DevOps',          Icon: RefreshCcw },
  STORAGE:         { label: 'Storage',         Icon: HardDrive },
  VIRTUALIZATION:  { label: 'Virtualization',  Icon: Layers },
  OFFICE_365:      { label: 'Office 365',      Icon: MailCheck },
  BACKUP:          { label: 'Backup',          Icon: Server },
  AI_INTEGRATION:  { label: 'AI Integration',  Icon: Cpu },
  SYSTEM_ADMIN:    { label: 'System Admin',    Icon: Settings },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompanyMember {
  id: string;
  role: string;
  domains: string[];
  user: { full_name: string };
}

interface CompanyTask {
  id: string;
  title: string;
  domain: string;
  price_aud: number;
  estimated_hours: number;
  status: string;
}

interface CompanyReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer: { full_name: string };
}

interface CompanyProfile {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  domains: string[];
  status: string;
  abn: string;
  avg_rating: number | null;
  rating_count: number;
  members: CompanyMember[];
  tasks: CompanyTask[];
  reviews: CompanyReview[];
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: CompanyTask }) {
  const meta = DOMAIN_META[task.domain];
  const Icon = meta?.Icon ?? Settings;
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-colors space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-teal-400" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm line-clamp-2 leading-snug">{task.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{meta?.label ?? task.domain.replace(/_/g, ' ')}</p>
        </div>
      </div>
      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-teal-400 font-bold text-sm">AUD {Number(task.price_aud).toFixed(0)}</p>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <Clock size={10} /> ~{task.estimated_hours}h
          </p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href={`/tasks/${task.id}`}>View →</Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={13}
          className={n <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanyProfilePage() {
  const { id } = useParams<{ id: string }>();

  const { data: company, isLoading, isError } = useQuery({
    queryKey: ['company-public', id],
    queryFn: () =>
      customerApi
        .get<{ success: boolean; data: CompanyProfile }>(`/api/v1/companies/${id}/profile`)
        .then((r) => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-8">
          <Skeleton height={200} />
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={160} />)}
          </div>
        </div>
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Company not found.</p>
      </div>
    );
  }

  const publicMembers = company.members.filter((m) =>
    ['COMPANY_ADMIN', 'SENIOR_CONSULTANT'].includes(m.role),
  );

  const roleLabel: Record<string, string> = {
    COMPANY_ADMIN: 'Company Admin',
    SENIOR_CONSULTANT: 'Senior Consultant',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero */}
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <div className="flex items-start gap-6">
            {/* Logo */}
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              {company.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover rounded-2xl" />
              ) : (
                <span className="text-3xl font-bold text-amber-400">{company.name[0]}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-display font-bold text-slate-100">{company.name}</h1>
                {company.status === 'ACTIVE' && (
                  <span className="flex items-center gap-1 text-xs text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-2.5 py-0.5">
                    <CheckCircle2 size={11} /> Verified
                  </span>
                )}
              </div>

              {(company.city || company.country) && (
                <p className="flex items-center gap-1.5 text-sm text-slate-400 mt-1">
                  <MapPin size={13} />
                  {[company.city, company.country].filter(Boolean).join(', ')}
                </p>
              )}

              {company.avg_rating != null && (
                <div className="flex items-center gap-2 mt-2">
                  <Stars rating={company.avg_rating} />
                  <span className="text-sm font-semibold text-amber-400">{company.avg_rating.toFixed(1)}</span>
                  <span className="text-xs text-slate-500">({company.rating_count} reviews)</span>
                </div>
              )}

              {company.bio && (
                <p className="text-sm text-slate-400 mt-3 max-w-xl leading-relaxed">{company.bio}</p>
              )}

              <div className="flex flex-wrap gap-2 mt-3">
                {company.domains.map((d) => {
                  const meta = DOMAIN_META[d];
                  const Icon = meta?.Icon ?? Settings;
                  return (
                    <Badge key={d} color="teal" className="flex items-center gap-1 text-xs">
                      <Icon size={10} />
                      {meta?.label ?? d.replace(/_/g, ' ')}
                    </Badge>
                  );
                })}
              </div>

              {company.website_url && (
                <a
                  href={company.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-teal-400 hover:underline"
                >
                  {company.website_url}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10 space-y-12">
        {/* Services */}
        {company.tasks.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold text-slate-100 mb-4">Services</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {company.tasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </section>
        )}

        {/* Team */}
        {publicMembers.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold text-slate-100 mb-4">Our Team</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicMembers.map((m) => (
                <div key={m.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-slate-300 shrink-0">
                      {m.user.full_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{m.user.full_name}</p>
                      <p className="text-xs text-slate-500">{roleLabel[m.role] ?? m.role}</p>
                    </div>
                  </div>
                  {m.domains.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {m.domains.slice(0, 3).map((d) => (
                        <Badge key={d} color="slate" className="text-xs">
                          {DOMAIN_META[d]?.label ?? d.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                      {m.domains.length > 3 && (
                        <Badge color="slate" className="text-xs">+{m.domains.length - 3}</Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Reviews */}
        {company.reviews.length > 0 && (
          <section>
            <h2 className="text-lg font-display font-semibold text-slate-100 mb-4">Reviews</h2>
            <div className="space-y-4">
              {company.reviews.map((r) => (
                <div key={r.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                      {r.reviewer.full_name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">{r.reviewer.full_name}</p>
                      <Stars rating={r.rating} />
                    </div>
                    <span className="ml-auto text-xs text-slate-500">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {r.comment && (
                    <p className="text-sm text-slate-400 leading-relaxed">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {company.tasks.length === 0 && company.reviews.length === 0 && publicMembers.length === 0 && (
          <p className="text-slate-500 text-center py-16">No public information yet.</p>
        )}
      </div>
    </div>
  );
}
