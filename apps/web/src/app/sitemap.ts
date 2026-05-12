import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { IT_DOMAINS } from '@/lib/it-domains';
import { GLOSSARY } from '@/lib/glossary';

// Sitemap is generated server-side and cached for an hour (revalidate: 3600
// inside the API fetch). Includes:
//   - static marketing routes
//   - the 28 /services/[slug] specialisation pages
//   - the glossary index plus every term page
//   - every PUBLIC /tasks/[id] catalogue listing pulled from the API
//
// Contractor and company DETAIL pages are intentionally NOT included.
// We only expose the task catalogue publicly; individual provider
// profiles are gated behind authentication. The /contractors and
// /companies index landing pages are also omitted from the sitemap so
// crawlers don't try to deep-link into pages they'd hit a wall on.

interface SitemapEntry {
  url: string;
  lastModified: Date;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

interface PublicTask {
  id: string;
  updated_at?: string | null;
}

interface PublicTaskListResponse {
  tasks: PublicTask[];
  total: number;
  next_cursor: string | null;
}

// Hard cap so a runaway pagination loop or huge catalogue doesn't blow up
// the sitemap response. Google's per-sitemap limit is 50,000 URLs / 50 MB;
// 5,000 task URLs sits comfortably under both.
const MAX_TASK_ROUTES = 5000;
const PAGE_SIZE = 200;

async function fetchPublicTaskRoutes(): Promise<SitemapEntry[]> {
  const baseUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001';

  const collected: SitemapEntry[] = [];
  let cursor: string | null = null;
  // Iterate paginated fetches until exhausted or the cap is hit. Wrapped in
  // try/catch so a transient API outage during sitemap render doesn't fail
  // the whole route — we just emit the static portion.
  try {
    while (collected.length < MAX_TASK_ROUTES) {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) params.set('cursor', cursor);
      const res: Response = await fetch(
        `${baseUrl}/api/v1/tasks?${params.toString()}`,
        // Revalidate hourly. Sitemaps don't need to be real-time fresh —
        // search engines re-fetch periodically anyway.
        { next: { revalidate: 3600 } },
      );
      if (!res.ok) break;
      const json = (await res.json()) as { success: boolean; data: PublicTaskListResponse };
      if (!json.success || !json.data) break;
      const page = json.data.tasks;
      for (const task of page) {
        collected.push({
          url: `${SITE_URL}/tasks/${task.id}`,
          lastModified: task.updated_at ? new Date(task.updated_at) : new Date(),
          changeFrequency: 'weekly',
          priority: 0.6,
        });
        if (collected.length >= MAX_TASK_ROUTES) break;
      }
      cursor = json.data.next_cursor;
      if (!cursor) break;
    }
  } catch {
    // Swallow — the sitemap still renders the static portion.
  }
  return collected;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes: SitemapEntry[] = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${SITE_URL}/tasks`, lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/services`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const specialisations: SitemapEntry[] = IT_DOMAINS.map((d) => ({
    url: `${SITE_URL}/services/${d.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const glossaryRoutes: SitemapEntry[] = [
    { url: `${SITE_URL}/glossary`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    ...GLOSSARY.map<SitemapEntry>((g) => ({
      url: `${SITE_URL}/glossary/${g.slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    })),
  ];

  const taskRoutes = await fetchPublicTaskRoutes();

  return [...staticRoutes, ...specialisations, ...glossaryRoutes, ...taskRoutes];
}
