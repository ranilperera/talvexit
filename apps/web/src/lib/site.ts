// Single source of truth for the canonical site URL. Every place that emits
// metadata, sitemap entries, JSON-LD, or social-card URLs reads from here.
//
// Defaults to https://talvexit.com (current production domain). Override in
// dev / staging by setting NEXT_PUBLIC_SITE_URL — must be a fully-qualified
// origin with no trailing slash (e.g. https://staging.talvexit.com).
//
// Why NEXT_PUBLIC_*: this URL has to be readable both in server components
// (metadata exports) and in client components (canonical links rendered as
// part of JSON-LD). NEXT_PUBLIC_ is the only env shape that satisfies both.

const RAW = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://talvexit.com';

export const SITE_URL = RAW.replace(/\/$/, '');
export const SITE_HOST = new URL(SITE_URL).host;

export const SITE_NAME = 'TalvexIT';

// Australian English locale used in OpenGraph and JSON-LD inLanguage.
export const SITE_LOCALE = 'en_AU';

// Returns an absolute URL by joining a path onto SITE_URL.
export function siteUrl(path: string = ''): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
