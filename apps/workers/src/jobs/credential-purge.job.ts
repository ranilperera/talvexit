import { Worker, Queue } from 'bullmq';
import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential, ClientSecretCredential } from '@azure/identity';
import { prisma } from '../lib/prisma.js';

// ─── Job data type ────────────────────────────────────────────────────────────

export type CredentialPurgeJobData = {
  order_id: string;
  triggered_by: 'order_completed' | 'order_cancelled' | 'admin';
  scheduled_for: string; // ISO timestamp — for logging
};

type EmailJobPayload = {
  type: string;
  to?: string;
  [key: string]: unknown;
};

// ─── Connection ───────────────────────────────────────────────────────────────

import { redisConnection as connection } from '../lib/redis.js';

const emailQueue = new Queue<EmailJobPayload>('email', { connection });

// ─── Azure Key Vault client (local copy — rootDir prevents cross-package import) ──

function buildKvCredential() {
  if (process.env.AZURE_CLIENT_SECRET) {
    return new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!,
    );
  }
  return new DefaultAzureCredential();
}

const kvClient = new SecretClient(process.env.AZURE_KEYVAULT_URL!, buildKvCredential());

async function deleteKvSecret(secretName: string): Promise<void> {
  try {
    const poller = await kvClient.beginDeleteSecret(secretName);
    await poller.pollUntilDone();
    await kvClient.purgeDeletedSecret(secretName);
  } catch (err: unknown) {
    const e = err as { statusCode?: number };
    if (e?.statusCode === 404) {
      console.warn(`[credential-purge] Secret not found during delete: ${secretName}`);
      return;
    }
    throw err;
  }
}

// ─── Core purge logic ─────────────────────────────────────────────────────────

async function purgeOrderCredentials(
  orderId: string,
): Promise<{ purged_count: number; failed_count: number; failed_ids: string[] }> {
  const creds = await prisma.orderAccessCredential.findMany({
    where: { order_id: orderId, is_active: true },
  });

  if (creds.length === 0) {
    return { purged_count: 0, failed_count: 0, failed_ids: [] };
  }

  const now = new Date();
  let purged_count = 0;
  let failed_count = 0;
  const failed_ids: string[] = [];

  for (const cred of creds) {
    try {
      await deleteKvSecret(cred.keyvault_secret_name);

      await prisma.orderAccessCredential.update({
        where: { id: cred.id },
        data: { is_active: false, purged_at: now },
      });

      await prisma.credentialAccessLog.create({
        data: {
          credential_id: cred.id,
          order_id: orderId,
          event_type: 'PURGED',
          actor_user_id: null,
          purge_result: 'SUCCESS',
        },
      });

      purged_count++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      await prisma.credentialAccessLog.create({
        data: {
          credential_id: cred.id,
          order_id: orderId,
          event_type: 'PURGED',
          actor_user_id: null,
          purge_result: `FAILED: ${message}`,
        },
      });

      failed_ids.push(cred.id);
      failed_count++;
      console.error(
        `[credential-purge] Failed to delete ${cred.keyvault_secret_name}: ${message}`,
      );
    }
  }

  return { purged_count, failed_count, failed_ids };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const credentialPurgeWorker = new Worker<CredentialPurgeJobData>(
  'credential-purge',
  async (job) => {
    const { order_id, triggered_by, scheduled_for } = job.data;

    console.log(
      `[credential-purge] Starting purge: order=${order_id} trigger=${triggered_by} scheduled_for=${scheduled_for}`,
    );

    // Find order — confirm it is still closed
    const order = await prisma.order.findUnique({
      where: { id: order_id },
      select: {
        status: true,
        customer_id: true,
        credentials_revoked_confirmed_at: true,
        customer: { select: { email: true, full_name: true } },
        contractor_user: { select: { email: true, full_name: true } },
      },
    });

    if (!order) {
      console.error(`[credential-purge] Order not found: ${order_id}`);
      return;
    }

    // Safety check — only purge closed orders
    const closedStatuses = ['COMPLETED', 'CANCELLED'];
    if (!closedStatuses.includes(order.status)) {
      console.warn(
        `[credential-purge] Order ${order_id} is ${order.status} — not purging.`,
      );
      return;
    }

    // Run the purge
    const results = await purgeOrderCredentials(order_id);

    console.log(
      `[credential-purge] Purge complete: order=${order_id} purged=${results.purged_count} failed=${results.failed_count}`,
    );

    // Record purge completion on the order
    await prisma.order.update({
      where: { id: order_id },
      data: { credential_purge_scheduled_at: new Date() },
    });

    // Send revoke reminder to customer if they haven't confirmed yet
    if (!order.credentials_revoked_confirmed_at && order.customer?.email) {
      await emailQueue.add('credential-revoke-reminder', {
        type: 'credentials-revoke-reminder',
        to: order.customer.email,
        order_id,
        customer_name: order.customer.full_name,
        purged_count: results.purged_count,
        confirm_url: `${process.env.FRONTEND_URL}/orders/${order_id}/credentials/confirm-revoked`,
        message:
          'All credentials stored in the onys.online vault for this order have been automatically deleted. ' +
          'If you shared access credentials with the contractor, please rotate or revoke them now on your own systems.',
      });
    }

    // Alert admin if any purges failed
    if (results.failed_count > 0) {
      await emailQueue.add('credential-purge-failure-admin', {
        type: 'admin-credential-purge-failure',
        order_id,
        failed_count: results.failed_count,
        failed_credentials: results.failed_ids,
      });
      console.error(
        `[credential-purge] ${results.failed_count} secrets failed for order ${order_id} — admin alerted`,
      );
    }
  },
  { connection },
);

credentialPurgeWorker.on('failed', (job, err) => {
  console.error(`[credential-purge] Job failed: order=${job?.data?.order_id}`, err);
});

credentialPurgeWorker.on('completed', (job) => {
  console.log(`[credential-purge] Job done: order=${job?.data?.order_id}`);
});
