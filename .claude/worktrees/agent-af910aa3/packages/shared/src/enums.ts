// All platform enums go here

export const AccountType = {
  CUSTOMER: 'CUSTOMER',
  INDIVIDUAL_CONTRACTOR: 'INDIVIDUAL_CONTRACTOR',
  ORGANIZATION_ADMIN: 'ORGANIZATION_ADMIN',
  ORG_MEMBER: 'ORG_MEMBER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  SUPPORT_ADMIN: 'SUPPORT_ADMIN',
  COMPLIANCE_ADMIN: 'COMPLIANCE_ADMIN',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const ContractorStatus = {
  INCOMPLETE: 'INCOMPLETE',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
} as const;
export type ContractorStatus = (typeof ContractorStatus)[keyof typeof ContractorStatus];

export const OrderStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  SCOPED: 'SCOPED',
  ACCEPTED: 'ACCEPTED',
  PAYMENT_HELD: 'PAYMENT_HELD',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const Domain = {
  FIREWALL: 'FIREWALL',
  NETWORKING: 'NETWORKING',
  DATABASE: 'DATABASE',
  CLOUD_AZURE: 'CLOUD_AZURE',
  LINUX: 'LINUX',
  WINDOWS_ADMIN: 'WINDOWS_ADMIN',
  CYBERSECURITY: 'CYBERSECURITY',
  DEVOPS: 'DEVOPS',
  STORAGE: 'STORAGE',
  VIRTUALIZATION: 'VIRTUALIZATION',
  OFFICE_365: 'OFFICE_365',
  BACKUP: 'BACKUP',
  AI_INTEGRATION: 'AI_INTEGRATION',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
} as const;
export type Domain = (typeof Domain)[keyof typeof Domain];

export const IdentityStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;
export type IdentityStatus = (typeof IdentityStatus)[keyof typeof IdentityStatus];

export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  SCHEDULED: 'SCHEDULED',
  COMPLETED_PENDING_REVIEW: 'COMPLETED_PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REQUIRES_INFO: 'REQUIRES_INFO',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const EmploymentType = {
  SOLE_TRADER: 'SOLE_TRADER',
  EMPLOYED_WITH_PERMISSION: 'EMPLOYED_WITH_PERMISSION',
  EMPLOYED_NO_RESTRICTION: 'EMPLOYED_NO_RESTRICTION',
  BUSINESS_ENTITY: 'BUSINESS_ENTITY',
} as const;
export type EmploymentType = (typeof EmploymentType)[keyof typeof EmploymentType];

export const InsuranceStatus = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type InsuranceStatus = (typeof InsuranceStatus)[keyof typeof InsuranceStatus];

export const InsuranceTier = {
  STANDARD: 'STANDARD',
  ELEVATED: 'ELEVATED',
  HIGH_RISK: 'HIGH_RISK',
  ORGANIZATION: 'ORGANIZATION',
} as const;
export type InsuranceTier = (typeof InsuranceTier)[keyof typeof InsuranceTier];

export const InsuranceType = {
  PI: 'PI',
  PL: 'PL',
  CYBER: 'CYBER',
} as const;
export type InsuranceType = (typeof InsuranceType)[keyof typeof InsuranceType];

export const OrgMemberRole = {
  ORG_ADMIN: 'ORG_ADMIN',
  ORG_MEMBER: 'ORG_MEMBER',
} as const;
export type OrgMemberRole = (typeof OrgMemberRole)[keyof typeof OrgMemberRole];

export const OrgVerificationStatus = {
  INCOMPLETE: 'INCOMPLETE',
  PENDING_REVIEW: 'PENDING_REVIEW',
  VERIFIED: 'VERIFIED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;
export type OrgVerificationStatus = (typeof OrgVerificationStatus)[keyof typeof OrgVerificationStatus];

export const OrgMemberStatus = {
  INVITED: 'INVITED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  INACTIVE: 'INACTIVE',
  REMOVED: 'REMOVED',
} as const;
export type OrgMemberStatus = (typeof OrgMemberStatus)[keyof typeof OrgMemberStatus];
