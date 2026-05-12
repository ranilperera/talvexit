import type { InsuranceCertificate } from '@prisma/client';

// ─── Domain tier classification ───────────────────────────────────────────────

const HIGH_RISK_DOMAINS = new Set(['CYBERSECURITY', 'CLOUD_AZURE', 'FIREWALL', 'AI_INTEGRATION']);
const ELEVATED_DOMAINS = new Set(['DATABASE', 'NETWORKING', 'STORAGE', 'SYSTEM_ADMIN', 'DEVOPS']);

// ─── getRequiredTier ──────────────────────────────────────────────────────────

export function getRequiredTier(domains: string[]): 'STANDARD' | 'ELEVATED' | 'HIGH_RISK' {
  if (domains.some((d) => HIGH_RISK_DOMAINS.has(d))) return 'HIGH_RISK';
  if (domains.some((d) => ELEVATED_DOMAINS.has(d))) return 'ELEVATED';
  return 'STANDARD';
}

// ─── getMinimumCoverage ───────────────────────────────────────────────────────

export function getMinimumCoverage(tier: string): {
  pi_aud: number;
  pl_aud: number;
  cyber_required: boolean;
} {
  switch (tier) {
    case 'ELEVATED':
    case 'HIGH_RISK':
      return { pi_aud: 1_000_000, pl_aud: 1_000_000, cyber_required: true };
    default:
      return { pi_aud: 500_000, pl_aud: 500_000, cyber_required: false };
  }
}

// ─── validateCoverageMet ──────────────────────────────────────────────────────

export function validateCoverageMet(
  certificates: InsuranceCertificate[],
  requiredTier: string,
): {
  met: boolean;
  required_tier: string;
  gaps: string[];
  has_valid_pi: boolean;
  has_valid_pl: boolean;
  has_valid_cyber: boolean;
} {
  const minimums = getMinimumCoverage(requiredTier);
  const now = new Date();

  const active = certificates.filter(
    (c) =>
      c.status === 'VERIFIED' &&
      c.worldwide_coverage === true &&
      new Date(c.policy_expiry_date) > now,
  );

  const has_valid_pi = active.some(
    (c) => c.insurance_type === 'PI' && Number(c.coverage_amount_aud) >= minimums.pi_aud,
  );

  const has_valid_pl = active.some(
    (c) => c.insurance_type === 'PL' && Number(c.coverage_amount_aud) >= minimums.pl_aud,
  );

  const has_valid_cyber = active.some((c) => c.insurance_type === 'CYBER');

  const gaps: string[] = [];
  if (!has_valid_pi)
    gaps.push(`Professional Indemnity min AUD $${minimums.pi_aud.toLocaleString()} required`);
  if (!has_valid_pl)
    gaps.push(`Public Liability min AUD $${minimums.pl_aud.toLocaleString()} required`);
  if (minimums.cyber_required && !has_valid_cyber)
    gaps.push('Cyber Liability certificate required for your domain tier');

  return {
    met: gaps.length === 0,
    required_tier: requiredTier,
    gaps,
    has_valid_pi,
    has_valid_pl,
    has_valid_cyber,
  };
}

// ─── isCurrentlyValid ─────────────────────────────────────────────────────────

export function isCurrentlyValid(certificates: InsuranceCertificate[]): boolean {
  const now = new Date();
  const active = certificates.filter(
    (c) =>
      c.status === 'VERIFIED' &&
      c.worldwide_coverage === true &&
      new Date(c.policy_expiry_date) > now,
  );
  const hasPI = active.some((c) => c.insurance_type === 'PI');
  const hasPL = active.some((c) => c.insurance_type === 'PL');
  return hasPI && hasPL;
}
