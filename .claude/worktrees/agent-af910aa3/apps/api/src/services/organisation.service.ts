import crypto from 'node:crypto';
import type {
  Organisation,
  OrgMember,
  OrgDocument,
  OrgInsuranceCertificate,
  PrismaClient,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import type {
  CreateOrganisationInput,
  UpdateOrganisationInput,
  UploadOrgDocumentInput,
  AcceptAgreementInput,
  InviteMemberInput,
  UpdateMemberInput,
} from '@onys/shared';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type EmailJobPayload =
  | {
      type: 'org-member-invitation';
      to: string;
      org_name: string;
      role: string;
      invited_by: string;
      accept_url: string;
      expires_at: string;
    }
  | { type: 'org-membership-removed'; to: string; org_name: string };

// ─── helpers ─────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function orgInsuranceMet(certs: OrgInsuranceCertificate[]): boolean {
  const now = new Date();
  const active = certs.filter(
    (c) =>
      c.status === 'VERIFIED' &&
      c.worldwide_coverage === true &&
      new Date(c.policy_expiry_date) > now,
  );
  const hasPI = active.some((c) => c.insurance_type === 'PI');
  const hasPL = active.some((c) => c.insurance_type === 'PL');
  return hasPI && hasPL;
}

// ─── findOrgForAdmin ──────────────────────────────────────────────────────────
// Shared lookup used by multiple methods — finds the org via direct ownership
// or via ORG_ADMIN membership. Throws ORGANISATION_NOT_FOUND if neither exists.

async function findOrgForAdmin(
  prisma: PrismaClient,
  adminUserId: string,
): Promise<Organisation> {
  const org = await prisma.organisation.findFirst({
    where: { admin_user_id: adminUserId },
  });
  if (org) return org;

  const membership = await prisma.orgMember.findFirst({
    where: { user_id: adminUserId, role: 'ORG_ADMIN', status: { not: 'REMOVED' } },
    include: { organisation: true },
  });
  if (membership) return membership.organisation;

  throw new AppError('ORGANISATION_NOT_FOUND', 404);
}

// ─── OrganisationService ──────────────────────────────────────────────────────

export class OrganisationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── createOrganisation ────────────────────────────────────────────────────

  async createOrganisation(
    adminUserId: string,
    data: CreateOrganisationInput,
    meta: { ip: string; userAgent: string },
  ): Promise<Organisation> {
    // 1. Verify account type
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { account_type: true, email: true, full_name: true },
    });
    if (user.account_type !== 'ORGANIZATION_ADMIN') {
      throw new AppError(
        'WRONG_ACCOUNT_TYPE',
        403,
        'Only ORGANISATION_ADMIN accounts can create organisations',
      );
    }

    // 2. Check for existing organisation
    const existing = await this.prisma.organisation.findFirst({
      where: { admin_user_id: adminUserId },
    });
    if (existing) {
      throw new AppError('ORGANISATION_EXISTS', 409, 'You already have an organisation');
    }

    // 3. Create Organisation + 4. Create creator's OrgMember in a transaction
    const now = new Date();
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organisation.create({
        data: {
          entity_name: data.entity_name,
          registration_number: data.registration_number ?? null,
          country: data.country,
          abn: data.abn ?? null,
          address: data.address ?? null,
          contact_email: data.contact_email,
          admin_user_id: adminUserId,
          verification_status: 'INCOMPLETE',
        },
      });

      await tx.orgMember.create({
        data: {
          org_id: created.id,
          user_id: adminUserId,
          role: 'ORG_ADMIN',
          status: 'VERIFIED',
          invited_email: user.email,
          invitation_accepted_at: now,
          joined_at: now,
        },
      });

      return created;
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORGANISATION_CREATED',
      entityType: 'Organisation',
      entityId: org.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { admin_user_id: adminUserId, entity_name: data.entity_name },
    });

    return org;
  }

  // ─── getMyOrganisation ─────────────────────────────────────────────────────

  async getMyOrganisation(adminUserId: string): Promise<
    Organisation & {
      members: OrgMember[];
      documents: OrgDocument[];
      member_count: number;
      verified_member_count: number;
    }
  > {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const [members, documents] = await Promise.all([
      this.prisma.orgMember.findMany({
        where: { org_id: org.id, status: { not: 'REMOVED' } },
      }),
      this.prisma.orgDocument.findMany({
        where: { org_id: org.id },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    return {
      ...org,
      members,
      documents,
      member_count: members.length,
      verified_member_count: members.filter((m) => m.status === 'VERIFIED').length,
    };
  }

  // ─── updateOrganisation ────────────────────────────────────────────────────

  async updateOrganisation(
    adminUserId: string,
    data: UpdateOrganisationInput,
  ): Promise<Organisation> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const updated = await this.prisma.organisation.update({
      where: { id: org.id },
      data: {
        ...(data.entity_name !== undefined && { entity_name: data.entity_name }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.contact_email !== undefined && { contact_email: data.contact_email }),
        ...(data.logo_blob_path !== undefined && { logo_blob_path: data.logo_blob_path }),
      },
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORGANISATION_UPDATED',
      entityType: 'Organisation',
      entityId: org.id,
      metadata: { updated_fields: Object.keys(data) },
    });

    return updated;
  }

  // ─── uploadDocument ────────────────────────────────────────────────────────

  async uploadDocument(
    adminUserId: string,
    data: UploadOrgDocumentInput,
    meta: { ip: string; userAgent: string },
  ): Promise<OrgDocument> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const doc = await this.prisma.orgDocument.create({
      data: {
        org_id: org.id,
        doc_type: data.doc_type,
        blob_path: data.blob_path,
        file_name: data.file_name,
        uploaded_by_user_id: adminUserId,
      },
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORG_DOCUMENT_UPLOADED',
      entityType: 'OrgDocument',
      entityId: doc.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { doc_type: data.doc_type, org_id: org.id },
    });

    return doc;
  }

  // ─── acceptAgreement ──────────────────────────────────────────────────────

  async acceptAgreement(
    adminUserId: string,
    data: AcceptAgreementInput,
    meta: { ip: string; userAgent: string },
  ): Promise<Organisation> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    // 2. Check not already accepted for this version
    const existing = await this.prisma.orgLegalAcceptance.findUnique({
      where: {
        org_id_document_type_version: {
          org_id: org.id,
          document_type: 'EXPERT_ORGANISATION_AGREEMENT',
          version: data.agreement_version,
        },
      },
    });
    if (existing) {
      throw new AppError('AGREEMENT_ALREADY_ACCEPTED', 409);
    }

    const now = new Date();

    // 3. Create acceptance record + 4. Update org
    await this.prisma.orgLegalAcceptance.create({
      data: {
        org_id: org.id,
        accepted_by: adminUserId,
        document_type: 'EXPERT_ORGANISATION_AGREEMENT',
        version: data.agreement_version,
        ip_address: meta.ip,
        user_agent: meta.userAgent,
      },
    });

    const updated = await this.prisma.organisation.update({
      where: { id: org.id },
      data: {
        agreement_accepted_at: now,
        agreement_version: data.agreement_version,
        agreement_ip_address: meta.ip,
        agreement_user_agent: meta.userAgent,
      },
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORG_AGREEMENT_ACCEPTED',
      entityType: 'Organisation',
      entityId: org.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { version: data.agreement_version, accepted_by: adminUserId },
    });

    return updated;
  }

  // ─── inviteMember ─────────────────────────────────────────────────────────

  async inviteMember(
    adminUserId: string,
    data: InviteMemberInput,
    meta: { ip: string; userAgent: string },
  ): Promise<OrgMember> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    // 2. Agreement gate
    if (!org.agreement_accepted_at) {
      throw new AppError(
        'AGREEMENT_REQUIRED',
        422,
        'Organisation must accept the Expert Organisation Agreement before inviting members',
      );
    }

    // 3. Duplicate invite check
    const existing = await this.prisma.orgMember.findUnique({
      where: {
        org_id_invited_email: { org_id: org.id, invited_email: data.email },
      },
    });
    if (existing) {
      throw new AppError(
        'MEMBER_ALREADY_EXISTS',
        409,
        'This email is already a member or has a pending invitation',
      );
    }

    // 4–5. Generate and hash invitation token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    // 6. Create OrgMember
    const member = await this.prisma.orgMember.create({
      data: {
        org_id: org.id,
        role: data.role,
        status: 'INVITED',
        invited_email: data.email,
        invitation_token_hash: tokenHash,
        invitation_expires_at: expiresAt,
        invited_by_user_id: adminUserId,
      },
    });

    // 7. Queue invitation email
    const adminUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: adminUserId },
      select: { full_name: true },
    });

    await this.emailQueue.add('org-member-invitation', {
      type: 'org-member-invitation',
      to: data.email,
      org_name: org.entity_name,
      role: data.role,
      invited_by: adminUser.full_name,
      accept_url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/organisations/join/${rawToken}`,
      expires_at: expiresAt.toISOString(),
    });

    // 8. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORG_MEMBER_INVITED',
      entityType: 'OrgMember',
      entityId: member.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { invited_email: data.email, role: data.role, org_id: org.id },
    });

    return member;
  }

  // ─── acceptInvitation ─────────────────────────────────────────────────────

  async acceptInvitation(token: string, acceptingUserId: string): Promise<OrgMember> {
    // 1. Hash the raw token
    const tokenHash = sha256(token);

    // 2. Find OrgMember by token hash
    const member = await this.prisma.orgMember.findFirst({
      where: { invitation_token_hash: tokenHash },
    });
    if (!member) throw new AppError('INVALID_TOKEN', 400);

    // 3. Check status
    if (member.status !== 'INVITED') {
      throw new AppError('INVITATION_ALREADY_USED', 409);
    }

    // 4. Check expiry
    if (!member.invitation_expires_at || member.invitation_expires_at < new Date()) {
      throw new AppError('INVITATION_EXPIRED', 400);
    }

    // 5. Check accepting user's account type
    const acceptingUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: acceptingUserId },
      select: { account_type: true },
    });
    if (
      acceptingUser.account_type !== 'ORGANIZATION_ADMIN' &&
      acceptingUser.account_type !== 'ORG_MEMBER'
    ) {
      throw new AppError(
        'WRONG_ACCOUNT_TYPE',
        403,
        'You need an ORGANISATION_ADMIN or ORG_MEMBER account to join an organisation',
      );
    }

    // 6. Check not already in this org
    const alreadyMember = await this.prisma.orgMember.findFirst({
      where: { org_id: member.org_id, user_id: acceptingUserId },
    });
    if (alreadyMember) {
      throw new AppError('ALREADY_A_MEMBER', 409);
    }

    const now = new Date();

    // 7. Update OrgMember
    const updated = await this.prisma.orgMember.update({
      where: { id: member.id },
      data: {
        user_id: acceptingUserId,
        status: 'PENDING',
        invitation_token_hash: null,
        invitation_accepted_at: now,
        joined_at: now,
      },
    });

    // 8. Audit
    await writeAudit(this.prisma, {
      actorId: acceptingUserId,
      actionType: 'ORG_INVITATION_ACCEPTED',
      entityType: 'OrgMember',
      entityId: member.id,
      metadata: { user_id: acceptingUserId, org_id: member.org_id },
    });

    return updated;
  }

  // ─── getMembers ───────────────────────────────────────────────────────────

  async getMembers(
    adminUserId: string,
  ): Promise<
    Array<OrgMember & { user: { id: string; full_name: string; email: string } | null }>
  > {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    return this.prisma.orgMember.findMany({
      where: { org_id: org.id, status: { not: 'REMOVED' } },
      include: {
        user: { select: { id: true, full_name: true, email: true } },
      },
      orderBy: { joined_at: 'asc' },
    });
  }

  // ─── updateMember ─────────────────────────────────────────────────────────

  async updateMember(
    adminUserId: string,
    memberId: string,
    data: UpdateMemberInput,
  ): Promise<OrgMember> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, org_id: org.id },
    });
    if (!member) throw new AppError('MEMBER_NOT_FOUND', 404);

    // 3. Prevent self-demotion
    if (member.user_id === adminUserId && data.role === 'ORG_MEMBER') {
      throw new AppError(
        'CANNOT_DEMOTE_SELF',
        422,
        'Cannot demote yourself. Assign another ORG_ADMIN first.',
      );
    }

    // 4. Active orders check on deactivation
    if (data.status === 'INACTIVE' && member.active_order_count > 0) {
      throw new AppError(
        'MEMBER_HAS_ACTIVE_ORDERS',
        422,
        `Member has ${member.active_order_count} active order assignment(s). Reassign before deactivating.`,
      );
    }

    const updated = await this.prisma.orgMember.update({
      where: { id: memberId },
      data: {
        ...(data.role !== undefined && { role: data.role }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });

    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORG_MEMBER_UPDATED',
      entityType: 'OrgMember',
      entityId: memberId,
      metadata: { updated_fields: Object.keys(data) },
    });

    return updated;
  }

  // ─── removeMember ─────────────────────────────────────────────────────────

  async removeMember(
    adminUserId: string,
    memberId: string,
    reason?: string,
  ): Promise<void> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const member = await this.prisma.orgMember.findFirst({
      where: { id: memberId, org_id: org.id },
    });
    if (!member) throw new AppError('MEMBER_NOT_FOUND', 404);

    // 3. Prevent self-removal
    if (member.user_id === adminUserId) {
      throw new AppError(
        'CANNOT_REMOVE_SELF',
        422,
        'Cannot remove yourself from the organisation',
      );
    }

    // 4. Active orders check
    if (member.active_order_count > 0) {
      throw new AppError(
        'MEMBER_HAS_ACTIVE_ORDERS',
        422,
        `Reassign ${member.active_order_count} active order(s) before removing this member`,
      );
    }

    // 5. Soft-remove
    await this.prisma.orgMember.update({
      where: { id: memberId },
      data: {
        status: 'REMOVED',
        removed_at: new Date(),
        ...(reason !== undefined && { removal_reason: reason }),
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: adminUserId,
      actionType: 'ORG_MEMBER_REMOVED',
      entityType: 'OrgMember',
      entityId: memberId,
      metadata: { removed_by: adminUserId, org_id: org.id, ...(reason !== undefined && { reason }) },
    });

    // 7. Notify removed member if they have a linked user
    if (member.user_id) {
      await this.emailQueue.add('org-membership-removed', {
        type: 'org-membership-removed',
        to: member.invited_email,
        org_name: org.entity_name,
      });
    }
  }

  // ─── getOrgOnboardingStatus ───────────────────────────────────────────────

  async getOrgOnboardingStatus(adminUserId: string): Promise<{
    steps: Array<{ step: number; name: string; complete: boolean; message: string }>;
    ready_to_submit: boolean;
    can_invite_members: boolean;
  }> {
    const org = await findOrgForAdmin(this.prisma, adminUserId);

    const [regDoc, certs] = await Promise.all([
      this.prisma.orgDocument.findFirst({
        where: { org_id: org.id, doc_type: 'REGISTRATION_CERTIFICATE' },
      }),
      this.prisma.orgInsuranceCertificate.findMany({
        where: { org_id: org.id },
      }),
    ]);

    const step1 = !!(org.entity_name && org.contact_email && org.country);
    const step2 = !!regDoc;
    const step3 = !!org.agreement_accepted_at;
    const step4 = orgInsuranceMet(certs);
    const step5 = org.verification_status === 'VERIFIED';

    const steps = [
      {
        step: 1,
        name: 'Profile complete',
        complete: step1,
        message: step1 ? 'Profile details complete' : 'entity_name, contact_email, and country required',
      },
      {
        step: 2,
        name: 'Registration document uploaded',
        complete: step2,
        message: step2 ? 'Registration certificate uploaded' : 'Upload a REGISTRATION_CERTIFICATE document',
      },
      {
        step: 3,
        name: 'Agreement accepted',
        complete: step3,
        message: step3 ? 'Expert Organisation Agreement accepted' : 'Accept the Expert Organisation Agreement',
      },
      {
        step: 4,
        name: 'Insurance verified',
        complete: step4,
        message: step4 ? 'PI and PL insurance verified' : 'Verified worldwide PI and PL insurance required',
      },
      {
        step: 5,
        name: 'Admin verified',
        complete: step5,
        message: step5 ? 'Organisation verified by platform admin' : 'Awaiting platform admin verification',
      },
    ];

    return {
      steps,
      ready_to_submit: step1 && step2 && step3,
      can_invite_members: step3,
    };
  }

  // ─── verifyMemberEligibility ──────────────────────────────────────────────

  async verifyMemberEligibility(memberId: string): Promise<{
    eligible: boolean;
    checks: Array<{ name: string; passed: boolean; message: string }>;
  }> {
    const member = await this.prisma.orgMember.findUnique({
      where: { id: memberId },
    });
    if (!member) throw new AppError('MEMBER_NOT_FOUND', 404);

    const orgCerts = await this.prisma.orgInsuranceCertificate.findMany({
      where: { org_id: member.org_id },
    });
    const insurancePassed = orgInsuranceMet(orgCerts);

    const checks: Array<{ name: string; passed: boolean; message: string }> = [
      {
        name: 'Membership Active',
        passed: member.status === 'VERIFIED',
        message:
          member.status === 'VERIFIED'
            ? 'Member is active'
            : `Member status is ${member.status} — must be VERIFIED to accept orders`,
      },
      {
        name: 'Identity Verified',
        passed: member.identity_status === 'APPROVED',
        message:
          member.identity_status === 'APPROVED'
            ? 'Identity verified'
            : 'Member identity not yet verified',
      },
      {
        name: 'KYC Approved',
        passed: member.kyc_status === 'APPROVED',
        message:
          member.kyc_status === 'APPROVED' ? 'KYC approved' : 'Member KYC not yet approved',
      },
      {
        name: 'Organisation Insurance',
        passed: insurancePassed,
        message: insurancePassed
          ? 'Organisation insurance verified'
          : 'Organisation insurance not verified or expired',
      },
    ];

    return {
      eligible: checks.every((c) => c.passed),
      checks,
    };
  }
}
