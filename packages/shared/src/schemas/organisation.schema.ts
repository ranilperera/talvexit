import { z } from 'zod';

// Create organisation
export const createOrganisationSchema = z
  .object({
    entity_name: z.string().min(2).max(200).trim(),
    registration_number: z.string().min(2).max(100).optional(),
    country: z.string().length(2).default('AU'),
    abn: z
      .string()
      .regex(/^\d{11}$/, 'ABN must be 11 digits')
      .optional(),
    address: z.string().min(5).max(500).optional(),
    contact_email: z.string().email(),
  })
  .refine(
    (data) => {
      if (data.country === 'AU') return !!data.abn;
      return true;
    },
    { message: 'ABN required for Australian organisations', path: ['abn'] },
  );

// Update organisation profile
export const updateOrganisationSchema = z.object({
  entity_name: z.string().min(2).max(200).trim().optional(),
  address: z.string().min(5).max(500).optional(),
  contact_email: z.string().email().optional(),
  logo_blob_path: z.string().optional(),
});

// Upload organisation document
export const uploadOrgDocumentSchema = z.object({
  doc_type: z.enum(['REGISTRATION_CERTIFICATE', 'COMPANY_CONSTITUTION', 'OTHER']),
  blob_path: z.string().min(1),
  file_name: z.string().min(1).max(255),
});

// Accept agreement
export const acceptAgreementSchema = z.object({
  agreement_version: z.string().min(1),
  accepted: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Expert Organisation Agreement' }),
  }),
});

// Invite member
export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ORG_ADMIN', 'ORG_MEMBER']),
});

// Update member
export const updateMemberSchema = z
  .object({
    role: z.enum(['ORG_ADMIN', 'ORG_MEMBER']).optional(),
    status: z.enum(['INACTIVE', 'VERIFIED']).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: 'At least one of role or status must be provided',
  });

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;
export type UploadOrgDocumentInput = z.infer<typeof uploadOrgDocumentSchema>;
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
