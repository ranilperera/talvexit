import { z } from 'zod';

// ─── ABN validation — 11-digit Australian Business Number ─────────────────────
function isValidAbn(abn: string): boolean {
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = abn.replace(/\s/g, '').split('').map(Number);
  if (digits.length !== 11) return false;
  digits[0] -= 1;
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i]!, 0);
  return sum % 89 === 0;
}

const australianState = z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']);

const companyMemberRole = z.enum([
  'COMPANY_ADMIN',
  'SENIOR_CONSULTANT',
  'CONSULTANT',
  'JUNIOR_CONSULTANT',
]);

// ─── Minimal company registration ────────────────────────────────────────────
// Collects only what is needed to create the account.
// All other details (ABN, address, domains, authority doc, etc.) are completed
// via PATCH /companies/me after login, then submitted via POST /companies/me/submit-for-review.
export const registerCompanySchema = z.object({
  full_name:    z.string().min(2).max(120).trim(),
  email:        z.string().email().toLowerCase(),
  password:     z.string().min(8).max(128),
  company_name: z.string().min(2).max(200).trim(),
  job_title:    z.string().min(2).max(120).trim(),
  country:      z.string().min(2).max(2).toUpperCase().default('AU'),
  // ABN is optional — overseas companies don't have one.
  // If provided for AU companies it is validated.
  abn: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .refine((v) => /^\d{11}$/.test(v), 'ABN must be 11 digits')
    .refine(isValidAbn, 'Invalid ABN — please check and re-enter')
    .optional()
    .or(z.literal('')),
  agreed_to_terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and privacy policy' }),
  }),
});

// ─── Submit for review — required fields checklist ────────────────────────────
// Validated server-side when the company admin clicks "Submit for verification".
export const submitForReviewSchema = z.object({
  // Confirms the admin has reviewed the checklist before submitting
  confirmed: z.literal(true, {
    errorMap: () => ({ message: 'Please confirm your details are complete and accurate' }),
  }),
});

// ─── Invite a company member ──────────────────────────────────────────────────
export const inviteCompanyMemberSchema = z.object({
  invited_email: z.string().email(),
  role: companyMemberRole,
  job_title: z.string().min(2).max(120).trim().optional(),
  member_domains: z.array(z.string()).max(14).default([]),
});

// ─── Accept invitation (new user — registers via invite link) ─────────────────
export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  full_name: z.string().min(2).max(120).trim(),
  password: z.string().min(8).max(128),
  confirmed: z.literal(true),
});

// ─── Accept invitation (existing user) ───────────────────────────────────────
export const acceptInvitationExistingSchema = z.object({
  token: z.string().min(1),
});

// ─── Update member role ───────────────────────────────────────────────────────
export const updateMemberRoleSchema = z.object({
  role: companyMemberRole,
  job_title: z.string().max(120).optional(),
  member_domains: z.array(z.string()).max(14).optional(),
});

// ─── Assign member to order ───────────────────────────────────────────────────
export const assignMemberSchema = z.object({
  member_user_id: z.string().cuid(),
  assignment_note: z.string().max(500).optional(),
});

// ─── Update company profile ───────────────────────────────────────────────────
export const updateCompanyProfileSchema = z.object({
  // Core identity
  company_name:        z.string().min(2).max(200).trim().optional(),
  legal_company_name:  z.string().max(300).trim().optional(),
  trading_name:        z.string().max(300).trim().optional(),
  entity_type:         z.string().max(50).optional(),
  acn:                 z.string().regex(/^\d{9}$/, 'ACN must be 9 digits').optional().or(z.literal('')),
  founded_year:        z.preprocess((v) => (v === '' || v === null ? undefined : v), z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional()),
  company_size:        z.enum(['SOLO', 'SMALL_2_10', 'MEDIUM_11_50', 'LARGE_51_200', 'ENTERPRISE_200_PLUS']).optional().or(z.literal('')),
  description:         z.string().max(2000).trim().optional(),
  website_url:         z.string().url().optional().or(z.literal('')),
  phone:               z.string().max(20).optional(),
  // Location
  business_address:    z.string().max(300).trim().optional(),
  state:               australianState.optional().or(z.literal('')),
  postcode:            z.string().regex(/^\d{4}$/).optional().or(z.literal('')),
  domains:             z.array(z.string()).min(1).max(14).optional(),
  // Tax
  abn:                 z.string().regex(/^\d{11}$/, 'ABN must be 11 digits').optional().or(z.literal('')),
  anzsic_code:         z.string().max(10).optional(),
  gst_registered:      z.boolean().optional(),
  tax_residency_country: z.string().min(0).max(2).optional(),
  is_foreign_entity:   z.boolean().optional(),
  vat_number:          z.string().max(30).optional(),
  // Billing contact
  billing_email:       z.string().email().optional().or(z.literal('')),
  billing_phone:       z.string().max(20).optional(),
  billing_address_1:   z.string().max(200).optional(),
  billing_address_2:   z.string().max(200).optional(),
  billing_city:        z.string().max(100).optional(),
  billing_state:       z.string().max(50).optional(),
  billing_postcode:    z.string().max(10).optional(),
  billing_country:     z.string().min(0).max(2).optional(),
  // Certifications & compliance
  certifications:      z.array(z.unknown()).optional(),
  compliance_documents: z.array(z.unknown()).optional(),
});

// ─── Revoke an invitation ─────────────────────────────────────────────────────
export const revokeInvitationSchema = z.object({
  invitation_id: z.string().cuid(),
});

// ─── List members query ───────────────────────────────────────────────────────
export const listMembersSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
  role: companyMemberRole.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Types ────────────────────────────────────────────────────────────────────
export type RegisterCompanyInput      = z.infer<typeof registerCompanySchema>;
export type SubmitForReviewInput      = z.infer<typeof submitForReviewSchema>;
export type InviteCompanyMemberInput  = z.infer<typeof inviteCompanyMemberSchema>;
export type AcceptInvitationInput     = z.infer<typeof acceptInvitationSchema>;
export type UpdateMemberRoleInput     = z.infer<typeof updateMemberRoleSchema>;
export type AssignMemberInput         = z.infer<typeof assignMemberSchema>;
export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
