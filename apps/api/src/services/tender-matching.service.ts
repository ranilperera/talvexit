import type { PrismaClient } from '@prisma/client';
import { Domain } from '@prisma/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EligibilityCriteria {
  domain?: string;
  /** Which provider types to include: 'individual', 'company', 'overseas' */
  provider_types: Array<'individual' | 'company' | 'overseas'>;
  requires_kyc?: boolean;
  requires_insurance?: boolean;
  /** Minimum completed_orders_count as a proxy for experience */
  min_experience_years?: number;
  required_certs?: string[];
}

export interface ContractorResult {
  profile_id: string;
  user_id: string;
  full_name: string;
  domains: string[];
  skills: string[];
  overall_rating: number | null;
  rating_count: number;
  completed_orders_count: number;
  hourly_rate_aud: number | null;
  kyc_status: string;
  insurance_tier_met: boolean;
}

export interface CompanyResult {
  company_id: string;
  company_name: string;
  primary_admin_id: string;
  domains: string[];
  overall_rating: number | null;
  rating_count: number;
  completed_orders_count: number;
  kyc_status: string;
  insurance_tier_met: boolean;
  is_foreign_entity: boolean;
  certifications: string[];
}

export interface MatchResult {
  individual_contractors: ContractorResult[];
  companies: CompanyResult[];
  total_count: number;
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class TenderMatchingService {
  /**
   * Auto-match: query active providers that meet the eligibility criteria.
   * Returns up to `limit` providers per category.
   */
  async matchProviders(
    criteria: EligibilityCriteria,
    prisma: PrismaClient,
    limit = 20,
  ): Promise<MatchResult> {
    const includeIndividual = criteria.provider_types.includes('individual');
    const includeCompany = criteria.provider_types.includes('company');
    const includeOverseas = criteria.provider_types.includes('overseas');

    const [contractors, companies] = await Promise.all([
      includeIndividual
        ? this.matchContractors(criteria, prisma, limit)
        : Promise.resolve([]),
      includeCompany || includeOverseas
        ? this.matchCompanies(criteria, prisma, limit, includeCompany, includeOverseas)
        : Promise.resolve([]),
    ]);

    return {
      individual_contractors: contractors,
      companies,
      total_count: contractors.length + companies.length,
    };
  }

  /**
   * Direct search: find providers by name/domain for Path A (customer-selected).
   * Returns partial matches ranked by completed_orders_count DESC.
   */
  async searchProviders(
    domain: string | undefined,
    query: string | undefined,
    prisma: PrismaClient,
    limit = 20,
  ): Promise<MatchResult> {
    const [contractors, companies] = await Promise.all([
      this.searchContractors(domain, query, prisma, limit),
      this.searchCompanies(domain, query, prisma, limit),
    ]);
    return {
      individual_contractors: contractors,
      companies,
      total_count: contractors.length + companies.length,
    };
  }

  // ─── Private: contractor matching ──────────────────────────────────────────

  private async matchContractors(
    criteria: EligibilityCriteria,
    prisma: PrismaClient,
    limit: number,
  ): Promise<ContractorResult[]> {
    const rows = await prisma.contractorProfile.findMany({
      where: {
        status: 'ACTIVE',
        ...(criteria.domain
          ? { domains: { has: criteria.domain as Domain } }
          : {}),
        ...(criteria.requires_kyc ? { kyc_status: 'APPROVED' } : {}),
        ...(criteria.requires_insurance ? { insurance_tier_met: true } : {}),
        ...(criteria.min_experience_years != null
          ? { completed_orders_count: { gte: criteria.min_experience_years } }
          : {}),
      },
      select: {
        id: true,
        user_id: true,
        domains: true,
        skills: true,
        overall_rating: true,
        rating_count: true,
        completed_orders_count: true,
        hourly_rate_aud: true,
        kyc_status: true,
        insurance_tier_met: true,
        user: { select: { full_name: true } },
      },
      orderBy: [{ completed_orders_count: 'desc' }, { overall_rating: 'desc' }],
      take: limit,
    });

    return rows
      .filter((r) => this.hasRequiredCerts(r.skills, criteria.required_certs))
      .map((r) => ({
        profile_id: r.id,
        user_id: r.user_id,
        full_name: r.user.full_name,
        domains: r.domains,
        skills: r.skills,
        overall_rating: r.overall_rating ? Number(r.overall_rating) : null,
        rating_count: r.rating_count,
        completed_orders_count: r.completed_orders_count,
        hourly_rate_aud: r.hourly_rate_aud ? Number(r.hourly_rate_aud) : null,
        kyc_status: r.kyc_status,
        insurance_tier_met: r.insurance_tier_met,
      }));
  }

  private async matchCompanies(
    criteria: EligibilityCriteria,
    prisma: PrismaClient,
    limit: number,
    includeLocal: boolean,
    includeOverseas: boolean,
  ): Promise<CompanyResult[]> {
    const rows = await prisma.consultingCompany.findMany({
      where: {
        status: 'ACTIVE',
        ...(criteria.domain
          ? { domains: { has: criteria.domain as Domain } }
          : {}),
        ...(criteria.requires_insurance ? { insurance_tier_met: true } : {}),
        // overseas filter
        ...(!includeLocal && includeOverseas ? { is_foreign_entity: true } : {}),
        ...(includeLocal && !includeOverseas ? { is_foreign_entity: false } : {}),
      },
      select: {
        id: true,
        company_name: true,
        primary_admin_id: true,
        domains: true,
        overall_rating: true,
        rating_count: true,
        completed_orders_count: true,
        kyc_status: true,
        insurance_tier_met: true,
        is_foreign_entity: true,
        certifications: true,
      },
      orderBy: [{ completed_orders_count: 'desc' }, { overall_rating: 'desc' }],
      take: limit,
    });

    return rows
      .filter((r) =>
        this.hasRequiredCerts(
          Array.isArray(r.certifications) ? (r.certifications as string[]) : [],
          criteria.required_certs,
        ),
      )
      .map((r) => ({
        company_id: r.id,
        company_name: r.company_name,
        primary_admin_id: r.primary_admin_id,
        domains: r.domains,
        overall_rating: r.overall_rating ? Number(r.overall_rating) : null,
        rating_count: r.rating_count,
        completed_orders_count: r.completed_orders_count,
        kyc_status: r.kyc_status,
        insurance_tier_met: r.insurance_tier_met,
        is_foreign_entity: r.is_foreign_entity,
        certifications: Array.isArray(r.certifications)
          ? (r.certifications as string[])
          : [],
      }));
  }

  // ─── Private: direct search ─────────────────────────────────────────────────

  private async searchContractors(
    domain: string | undefined,
    query: string | undefined,
    prisma: PrismaClient,
    limit: number,
  ): Promise<ContractorResult[]> {
    const rows = await prisma.contractorProfile.findMany({
      where: {
        status: 'ACTIVE',
        ...(domain ? { domains: { has: domain as Domain } } : {}),
        ...(query
          ? {
              user: {
                full_name: { contains: query, mode: 'insensitive' },
              },
            }
          : {}),
      },
      select: {
        id: true,
        user_id: true,
        domains: true,
        skills: true,
        overall_rating: true,
        rating_count: true,
        completed_orders_count: true,
        hourly_rate_aud: true,
        kyc_status: true,
        insurance_tier_met: true,
        user: { select: { full_name: true } },
      },
      orderBy: [{ completed_orders_count: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      profile_id: r.id,
      user_id: r.user_id,
      full_name: r.user.full_name,
      domains: r.domains,
      skills: r.skills,
      overall_rating: r.overall_rating ? Number(r.overall_rating) : null,
      rating_count: r.rating_count,
      completed_orders_count: r.completed_orders_count,
      hourly_rate_aud: r.hourly_rate_aud ? Number(r.hourly_rate_aud) : null,
      kyc_status: r.kyc_status,
      insurance_tier_met: r.insurance_tier_met,
    }));
  }

  private async searchCompanies(
    domain: string | undefined,
    query: string | undefined,
    prisma: PrismaClient,
    limit: number,
  ): Promise<CompanyResult[]> {
    const rows = await prisma.consultingCompany.findMany({
      where: {
        status: 'ACTIVE',
        ...(domain ? { domains: { has: domain as Domain } } : {}),
        ...(query
          ? {
              OR: [
                { company_name: { contains: query, mode: 'insensitive' } },
                { trading_name: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        company_name: true,
        primary_admin_id: true,
        domains: true,
        overall_rating: true,
        rating_count: true,
        completed_orders_count: true,
        kyc_status: true,
        insurance_tier_met: true,
        is_foreign_entity: true,
        certifications: true,
      },
      orderBy: [{ completed_orders_count: 'desc' }],
      take: limit,
    });

    return rows.map((r) => ({
      company_id: r.id,
      company_name: r.company_name,
      primary_admin_id: r.primary_admin_id,
      domains: r.domains,
      overall_rating: r.overall_rating ? Number(r.overall_rating) : null,
      rating_count: r.rating_count,
      completed_orders_count: r.completed_orders_count,
      kyc_status: r.kyc_status,
      insurance_tier_met: r.insurance_tier_met,
      is_foreign_entity: r.is_foreign_entity,
      certifications: Array.isArray(r.certifications)
        ? (r.certifications as string[])
        : [],
    }));
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Returns true if all required certs appear in the candidate's cert list.
   * Case-insensitive comparison. No-op if required_certs is empty/undefined.
   */
  private hasRequiredCerts(
    candidateCerts: string[],
    requiredCerts?: string[],
  ): boolean {
    if (!requiredCerts || requiredCerts.length === 0) return true;
    const lower = candidateCerts.map((c) => c.toLowerCase());
    return requiredCerts.every((req) => lower.includes(req.toLowerCase()));
  }
}
