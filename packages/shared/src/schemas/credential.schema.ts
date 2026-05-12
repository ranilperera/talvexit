import { z } from 'zod';

// ─── storeCredentialSchema ────────────────────────────────────────────────────

export const storeCredentialSchema = z.object({
  label: z
    .string()
    .min(3, 'Label must be at least 3 characters')
    .max(120, 'Label must be under 120 characters')
    .trim(),
  credential_type: z.enum(['SSH_KEY', 'PASSWORD', 'API_KEY', 'VPN_CONFIG', 'OTHER']),
  value: z
    .string()
    .min(1, 'Credential value cannot be empty')
    .max(65536, 'Credential value exceeds 64KB limit'),
  // Azure Key Vault secret max is 25KB for the value but
  // we set 64KB as a hard client limit — KV will reject beyond 25KB
});

// ─── confirmRevokedSchema ─────────────────────────────────────────────────────

export const confirmRevokedSchema = z.object({
  confirmation: z.literal(true, {
    errorMap: () => ({ message: 'confirmation must be true' }),
  }),
  notes: z.string().max(500).optional(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type StoreCredentialInput = z.infer<typeof storeCredentialSchema>;
export type ConfirmRevokedInput = z.infer<typeof confirmRevokedSchema>;
