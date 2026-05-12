import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaClient, CompanyMember, CompanyInvitation, ConsultingCompany } from '@prisma/client';
import type { Queue } from 'bullmq';
import type {
  RegisterCompanyInput,
  InviteCompanyMemberInput,
  AcceptInvitationInput,
} from '@onys/shared';
import { generateEmailToken, sha256Hash } from '../utils/tokens.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';
import { emailUrls } from '../utils/urls.js';

type EmailJobPayload = Record<string, unknown>;
type RequestMeta = { ip: string; userAgent: string };

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

export class CompanyService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── REGISTER COMPANY ─────────────────────────────────────────────────────────
  // Minimal registration: creates User + ConsultingCompany (DRAFT) + CompanyMember.
  // All profile details are filled in post-login via PATCH /companies/me.
  // The company stays DRAFT until the admin explicitly submits for review.

  async registerCompany(
    data: RegisterCompanyInput,
    meta: RequestMeta,
  ): Promise<{ company: ConsultingCompany; user: { id: string; email: string; account_type: string } }> {
    // 1. Check email not already registered
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    });
    if (existing) throw new AppError('EMAIL_IN_USE', 409, 'An account with this email already exists');

    // 2. If ABN provided, check it is not already in use
    const abn = data.abn && data.abn !== '' ? data.abn : null;
    if (abn) {
      const abnExists = await this.prisma.consultingCompany.findUnique({
        where: { abn },
        select: { id: true },
      });
      if (abnExists) throw new AppError('ABN_IN_USE', 409, 'A company with this ABN is already registered');
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(data.password, 13);

    // 4. Atomic transaction: User + ConsultingCompany (DRAFT) + CompanyMember
    const { user, company, member } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          full_name: data.full_name,
          email: data.email,
          password_hash,
          account_type: 'COMPANY_ADMIN',
          email_verified: false,
          failed_login_count: 0,
        },
      });

      const createdCompany = await tx.consultingCompany.create({
        data: {
          company_name: data.company_name,
          abn: abn ?? null,
          primary_admin_id: createdUser.id,
          status: 'DRAFT',
          // Store country via tax_residency_country; foreign flag for non-AU
          tax_residency_country: data.country ?? 'AU',
          is_foreign_entity: (data.country ?? 'AU') !== 'AU',
        },
      });

      const createdMember = await tx.companyMember.create({
        data: {
          company_id: createdCompany.id,
          user_id: createdUser.id,
          role: 'COMPANY_ADMIN',
          job_title: data.job_title,
          is_primary_admin: true,
          status: 'ACTIVE',
        },
      });

      // Auto-activate the supplier-free plan against the COMPANY (not the
      // primary admin) so that limit-gated actions on the company sub work
      // immediately. The personal sub on the COMPANY_ADMIN user is skipped
      // — getEffectiveSubscription prefers the company sub anyway.
      const supplierFreePlan = await tx.subscriptionPlan
        .findUnique({ where: { slug: 'supplier-free' }, select: { id: true } })
        .catch(() => null);
      if (supplierFreePlan) {
        await tx.subscription.create({
          data: {
            company_id: createdCompany.id,
            plan_id: supplierFreePlan.id,
            billing_interval: 'MONTHLY',
            status: 'ACTIVE',
            started_at: new Date(),
          },
        });
      } else {
        console.warn(
          `[registerCompany] supplier-free plan not found — company ${createdCompany.id} created without subscription. Run seed:subscriptions.`,
        );
      }

      return { user: createdUser, company: createdCompany, member: createdMember };
    });

    // 5. Generate email verification token. Plaintext goes in the email,
    // sha256 hash goes in the DB — DB read alone can't grant verification.
    const rawToken = generateEmailToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        email_verification_token: sha256Hash(rawToken),
        email_verification_expires: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: user.id,
      actionType: 'COMPANY_REGISTERED',
      entityType: 'ConsultingCompany',
      entityId: company.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { abn, country: data.country, registered_by: user.id },
    });

    // 7. Queue email verification
    await this.emailQueue.add('verify-email', {
      type: 'verify-email',
      to: data.email,
      verify_url: emailUrls.verifyEmail(rawToken),
      userId: user.id,
    });

    void member;

    return {
      company,
      user: { id: user.id, email: user.email, account_type: user.account_type },
    };
  }

  // ─── SUBMIT FOR REVIEW ────────────────────────────────────────────────────────
  // Moves company from DRAFT → PENDING_VERIFICATION.
  // Requires: company_name, at least 1 domain, authorization_doc_blob_path,
  // authorization_type. All other fields are optional.

  async submitForReview(companyId: string, userId: string, meta: RequestMeta): Promise<ConsultingCompany> {
    const company = await this.prisma.consultingCompany.findUnique({
      where: { id: companyId },
      select: {
        id: true, status: true, company_name: true, domains: true,
        authorization_doc_blob_path: true, authorization_type: true,
        abn: true, primary_admin_id: true,
      },
    });

    if (!company) throw new AppError('COMPANY_NOT_FOUND', 404);
    if (company.primary_admin_id !== userId) throw new AppError('FORBIDDEN', 403);
    if (company.status !== 'DRAFT') {
      throw new AppError('INVALID_STATUS', 422, 'Company has already been submitted for review');
    }

    // Completeness checks
    const missing: string[] = [];
    if (!company.domains || company.domains.length === 0) missing.push('service domains');
    if (!company.authorization_doc_blob_path) missing.push('authority document');

    if (missing.length > 0) {
      throw new AppError(
        'PROFILE_INCOMPLETE',
        422,
        `Please complete your profile before submitting: ${missing.join(', ')}`,
      );
    }

    const updated = await this.prisma.consultingCompany.update({
      where: { id: companyId },
      data: { status: 'PENDING_VERIFICATION' },
    });

    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'COMPANY_SUBMITTED_FOR_REVIEW',
      entityType: 'ConsultingCompany',
      entityId: companyId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { abn: company.abn },
    });

    // Notify admin team
    await this.emailQueue.add('admin-new-company-registration', {
      type: 'admin-new-company-registration',
      company_name: company.company_name,
      abn: company.abn,
      primary_admin_email: '',
      authorization_type: company.authorization_type,
      admin_review_url: emailUrls.adminCompany(companyId),
    });

    return updated;
  }

  // ─── INVITE MEMBER ────────────────────────────────────────────────────────────

  async inviteMember(
    companyId: string,
    inviterUserId: string,
    data: InviteCompanyMemberInput,
  ): Promise<CompanyInvitation> {
    // 1. Find company and verify it is ACTIVE
    const company = await this.prisma.consultingCompany.findUnique({
      where: { id: companyId },
      select: { id: true, company_name: true, status: true },
    });
    if (!company) throw new AppError('COMPANY_NOT_FOUND', 404);
    if (company.status !== 'ACTIVE') {
      throw new AppError('COMPANY_NOT_ACTIVE', 422, 'Company must be active to invite members');
    }

    // 2. Verify inviter has sufficient role (COMPANY_ADMIN or SENIOR_CONSULTANT only)
    const inviterMembership = await this.prisma.companyMember.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: inviterUserId } },
      select: { role: true },
    });
    if (
      !inviterMembership ||
      inviterMembership.role === 'CONSULTANT' ||
      inviterMembership.role === 'JUNIOR_CONSULTANT'
    ) {
      throw new AppError(
        'INSUFFICIENT_COMPANY_ROLE',
        403,
        'Only Company Admins and Senior Consultants can invite members',
      );
    }

    // 3. Check not already an active member
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.invited_email },
      include: {
        company_memberships: {
          where: { company_id: companyId, status: 'ACTIVE' },
          select: { id: true },
        },
      },
    });
    if (existingUser && existingUser.company_memberships.length > 0) {
      throw new AppError('ALREADY_A_MEMBER', 409, 'This person is already a member of your company');
    }

    // 4. Check no pending invitation
    const pendingInvite = await this.prisma.companyInvitation.findFirst({
      where: {
        company_id: companyId,
        invited_email: data.invited_email,
        status: 'PENDING',
        expires_at: { gte: new Date() },
      },
    });
    if (pendingInvite) {
      throw new AppError(
        'INVITATION_ALREADY_PENDING',
        409,
        'An active invitation has already been sent to this email',
      );
    }

    // 5. Get inviter name for email
    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: inviterUserId },
      select: { full_name: true },
    });

    // 6. Generate token
    const raw = crypto.randomBytes(32).toString('hex');
    const token_hash = sha256Hash(raw);

    // 7. Create invitation
    const invitation = await this.prisma.companyInvitation.create({
      data: {
        company_id: companyId,
        invited_email: data.invited_email,
        role: data.role,
        job_title: data.job_title ?? null,
        invited_by_id: inviterUserId,
        token_hash,
        expires_at: new Date(Date.now() + INVITE_TTL_MS),
        status: 'PENDING',
      },
    });

    // 8. Audit
    await writeAudit(this.prisma, {
      actorId: inviterUserId,
      actionType: 'MEMBER_INVITED',
      entityType: 'CompanyInvitation',
      entityId: invitation.id,
      metadata: {
        company_id: companyId,
        invited_email: data.invited_email,
        role: data.role,
        invited_by: inviterUserId,
      },
    });

    // 9. Build invite URL (existing users get one-click accept)
    const invite_url = emailUrls.joinCompany(raw, existingUser !== null);

    // 10. Queue invitation email
    await this.emailQueue.add('company-member-invitation', {
      type: 'company-member-invitation',
      to: data.invited_email,
      company_name: company.company_name,
      inviter_name: inviter.full_name,
      role: data.role,
      job_title: data.job_title ?? null,
      invite_url,
      expires_at: invitation.expires_at.toISOString(),
    });

    return invitation;
  }

  // ─── ACCEPT INVITATION ────────────────────────────────────────────────────────

  async acceptInvitation(
    token: string,
    data: AcceptInvitationInput | { token: string },
    existingUserId?: string,
  ): Promise<{ company: ConsultingCompany; membership: CompanyMember }> {
    // 1. Hash and look up invitation
    const token_hash = sha256Hash(token);
    const invitation = await this.prisma.companyInvitation.findUnique({
      where: { token_hash },
      include: { company: true },
    });
    if (!invitation) throw new AppError('INVITATION_NOT_FOUND', 404);
    if (invitation.expires_at < new Date()) throw new AppError('INVITATION_EXPIRED', 410);
    if (invitation.status !== 'PENDING') throw new AppError('INVITATION_ALREADY_USED', 409);

    // 2a. Existing user path
    let userId: string;
    if (existingUserId) {
      const existingUser = await this.prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
        select: { id: true, email: true, full_name: true },
      });
      if (existingUser.email !== invitation.invited_email) {
        throw new AppError(
          'EMAIL_MISMATCH',
          403,
          'This invitation was sent to a different email address',
        );
      }
      userId = existingUserId;
    } else {
      // 2b. New user path — requires full_name + password
      const newUserData = data as AcceptInvitationInput;
      if (!newUserData.full_name || !newUserData.password) {
        throw new AppError('VALIDATION_ERROR', 400, 'full_name and password are required for new users');
      }

      const existingAccount = await this.prisma.user.findUnique({
        where: { email: invitation.invited_email },
        select: { id: true },
      });
      if (existingAccount) {
        throw new AppError('EMAIL_IN_USE', 409, 'An account with this email already exists. Please log in and accept the invitation.');
      }

      const password_hash = await bcrypt.hash(newUserData.password, 13);
      const newUser = await this.prisma.user.create({
        data: {
          full_name: newUserData.full_name,
          email: invitation.invited_email,
          password_hash,
          account_type: 'COMPANY_MEMBER',
          email_verified: true, // invitation email itself is verification
          failed_login_count: 0,
        },
      });
      userId = newUser.id;
    }

    // 3. In a transaction: create membership + update invitation
    const now = new Date();
    const { membership } = await this.prisma.$transaction(async (tx) => {
      const createdMembership = await tx.companyMember.create({
        data: {
          company_id: invitation.company_id,
          user_id: userId,
          role: invitation.role,
          job_title: invitation.job_title ?? null,
          is_primary_admin: false,
          invited_by_id: invitation.invited_by_id,
          status: 'ACTIVE',
        },
      });

      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: {
          status: 'ACCEPTED',
          accepted_at: now,
          accepted_by_user_id: userId,
        },
      });

      return { membership: createdMembership };
    });

    // 4. Audit
    await writeAudit(this.prisma, {
      actorId: userId,
      actionType: 'MEMBER_JOINED',
      entityType: 'ConsultingCompany',
      entityId: invitation.company_id,
      metadata: {
        user_id: userId,
        role: invitation.role,
        via_invitation: invitation.id,
      },
    });

    // 5. Notify primary admin via email
    const primaryAdmin = await this.prisma.user.findUnique({
      where: { id: invitation.company.primary_admin_id },
      select: { email: true, full_name: true },
    });
    const member = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { full_name: true },
    });
    if (primaryAdmin && member) {
      await this.emailQueue.add('member-joined-notification', {
        type: 'member-joined-notification',
        to: primaryAdmin.email,
        company_name: invitation.company.company_name,
        member_name: member.full_name,
        role: invitation.role,
        dashboard_url: emailUrls.companyMembers(),
      });
    }

    return { company: invitation.company, membership };
  }

  // ─── REMOVE MEMBER ────────────────────────────────────────────────────────────

  async removeMember(
    companyId: string,
    targetUserId: string,
    requestingUserId: string,
    reason?: string,
  ): Promise<void> {
    // 1. Verify requesting user is COMPANY_ADMIN
    const requesterMembership = await this.prisma.companyMember.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: requestingUserId } },
      select: { role: true },
    });
    if (!requesterMembership || requesterMembership.role !== 'COMPANY_ADMIN') {
      throw new AppError('INSUFFICIENT_COMPANY_ROLE', 403, 'Only Company Admins can remove members');
    }

    // 2. Find target membership
    const targetMembership = await this.prisma.companyMember.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: targetUserId } },
    });
    if (!targetMembership || targetMembership.status === 'REMOVED') {
      throw new AppError('MEMBER_NOT_FOUND', 404);
    }

    // Cannot remove the primary admin
    if (targetMembership.is_primary_admin) {
      throw new AppError(
        'CANNOT_REMOVE_PRIMARY_ADMIN',
        422,
        'The primary admin cannot be removed. Transfer primary admin role first.',
      );
    }

    // 3. Soft-delete
    await this.prisma.companyMember.update({
      where: { company_id_user_id: { company_id: companyId, user_id: targetUserId } },
      data: { status: 'REMOVED', removed_at: new Date() },
    });

    // 4. Unassign from any active orders belonging to this company
    await this.prisma.order.updateMany({
      where: {
        company_id: companyId,
        executing_member_id: targetUserId,
        status: { in: ['PAYMENT_HELD', 'IN_PROGRESS', 'PENDING_REVIEW', 'REVISION_REQUESTED'] },
      },
      data: { executing_member_id: null },
    });

    // 5. Audit
    await writeAudit(this.prisma, {
      actorId: requestingUserId,
      actionType: 'MEMBER_REMOVED',
      entityType: 'CompanyMember',
      entityId: targetMembership.id,
      metadata: { removed_by: requestingUserId, reason: reason ?? null },
    });

    // 6. Email to removed member
    const [removedUser, company] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { email: true },
      }),
      this.prisma.consultingCompany.findUnique({
        where: { id: companyId },
        select: { company_name: true },
      }),
    ]);
    if (removedUser && company) {
      await this.emailQueue.add('company-membership-removed', {
        type: 'company-membership-removed',
        to: removedUser.email,
        company_name: company.company_name,
        reason: reason ?? null,
      });
    }
  }

  // ─── ASSIGN MEMBER TO ORDER ───────────────────────────────────────────────────

  async assignMemberToOrder(
    orderId: string,
    memberUserId: string,
    requestingUserId: string,
    note?: string,
  ) {
    // 1. Find order and verify it belongs to a company
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { task: { select: { title: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (!order.company_id) throw new AppError('NOT_A_COMPANY_ORDER', 422, 'This order does not belong to a company');

    const companyId = order.company_id;

    // 2. Verify requesting user has sufficient role
    const requesterMembership = await this.prisma.companyMember.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: requestingUserId } },
      select: { role: true },
    });
    if (
      !requesterMembership ||
      requesterMembership.role === 'CONSULTANT' ||
      requesterMembership.role === 'JUNIOR_CONSULTANT'
    ) {
      throw new AppError('INSUFFICIENT_COMPANY_ROLE', 403, 'Only Company Admins and Senior Consultants can assign orders');
    }

    // 3. Verify target is an active member of the company
    const memberMembership = await this.prisma.companyMember.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: memberUserId } },
      select: { id: true, status: true },
    });
    if (!memberMembership || memberMembership.status !== 'ACTIVE') {
      throw new AppError('MEMBER_NOT_ACTIVE', 422, 'Target member is not an active member of this company');
    }

    // 4. Verify order is in an assignable state.
    //    Company orders use company_order_status to track their workflow —
    //    the regular status field stays as SCOPED until the customer pays
    //    the invoice (post-delivery). Assignment happens at PO_GENERATED.
    const assignableCompanyStatuses = ['PO_GENERATED', 'IN_PROGRESS'];
    if (
      !order.company_order_status ||
      !assignableCompanyStatuses.includes(order.company_order_status)
    ) {
      throw new AppError(
        'INVALID_COMPANY_ORDER_STATUS',
        422,
        order.company_order_status
          ? `Cannot assign a member at this stage. Order is currently: ${order.company_order_status.replace(/_/g, ' ')}. Assignment is available after the customer approves the proposal (PO Generated stage).`
          : 'Order does not have a company workflow status.',
      );
    }

    // 5. Update order: assign member and advance company_order_status to IN_PROGRESS
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        executing_member_id: memberUserId,
        company_order_status: 'IN_PROGRESS',
      },
    });

    // 6. Audit
    await writeAudit(this.prisma, {
      actorId: requestingUserId,
      actionType: 'MEMBER_ASSIGNED_TO_ORDER',
      entityType: 'Order',
      entityId: orderId,
      metadata: {
        member_user_id: memberUserId,
        assigned_by: requestingUserId,
        note: note ?? null,
      },
    });

    // 7. Notify assigned member
    const [assignedUser, company] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: memberUserId },
        select: { email: true, full_name: true },
      }),
      this.prisma.consultingCompany.findUnique({
        where: { id: companyId },
        select: { company_name: true },
      }),
    ]);
    if (assignedUser && company) {
      await this.emailQueue.add('order-assigned-to-member', {
        type: 'order-assigned-to-member',
        to: assignedUser.email,
        member_name: assignedUser.full_name,
        company_name: company.company_name,
        task_title: order.task?.title ?? 'Order',
        order_id: orderId,
        note: note ?? null,
        order_url: emailUrls.companyOrder(orderId),
      });
    }

    return updated;
  }

  // ─── GET COMPANY PROFILE (public) ────────────────────────────────────────────

  async getCompanyProfile(companyId: string) {
    const company = await this.prisma.consultingCompany.findUnique({
      where: { id: companyId },
      include: {
        members: {
          where: {
            status: 'ACTIVE',
            role: { in: ['COMPANY_ADMIN', 'SENIOR_CONSULTANT'] },
          },
          include: {
            user: { select: { id: true, full_name: true } },
          },
        },
        tasks: {
          where: { status: 'PUBLISHED' },
          select: {
            id: true,
            title: true,
            domain: true,
            price_aud: true,
            hours_min: true,
            hours_max: true,
            order_count: true,
          },
        },
        _count: {
          select: { members: true, tasks: true, orders: true },
        },
      },
    });

    if (!company || company.status !== 'ACTIVE') {
      throw new AppError('COMPANY_NOT_FOUND', 404);
    }

    return company;
  }

  // ─── GET COMPANY DASHBOARD (admin panel) ─────────────────────────────────────

  async getCompanyDashboard(companyId: string) {
    const company = await this.prisma.consultingCompany.findUnique({
      where: { id: companyId },
      include: {
        primary_admin: {
          select: { id: true, email: true, full_name: true, email_verified: true, created_at: true },
        },
        members: {
          include: {
            user: { select: { id: true, email: true, full_name: true, last_login_at: true } },
          },
          orderBy: { joined_at: 'asc' },
        },
        invitations: {
          where: { status: 'PENDING', expires_at: { gte: new Date() } },
          select: {
            id: true,
            invited_email: true,
            role: true,
            expires_at: true,
            created_at: true,
          },
        },
        insurance_certificates: {
          orderBy: { created_at: 'desc' },
        },
        stripe_connect_account: true,
        _count: {
          select: { members: true, tasks: true, orders: true, payout_records: true },
        },
      },
    });

    if (!company) throw new AppError('COMPANY_NOT_FOUND', 404);

    return company;
  }
}
