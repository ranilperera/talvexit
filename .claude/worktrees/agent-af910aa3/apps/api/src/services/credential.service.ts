import type { PrismaClient } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { StoreCredentialInput, ConfirmRevokedInput } from '@onys/shared';
import {
  buildSecretName,
  storeSecret,
  getSecretValue,
  deleteSecret,
} from './keyvault.service.js';
import { writeAudit } from '../utils/audit.js';
import { AppError } from '../lib/errors.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

type RequestMeta = { ip: string; userAgent: string };

export type CredentialListItem = {
  id: string;
  label: string;
  credential_type: string;
  access_count: number;
  last_accessed_at: Date | null;
  last_accessed_by_id: string | null;
  last_accessed_ip: string | null;
  created_at: Date;
};

// ─── CredentialService ────────────────────────────────────────────────────────

export class CredentialService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailQueue: Queue<EmailJobPayload>,
  ) {}

  // ─── storeCredential ───────────────────────────────────────────────────────

  async storeCredential(
    orderId: string,
    customerId: string,
    data: StoreCredentialInput,
    meta: RequestMeta,
  ): Promise<{ credential_id: string; label: string; credential_type: string }> {
    // 1. Find order
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        contractor_user: { select: { email: true } },
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // 2. Verify requesting user is the customer
    if (order.customer_id !== customerId) {
      throw new AppError('FORBIDDEN', 403, 'Only the customer can store credentials for this order');
    }

    // 3. Check order is in an active state
    const allowedStatuses = [
      'ACCEPTED',
      'PAYMENT_HELD',
      'IN_PROGRESS',
      'PENDING_REVIEW',
      'REVISION_REQUESTED',
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new AppError(
        'ORDER_NOT_ACTIVE',
        422,
        `Cannot store credentials for order in ${order.status} status. Credentials can only be added to active orders.`,
      );
    }

    // 4. Create record with PENDING secret name to get the cred ID
    const cred = await this.prisma.orderAccessCredential.create({
      data: {
        order_id: orderId,
        stored_by_user_id: customerId,
        label: data.label,
        credential_type: data.credential_type as never,
        keyvault_secret_name: 'PENDING',
        is_active: true,
      },
    });

    // 5. Build real secret name and update record
    const secretName = buildSecretName(orderId, cred.id);
    await this.prisma.orderAccessCredential.update({
      where: { id: cred.id },
      data: { keyvault_secret_name: secretName },
    });

    // 6. Calculate expiry
    let expiresOn: Date | undefined;
    if (order.work_started_at) {
      const scope = order.scope_snapshot as Record<string, unknown> | null;
      const maxHours = (scope?.hours_max as number | undefined) ?? 8;
      expiresOn = new Date(
        order.work_started_at.getTime() + maxHours * 2 * 24 * 60 * 60 * 1000,
      );
    }

    // 7. Store value in Azure Key Vault
    const kvResult = await storeSecret({
      secretName,
      value: data.value,
      ...(expiresOn && { expiresOn }),
      contentType: data.credential_type,
      tags: {
        order_id: orderId,
        credential_id: cred.id,
        stored_by: customerId,
        platform: 'onys.online',
      },
    });

    // 8. Update record with version
    await this.prisma.orderAccessCredential.update({
      where: { id: cred.id },
      data: { keyvault_secret_version: kvResult.version },
    });

    // 9. Append STORED access log
    await this.prisma.credentialAccessLog.create({
      data: {
        credential_id: cred.id,
        order_id: orderId,
        event_type: 'STORED',
        actor_user_id: customerId,
        actor_ip: meta.ip,
        actor_user_agent: meta.userAgent,
      },
    });

    // 10. Audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'CREDENTIAL_STORED',
      entityType: 'OrderAccessCredential',
      entityId: cred.id,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        label: data.label,
        credential_type: data.credential_type,
        secret_name: secretName,
        order_id: orderId,
      },
    });

    // 11. Notify contractor
    if (order.contractor_user?.email) {
      await this.emailQueue.add('credential-stored', {
        type: 'credential-available',
        to: order.contractor_user.email,
        order_id: orderId,
        label: data.label,
        credential_type: data.credential_type,
        retrieve_url: `${process.env.FRONTEND_URL}/orders/${orderId}/credentials`,
      });
    }

    // 12. Return (no value)
    return {
      credential_id: cred.id,
      label: cred.label,
      credential_type: data.credential_type,
    };
  }

  // ─── listCredentials ───────────────────────────────────────────────────────

  async listCredentials(
    orderId: string,
    requestingUserId: string,
  ): Promise<CredentialListItem[]> {
    // 1. Verify user is customer or contractor
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customer_id: true, contractor_user_id: true },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    const isParty =
      order.customer_id === requestingUserId ||
      order.contractor_user_id === requestingUserId;
    if (!isParty) throw new AppError('FORBIDDEN', 403);

    // 2. Fetch active credentials (no values)
    const creds = await this.prisma.orderAccessCredential.findMany({
      where: { order_id: orderId, is_active: true },
      select: {
        id: true,
        label: true,
        credential_type: true,
        access_count: true,
        last_accessed_at: true,
        last_accessed_by_id: true,
        last_accessed_ip: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
    });

    return creds.map((c) => ({
      id: c.id,
      label: c.label,
      credential_type: c.credential_type as string,
      access_count: c.access_count,
      last_accessed_at: c.last_accessed_at,
      last_accessed_by_id: c.last_accessed_by_id,
      last_accessed_ip: c.last_accessed_ip,
      created_at: c.created_at,
    }));
  }

  // ─── retrieveCredentialValue ───────────────────────────────────────────────

  async retrieveCredentialValue(
    orderId: string,
    credentialId: string,
    contractorUserId: string,
    meta: RequestMeta,
  ): Promise<{ value: string; label: string; credential_type: string }> {
    // 1. Find order and verify contractor
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { contractor_user_id: true, status: true },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    if (order.contractor_user_id !== contractorUserId) {
      throw new AppError('FORBIDDEN', 403, 'Only the assigned contractor can retrieve credentials');
    }

    // 2. Require IN_PROGRESS status
    if (order.status !== 'IN_PROGRESS') {
      throw new AppError(
        'ORDER_NOT_ACTIVE',
        403,
        `Credential retrieval requires order to be IN_PROGRESS. Current status: ${order.status}`,
      );
    }

    // 3. Find credential
    const cred = await this.prisma.orderAccessCredential.findFirst({
      where: { id: credentialId, order_id: orderId },
    });
    if (!cred) throw new AppError('CREDENTIAL_NOT_FOUND', 404);
    if (!cred.is_active) throw new AppError('CREDENTIAL_DELETED', 410);

    // 4. Retrieve value from Key Vault
    const { value, version } = await getSecretValue(
      cred.keyvault_secret_name,
      cred.keyvault_secret_version ?? undefined,
    );

    // 5. Update access metrics
    await this.prisma.orderAccessCredential.update({
      where: { id: credentialId },
      data: {
        access_count: { increment: 1 },
        last_accessed_at: new Date(),
        last_accessed_by_id: contractorUserId,
        last_accessed_ip: meta.ip,
      },
    });

    // 6. Append RETRIEVED access log
    await this.prisma.credentialAccessLog.create({
      data: {
        credential_id: credentialId,
        order_id: orderId,
        event_type: 'RETRIEVED',
        actor_user_id: contractorUserId,
        actor_ip: meta.ip,
        actor_user_agent: meta.userAgent,
        secret_version_read: version,
      },
    });

    // 7. Audit
    void writeAudit(this.prisma, {
      actorId: contractorUserId,
      actionType: 'CREDENTIAL_RETRIEVED',
      entityType: 'OrderAccessCredential',
      entityId: credentialId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        label: cred.label,
        order_id: orderId,
        contractor_id: contractorUserId,
        ip: meta.ip,
      },
    });

    // 8. Return value — not cached server-side after this response
    return {
      value,
      label: cred.label,
      credential_type: cred.credential_type as string,
    };
  }

  // ─── deleteCredential ──────────────────────────────────────────────────────

  async deleteCredential(
    orderId: string,
    credentialId: string,
    customerId: string,
    meta: RequestMeta,
  ): Promise<{ deleted: boolean; credential_id: string }> {
    // 1. Find order and verify customer
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customer_id: true },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    // 2. Find credential
    const cred = await this.prisma.orderAccessCredential.findFirst({
      where: { id: credentialId, order_id: orderId },
    });
    if (!cred) throw new AppError('CREDENTIAL_NOT_FOUND', 404);
    if (!cred.is_active) throw new AppError('CREDENTIAL_NOT_FOUND', 404);

    // 3. Delete from Key Vault
    await deleteSecret(cred.keyvault_secret_name);

    // 4. Soft-delete DB record
    await this.prisma.orderAccessCredential.update({
      where: { id: credentialId },
      data: {
        is_active: false,
        deleted_at: new Date(),
        deleted_by_user_id: customerId,
      },
    });

    // 5. Append DELETED access log
    await this.prisma.credentialAccessLog.create({
      data: {
        credential_id: credentialId,
        order_id: orderId,
        event_type: 'DELETED',
        actor_user_id: customerId,
        actor_ip: meta.ip,
        actor_user_agent: meta.userAgent,
      },
    });

    // 6. Audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'CREDENTIAL_DELETED',
      entityType: 'OrderAccessCredential',
      entityId: credentialId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { label: cred.label, order_id: orderId, deleted_by: customerId },
    });

    return { deleted: true, credential_id: credentialId };
  }

  // ─── confirmCredentialsRevoked ─────────────────────────────────────────────

  async confirmCredentialsRevoked(
    orderId: string,
    customerId: string,
    data: ConfirmRevokedInput,
    meta: RequestMeta,
  ): Promise<{ confirmed_at: Date; message: string }> {
    // 1. Find order and verify customer
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customer_id: true,
        status: true,
        credentials_revoked_confirmed_at: true,
      },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);
    if (order.customer_id !== customerId) throw new AppError('FORBIDDEN', 403);

    // 2. Require closed order
    if (order.status !== 'COMPLETED' && order.status !== 'CANCELLED') {
      throw new AppError(
        'ORDER_NOT_CLOSED',
        422,
        'Credentials can only be confirmed revoked after order closure',
      );
    }

    // 3. Already confirmed — idempotent
    if (order.credentials_revoked_confirmed_at) {
      return {
        confirmed_at: order.credentials_revoked_confirmed_at,
        message: 'Already confirmed.',
      };
    }

    // 4. Update order
    const now = new Date();
    await this.prisma.order.update({
      where: { id: orderId },
      data: { credentials_revoked_confirmed_at: now },
    });

    // 5. Audit
    void writeAudit(this.prisma, {
      actorId: customerId,
      actionType: 'CREDENTIALS_REVOKE_CONFIRMED',
      entityType: 'Order',
      entityId: orderId,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
      metadata: { confirmed_by: customerId, ...(data.notes && { notes: data.notes }) },
    });

    return {
      confirmed_at: now,
      message: 'Thank you. Credential revocation recorded.',
    };
  }

  // ─── purgeOrderCredentials ─────────────────────────────────────────────────
  // Called ONLY by BullMQ purge job or admin action — not exposed via routes directly.

  async purgeOrderCredentials(
    orderId: string,
    callerContext: 'scheduled_job' | 'admin_manual',
  ): Promise<{
    purged_count: number;
    failed_count: number;
    results: Array<{ credential_id: string; success: boolean; error?: string }>;
  }> {
    // 1. Find all active credentials for this order
    const creds = await this.prisma.orderAccessCredential.findMany({
      where: { order_id: orderId, is_active: true },
    });
    if (creds.length === 0) {
      return { purged_count: 0, failed_count: 0, results: [] };
    }

    // 2. Attempt KV deletion for each — collect results, don't fail fast
    const results: Array<{ credential_id: string; success: boolean; error?: string }> = [];
    const now = new Date();

    for (const cred of creds) {
      try {
        await deleteSecret(cred.keyvault_secret_name);
        results.push({ credential_id: cred.id, success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ credential_id: cred.id, success: false, error: message });
      }
    }

    // 3. Process successful deletions
    for (const result of results.filter((r) => r.success)) {
      await this.prisma.orderAccessCredential.update({
        where: { id: result.credential_id },
        data: { is_active: false, purged_at: now },
      });
      await this.prisma.credentialAccessLog.create({
        data: {
          credential_id: result.credential_id,
          order_id: orderId,
          event_type: 'PURGED',
          actor_user_id: null,
          purge_result: 'SUCCESS',
        },
      });
    }

    // 4. Process failed deletions
    for (const result of results.filter((r) => !r.success)) {
      await this.prisma.credentialAccessLog.create({
        data: {
          credential_id: result.credential_id,
          order_id: orderId,
          event_type: 'PURGED',
          actor_user_id: null,
          purge_result: `FAILED: ${result.error ?? 'unknown'}`,
        },
      });
      void writeAudit(this.prisma, {
        actionType: 'CREDENTIAL_PURGE_FAILED',
        entityType: 'OrderAccessCredential',
        entityId: result.credential_id,
        metadata: {
          order_id: orderId,
          error: result.error ?? 'unknown',
          caller: callerContext,
        },
      });
    }

    const purged_count = results.filter((r) => r.success).length;
    const failed_count = results.filter((r) => !r.success).length;

    // 5. Audit summary
    void writeAudit(this.prisma, {
      actionType: 'CREDENTIAL_PURGE_COMPLETE',
      entityType: 'Order',
      entityId: orderId,
      metadata: { purged_count, failed_count, caller: callerContext },
    });

    return { purged_count, failed_count, results };
  }
}
