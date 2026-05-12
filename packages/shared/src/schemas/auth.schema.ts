import { z } from 'zod';

// Cap at 72: bcrypt silently truncates input beyond 72 bytes, so accepting
// longer strings creates collisions where two distinct passwords hash equal.
const passwordSchema = z
  .string()
  .min(12)
  .max(72)
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

export const CONTRACTOR_ENTITY_TYPES = [
  'AU_SOLE_TRADER',
  'OVERSEAS_INDIVIDUAL',
] as const;
export type ContractorEntityType = typeof CONTRACTOR_ENTITY_TYPES[number];

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  account_type: z.enum(['CUSTOMER', 'INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN']),
  full_name: z.string().min(2).max(100).trim(),
  // Contractor-only: entity type determines tax/payment treatment
  entity_type: z.enum(CONTRACTOR_ENTITY_TYPES).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const totpCodeSchema = z.object({
  totp_code: z.string().length(6).regex(/^[0-9]+$/),
});
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const mfaValidateSchema = z.object({
  mfa_token: z.string().min(1),
  totp_code: z.string().length(6).regex(/^[0-9]+$/),
});
export type MfaValidateInput = z.infer<typeof mfaValidateSchema>;
