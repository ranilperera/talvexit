import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(12)
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

export const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  account_type: z.enum(['CUSTOMER', 'INDIVIDUAL_CONTRACTOR', 'ORGANIZATION_ADMIN']),
  full_name: z.string().min(2).max(100).trim(),
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
