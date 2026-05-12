'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import {
  Shield, ShieldCheck, Star, Settings, Network, Database, Cloud,
  Terminal, Monitor, RefreshCcw, HardDrive, Layers, MailCheck,
  Server, Cpu,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import customerApi from '@/lib/customer-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Currency = 'AUD' | 'USD' | 'GBP' | 'EUR' | 'NZD' | 'SGD' | 'CAD';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  AUD: 'A$', USD: '$', GBP: '£', EUR: '€',
  NZD: 'NZ$', SGD: 'S$', CAD: 'C$',
};

const DOMAIN_META: Record<string, { label: string; Icon: React.ElementType }> = {
  FIREWALL:        { label: 'Firewall',       Icon: Shield },
  NETWORKING:      { label: 'Networking',     Icon: Network },
  DATABASE:        { label: 'Database',       Icon: Database },
  CLOUD_AZURE:     { label: 'Cloud / Azure',  Icon: Cloud },
  LINUX:           { label: 'Linux',          Icon: Terminal },
  WINDOWS_ADMIN:   { label: 'Windows Admin',  Icon: Monitor },
  CYBERSECURITY:   { label: 'Cybersecurity',  Icon: ShieldCheck },
  DEVOPS:          { label: 'DevOps',         Icon: RefreshCcw },
  STORAGE:         { label: 'Storage',        Icon: HardDrive },
  VIRTUALIZATION:  { label: 'Virtualisation', Icon: Layers },
  OFFICE_365:      { label: 'Microsoft 365',  Icon: MailCheck },
  BACKUP:          { label: 'Backup & DR',    Icon: Server },
  AI_INTEGRATION:  { label: 'AI Integration', Icon: Cpu },
  SYSTEM_ADMIN:    { label: 'System Admin',   Icon: Settings },
};

interface RatingCriteria {
  technical_quality: number;
  communication: number;
  timeliness: number;
  documentation: number;
  professionalism: number;
}

interface ContractorProfile {
  id: string;
  full_name: string;
  bio: string | null;
  skills: string[];
  domains: string[];
  photo_url: string | null;
  is_verified: boolean;
  insurance_tier_met: boolean;
  insurance_tier: string | null;
  created_at: string;
  orders_completed: number;
  rating_avg: number | null;
  rating_count: number;
  rating_criteria_avg: RatingCriteria | null;
  rating_visible: boolean;
}

interface Task {
  id: string;
  title: string;
  domain: string;
  objective: string;
  price: number;
  currency: Currency;
  hours_min: number;
  hours_max: number;
}

interface Review {
  id: string;
  customer_name_anon: string;
  overall: number;
  criteria: RatingCriteria;
  review_text: string | null;
  tags: string[];
  contractor_response: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Initials({ name, size = 96 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-teal-500/20 border-2 border-teal-500/40 flex items-center justify-center shrink-0 text-teal-400 font-bold mx-auto"
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {initials}
    </div>
  );
}

function StarRow({ score, size = 14 }: { score: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= Math.round(score) ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}
        />
      ))}
    </div>
  );
}

function CriterionBar({ label, score }: { label: string; score: number }) {
  const pct = Math.round((score / 5) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-teal-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-300 w-6 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const meta = DOMAIN_META[task.domain];
  const DomainIcon = meta?.Icon ?? Settings;
  const sym = CURRENCY_SYMBOLS[task.currency] ?? task.currency;

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group flex flex-col rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 hover:shadow-lg transition-all duration-200 no-underline"
    >
      <div className="px-5 pt-5 pb-3">
        <Badge color="teal">{meta?.label ?? task.domain}</Badge>
      </div>
      <div className="px-5 flex-1 space-y-2">
        <h3 className="font-display font-semibold text-slate-100 text-sm leading-snug line-clamp-2">
          {task.title}
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <DomainIcon size={11} />
          <span>{meta?.label ?? task.domain}</span>
        </div>
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{task.objective}</p>
      </div>
      <div className="px-5 py-4 mt-3 border-t border-slate-800 flex items-center justify-between">
        <span className="font-semibold text-teal-400 text-sm">
          {sym}{Number(task.price).toLocaleString('en-AU')}
          <span className="text-slate-500 font-normal text-xs ml-1">AUD</span>
        </span>
        <span className="text-xs text-slate-500">{task.hours_min}–{task.hours_max}h</span>
      </div>
    </Link>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-200">{review.customer_name_anon}</p>
          <p className="text-xs text-slate-500">{format(new Date(review.created_at), 'd MMM yyyy')}</p>
        </div>
        <div className="text-right">
          <StarRow score={review.overall} size={12} />
          <p className="text-xs text-slate-500 mt-1">
            TQ: {review.criteria.technical_quality} | C: {review.criteria.communication} | T: {review.criteria.timeliness} | D: {review.criteria.documentation} | P: {review.criteria.professionalism}
          </p>
        </div>
      </div>

      {review.review_text && (
        <p className="text-sm text-slate-300 leading-relaxed">{review.review_text}</p>
      )}

      {review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-400">
              {tag}
            </span>
          ))}
        </div>
      )}

      {review.contractor_response && (
        <div className="ml-4 pl-4 border-l-2 border-slate-700 space-y-1">
          <p className="text-xs font-medium text-slate-400">Expert response</p>
          <p className="text-sm text-slate-300 leading-relaxed">{review.contractor_response}</p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContractorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeDomain, setActiveDomain] = useState<string>('all');
  const tasksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      customerApi.get<{ success: boolean; data: ContractorProfile }>(`/api/v1/contractors/${id}/profile`),
      customerApi.get<{ success: boolean; data: { tasks: Task[] } }>(`/api/v1/contractors/${id}/tasks`),
      customerApi.get<{ success: boolean; data: { reviews: Review[]; total: number } }>(`/api/v1/contractors/${id}/reviews?page=1`),
    ])
      .then(([profileRes, tasksRes, reviewsRes]) => {
        setProfile(profileRes.data.data);
        setTasks(tasksRes.data.data.tasks);
        setReviews(reviewsRes.data.data.reviews);
        setReviewTotal(reviewsRes.data.data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function loadMoreReviews() {
    setLoadingMore(true);
    try {
      const next = reviewPage + 1;
      const res = await customerApi.get<{ success: boolean; data: { reviews: Review[]; total: number } }>(
        `/api/v1/contractors/${id}/reviews?page=${next}`,
      );
      setReviews((prev) => [...prev, ...res.data.data.reviews]);
      setReviewPage(next);
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
          <div className="space-y-4">
            <div className="h-96 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-48 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
            <div className="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-400">Profile not found.</p>
      </div>
    );
  }

  const uniqueDomains = Array.from(new Set(tasks.map((t) => t.domain)));
  const showDomainTabs = uniqueDomains.length > 1;
  const filteredTasks = activeDomain === 'all' ? tasks : tasks.filter((t) => t.domain === activeDomain);
  const hasMoreReviews = reviews.length < reviewTotal;
  const insLabel =
    profile.insurance_tier === 'PLATINUM' ? '$5M PI + PL + Cyber' :
    profile.insurance_tier === 'GOLD'     ? '$2M PI + PL + Cyber' :
                                            '$1M PI + PL + Cyber';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 items-start">

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside className="space-y-5 lg:sticky lg:top-6">

          {/* Identity card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-3">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo_url}
                alt={profile.full_name}
                className="w-24 h-24 rounded-full mx-auto object-cover border-2 border-teal-500/40"
              />
            ) : (
              <Initials name={profile.full_name} size={96} />
            )}

            <div>
              <h1 className="font-display font-bold text-xl text-slate-100">{profile.full_name}</h1>
              {profile.is_verified && (
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <ShieldCheck size={13} className="text-teal-400" />
                  <span className="text-xs text-teal-400 font-medium">Verified Expert</span>
                </div>
              )}
            </div>

            {/* Domains */}
            {profile.domains.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {profile.domains.map((d) => (
                  <Badge key={d} color="teal">{DOMAIN_META[d]?.label ?? d}</Badge>
                ))}
              </div>
            )}

            <div className="pt-1 text-xs text-slate-500 space-y-1">
              <p>Member since {format(new Date(profile.created_at), 'MMMM yyyy')}</p>
              <p>{profile.orders_completed} completed orders</p>
            </div>

            <Button
              fullWidth
              onClick={() => tasksRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Book a Task
            </Button>
          </div>

          {/* Rating summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ratings</h2>

            {profile.rating_visible && profile.rating_avg !== null && profile.rating_criteria_avg ? (
              <>
                <div className="flex items-end gap-3">
                  <span className="font-display font-bold text-4xl text-teal-400">
                    {profile.rating_avg.toFixed(1)}
                  </span>
                  <div className="pb-1">
                    <StarRow score={profile.rating_avg} size={14} />
                    <p className="text-xs text-slate-500 mt-1">{profile.rating_count} completed orders</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <CriterionBar label="Technical Quality"  score={profile.rating_criteria_avg.technical_quality} />
                  <CriterionBar label="Communication"      score={profile.rating_criteria_avg.communication} />
                  <CriterionBar label="Timeliness"         score={profile.rating_criteria_avg.timeliness} />
                  <CriterionBar label="Documentation"      score={profile.rating_criteria_avg.documentation} />
                  <CriterionBar label="Professionalism"    score={profile.rating_criteria_avg.professionalism} />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Insufficient ratings to display scores.</p>
            )}
          </div>

          {/* Insurance */}
          {profile.insurance_tier_met && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 flex items-center gap-3">
              <Shield size={16} className="text-teal-400 shrink-0" />
              <p className="text-xs text-slate-300">Insured to {insLabel}</p>
            </div>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main className="space-y-8 min-w-0">

          {/* About */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-semibold text-slate-100">About</h2>
            {profile.bio ? (
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
            ) : (
              <p className="text-sm text-slate-500 italic">This expert hasn&apos;t added a bio yet.</p>
            )}

            {profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {profile.skills.map((skill) => (
                  <span key={skill} className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Task listings */}
          <section ref={tasksRef} className="space-y-4">
            <h2 className="font-display font-semibold text-slate-100 text-lg">
              {profile.full_name.split(' ')[0]}&apos;s Task Listings
            </h2>

            {showDomainTabs && (
              <div className="flex gap-1 flex-wrap">
                {(['all', ...uniqueDomains] as string[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setActiveDomain(d)}
                    className={clsx(
                      'px-3 py-1.5 text-xs rounded-lg border transition-colors',
                      activeDomain === d
                        ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200',
                    )}
                  >
                    {d === 'all' ? 'All' : (DOMAIN_META[d]?.label ?? d)}
                  </button>
                ))}
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-12 text-center">
                <p className="text-slate-400 text-sm">No published tasks yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </section>

          {/* Reviews */}
          <section className="space-y-4">
            <h2 className="font-display font-semibold text-slate-100 text-lg">
              Reviews ({reviewTotal})
            </h2>

            {reviews.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-6 py-12 text-center">
                <p className="text-slate-400 text-sm">No reviews yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}

                {hasMoreReviews && (
                  <div className="flex justify-center pt-2">
                    <Button variant="secondary" loading={loadingMore} onClick={() => { void loadMoreReviews(); }}>
                      Load more reviews
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
