import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenderMatchingService } from '../tender-matching.service.js';
import type { EligibilityCriteria } from '../tender-matching.service.js';

// ─── Prisma mock factory ───────────────────────────────────────────────────────

function makeContractorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cp_1',
    user_id: 'u_1',
    domains: ['CLOUD_AZURE', 'DEVOPS'],
    skills: ['AWS', 'Azure', 'CISSP'],
    overall_rating: '4.5',
    rating_count: 12,
    completed_orders_count: 8,
    hourly_rate_aud: '120.00',
    kyc_status: 'APPROVED',
    insurance_tier_met: true,
    user: { full_name: 'Alice Contractor' },
    ...overrides,
  };
}

function makeCompanyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'co_1',
    company_name: 'Techsys Pty Ltd',
    primary_admin_id: 'u_admin',
    domains: ['CLOUD_AZURE', 'NETWORKING'],
    overall_rating: '4.2',
    rating_count: 5,
    completed_orders_count: 15,
    kyc_status: 'APPROVED',
    insurance_tier_met: true,
    is_foreign_entity: false,
    certifications: ['ISO27001', 'CISSP'],
    ...overrides,
  };
}

function makePrisma(
  contractorRows: ReturnType<typeof makeContractorRow>[] = [],
  companyRows: ReturnType<typeof makeCompanyRow>[] = [],
) {
  return {
    contractorProfile: { findMany: vi.fn(async () => contractorRows) },
    consultingCompany: { findMany: vi.fn(async () => companyRows) },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('TenderMatchingService', () => {
  let service: TenderMatchingService;

  beforeEach(() => {
    service = new TenderMatchingService();
  });

  // ── matchProviders ──────────────────────────────────────────────────────────

  describe('matchProviders', () => {
    it('TM-01: returns matching contractors and companies', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const criteria: EligibilityCriteria = {
        provider_types: ['individual', 'company'],
        domain: 'CLOUD_AZURE',
      };

      const result = await service.matchProviders(criteria, prisma as never);

      expect(result.individual_contractors).toHaveLength(1);
      expect(result.individual_contractors[0]?.profile_id).toBe('cp_1');
      expect(result.companies).toHaveLength(1);
      expect(result.companies[0]?.company_id).toBe('co_1');
      expect(result.total_count).toBe(2);
    });

    it('TM-02: individual only — companies not queried', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const criteria: EligibilityCriteria = { provider_types: ['individual'] };

      const result = await service.matchProviders(criteria, prisma as never);

      expect(result.individual_contractors).toHaveLength(1);
      expect(result.companies).toHaveLength(0);
      expect(prisma.consultingCompany.findMany).not.toHaveBeenCalled();
    });

    it('TM-03: company only — contractors not queried', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const criteria: EligibilityCriteria = { provider_types: ['company'] };

      const result = await service.matchProviders(criteria, prisma as never);

      expect(result.individual_contractors).toHaveLength(0);
      expect(result.companies).toHaveLength(1);
      expect(prisma.contractorProfile.findMany).not.toHaveBeenCalled();
    });

    it('TM-04: overseas only — passes is_foreign_entity:true filter', async () => {
      const prisma = makePrisma([], [makeCompanyRow({ is_foreign_entity: true })]);
      const criteria: EligibilityCriteria = { provider_types: ['overseas'] };

      await service.matchProviders(criteria, prisma as never);

      expect(prisma.consultingCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_foreign_entity: true }),
        }),
      );
    });

    it('TM-05: requires_kyc adds kyc_status:APPROVED filter for contractors', async () => {
      const prisma = makePrisma([makeContractorRow()], []);
      const criteria: EligibilityCriteria = {
        provider_types: ['individual'],
        requires_kyc: true,
      };

      await service.matchProviders(criteria, prisma as never);

      expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ kyc_status: 'APPROVED' }),
        }),
      );
    });

    it('TM-06: requires_insurance adds insurance_tier_met:true filter', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const criteria: EligibilityCriteria = {
        provider_types: ['individual', 'company'],
        requires_insurance: true,
      };

      await service.matchProviders(criteria, prisma as never);

      expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ insurance_tier_met: true }),
        }),
      );
      expect(prisma.consultingCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ insurance_tier_met: true }),
        }),
      );
    });

    it('TM-07: required_certs filters out contractors missing certs', async () => {
      const withCert = makeContractorRow({ skills: ['CISSP', 'Azure'] });
      const withoutCert = makeContractorRow({ id: 'cp_2', skills: ['Azure'] });
      const prisma = makePrisma([withCert, withoutCert], []);
      const criteria: EligibilityCriteria = {
        provider_types: ['individual'],
        required_certs: ['CISSP'],
      };

      const result = await service.matchProviders(criteria, prisma as never);

      expect(result.individual_contractors).toHaveLength(1);
      expect(result.individual_contractors[0]?.profile_id).toBe('cp_1');
    });

    it('TM-08: required_certs are case-insensitive', async () => {
      const row = makeContractorRow({ skills: ['cissp'] });
      const prisma = makePrisma([row], []);
      const criteria: EligibilityCriteria = {
        provider_types: ['individual'],
        required_certs: ['CISSP'],
      };

      const result = await service.matchProviders(criteria, prisma as never);
      expect(result.individual_contractors).toHaveLength(1);
    });

    it('TM-09: required_certs filter companies by certifications', async () => {
      const matching = makeCompanyRow({ certifications: ['ISO27001'] });
      const notMatching = makeCompanyRow({ id: 'co_2', certifications: [] });
      const prisma = makePrisma([], [matching, notMatching]);
      const criteria: EligibilityCriteria = {
        provider_types: ['company'],
        required_certs: ['ISO27001'],
      };

      const result = await service.matchProviders(criteria, prisma as never);
      expect(result.companies).toHaveLength(1);
    });

    it('TM-10: empty provider_types returns empty result without DB calls', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const criteria: EligibilityCriteria = { provider_types: [] };

      const result = await service.matchProviders(criteria, prisma as never);

      expect(result.individual_contractors).toHaveLength(0);
      expect(result.companies).toHaveLength(0);
      expect(result.total_count).toBe(0);
      expect(prisma.contractorProfile.findMany).not.toHaveBeenCalled();
      expect(prisma.consultingCompany.findMany).not.toHaveBeenCalled();
    });

    it('TM-11: numeric fields are converted from Decimal strings', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);
      const result = await service.matchProviders(
        { provider_types: ['individual', 'company'] },
        prisma as never,
      );

      expect(result.individual_contractors[0]?.overall_rating).toBe(4.5);
      expect(result.individual_contractors[0]?.hourly_rate_aud).toBe(120);
      expect(result.companies[0]?.overall_rating).toBe(4.2);
    });

    it('TM-12: null overall_rating is preserved as null', async () => {
      const prisma = makePrisma(
        [makeContractorRow({ overall_rating: null })],
        [],
      );
      const result = await service.matchProviders(
        { provider_types: ['individual'] },
        prisma as never,
      );
      expect(result.individual_contractors[0]?.overall_rating).toBeNull();
    });
  });

  // ── searchProviders ─────────────────────────────────────────────────────────

  describe('searchProviders', () => {
    it('TM-13: returns both contractors and companies by default', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);

      const result = await service.searchProviders(undefined, undefined, prisma as never);

      expect(result.individual_contractors).toHaveLength(1);
      expect(result.companies).toHaveLength(1);
    });

    it('TM-14: domain filter passed to both queries', async () => {
      const prisma = makePrisma([makeContractorRow()], [makeCompanyRow()]);

      await service.searchProviders('CLOUD_AZURE', undefined, prisma as never);

      expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domains: { has: 'CLOUD_AZURE' },
          }),
        }),
      );
      expect(prisma.consultingCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domains: { has: 'CLOUD_AZURE' },
          }),
        }),
      );
    });

    it('TM-15: name query passed as full_name contains for contractors', async () => {
      const prisma = makePrisma([makeContractorRow()], []);

      await service.searchProviders(undefined, 'alice', prisma as never);

      expect(prisma.contractorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { full_name: { contains: 'alice', mode: 'insensitive' } },
          }),
        }),
      );
    });

    it('TM-16: name query searches company_name OR trading_name', async () => {
      const prisma = makePrisma([], [makeCompanyRow()]);

      await service.searchProviders(undefined, 'tech', prisma as never);

      expect(prisma.consultingCompany.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { company_name: { contains: 'tech', mode: 'insensitive' } },
              { trading_name: { contains: 'tech', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('TM-17: total_count is sum of both arrays', async () => {
      const prisma = makePrisma(
        [makeContractorRow(), makeContractorRow({ id: 'cp_2' })],
        [makeCompanyRow()],
      );

      const result = await service.searchProviders(undefined, undefined, prisma as never);
      expect(result.total_count).toBe(3);
    });
  });
});
