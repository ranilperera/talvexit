import type { PrismaClient } from '@prisma/client';

// ─── In-memory cache (5-minute TTL) ──────────────────────────────────────────

let configCache: Record<string, string> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ─── getPlatformConfig ────────────────────────────────────────────────────────

export async function getPlatformConfig(
  prisma: PrismaClient,
): Promise<Record<string, string>> {
  const now = Date.now();
  if (configCache && now < cacheExpiry) return configCache;

  const rows = await prisma.platformConfig.findMany();

  // PlatformConfig.value is Json — normalise to string for template use
  configCache = Object.fromEntries(
    rows.map((r) => [
      r.key,
      typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
    ]),
  );
  cacheExpiry = now + CACHE_TTL_MS;
  return configCache;
}

export function invalidateConfigCache(): void {
  configCache = null;
  cacheExpiry = 0;
}

// ─── Interpolate {{variable}} placeholders ────────────────────────────────────

export function interpolate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Parse a JSON array value safely ─────────────────────────────────────────

export function parseConfigArray(val: string | undefined): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Get a single config value with fallback ──────────────────────────────────

export function getConfig(
  config: Record<string, string>,
  key: string,
  fallback = '',
): string {
  return config[key] ?? fallback;
}
