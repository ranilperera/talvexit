import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential, ClientSecretCredential } from '@azure/identity';

// ─── Credential builder ───────────────────────────────────────────────────────
// Use managed identity in production (k3s on Azure),
// service principal in local dev (AZURE_CLIENT_SECRET in .env)

function buildCredential() {
  if (process.env.AZURE_CLIENT_SECRET) {
    return new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!,
    );
  }
  // In production (Azure VM with managed identity) — no secrets needed
  return new DefaultAzureCredential();
}

export const keyVaultClient = new SecretClient(
  process.env.AZURE_KEYVAULT_URL!,
  buildCredential(),
);

// ─── buildSecretName ──────────────────────────────────────────────────────────
// Key Vault secret names must match: ^[a-zA-Z0-9-]{1,127}$
// Our convention: onys-order-{order_id}-{cred_id}
// cuid IDs contain only alphanumeric chars which satisfies the constraint

export function buildSecretName(orderId: string, credentialId: string): string {
  const safeOrderId = orderId.replace(/[^a-zA-Z0-9]/g, '');
  const safeCredId = credentialId.replace(/[^a-zA-Z0-9]/g, '');
  const name = `onys-order-${safeOrderId}-${safeCredId}`;
  if (name.length > 127) {
    throw new Error(`Secret name too long: ${name.length} chars`);
  }
  return name;
}

// ─── storeSecret ─────────────────────────────────────────────────────────────

export async function storeSecret(params: {
  secretName: string;
  value: string;
  expiresOn?: Date;
  contentType?: string;
  tags?: Record<string, string>;
}): Promise<{ version: string; name: string }> {
  const result = await keyVaultClient.setSecret(params.secretName, params.value, {
    ...(params.contentType && { contentType: params.contentType }),
    ...(params.tags && { tags: params.tags }),
    ...(params.expiresOn && { expiresOn: params.expiresOn }),
  });

  // Extract version from the secret ID URL
  // ID format: https://vault.azure.net/secrets/{name}/{version}
  const version =
    result.properties.version ?? result.properties.id?.split('/').pop() ?? 'unknown';

  return { version, name: params.secretName };
}

// ─── getSecretValue ───────────────────────────────────────────────────────────

export async function getSecretValue(
  secretName: string,
  version?: string,
): Promise<{ value: string; version: string }> {
  try {
    const result = await keyVaultClient.getSecret(
      secretName,
      version ? { version } : undefined,
    );

    if (!result.value) {
      throw new Error('Secret has no value — may be disabled or purged');
    }

    return {
      value: result.value,
      version: result.properties.version ?? 'unknown',
    };
  } catch (err: unknown) {
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (e?.code === 'SecretNotFound' || e?.statusCode === 404) {
      throw Object.assign(new Error(`Secret not found: ${secretName}`), {
        code: 'SECRET_NOT_FOUND',
        status: 404,
      });
    }
    if (e?.code === 'SecretDisabled') {
      throw Object.assign(new Error(`Secret is disabled: ${secretName}`), {
        code: 'SECRET_DISABLED',
        status: 410,
      });
    }
    throw err;
  }
}

// ─── deleteSecret ─────────────────────────────────────────────────────────────
// beginDeleteSecret starts a soft-delete operation.
// In KV with soft-delete enabled (default), the secret moves to "deleted"
// state for 90 days before purge. We call purgeDeletedSecret immediately
// after to hard-delete. Requires 'purge' permission on the KV access policy.

export async function deleteSecret(secretName: string): Promise<void> {
  try {
    const poller = await keyVaultClient.beginDeleteSecret(secretName);
    await poller.pollUntilDone();
    await keyVaultClient.purgeDeletedSecret(secretName);
  } catch (err: unknown) {
    const e = err as { statusCode?: number };
    if (e?.statusCode === 404) {
      // Already deleted — treat as success
      console.warn(`[keyvault] Secret not found during delete: ${secretName}`);
      return;
    }
    throw err;
  }
}

// ─── listSecretsForOrder ──────────────────────────────────────────────────────

export async function listSecretsForOrder(orderId: string): Promise<string[]> {
  const prefix = `onys-order-${orderId.replace(/[^a-zA-Z0-9]/g, '')}-`;
  const names: string[] = [];

  for await (const secretProp of keyVaultClient.listPropertiesOfSecrets()) {
    if (secretProp.name?.startsWith(prefix) && secretProp.enabled !== false) {
      names.push(secretProp.name);
    }
  }

  return names;
}

// ─── disableSecret ────────────────────────────────────────────────────────────
// Disable (not delete) — used as a soft-disable before hard purge

export async function disableSecret(secretName: string): Promise<void> {
  await keyVaultClient.updateSecretProperties(secretName, '', {
    enabled: false,
  });
}
