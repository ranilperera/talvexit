import type { FastifyRequest, FastifyReply } from 'fastify';

// Admin role hierarchy
const ADMIN_ROLES = [
  'PLATFORM_ADMIN',
  'SUPPORT_ADMIN',
  'COMPLIANCE_ADMIN',
] as const;

type AdminRole = (typeof ADMIN_ROLES)[number];

// Permission matrix — matches M12.1 spec exactly
const PERMISSIONS: Record<string, AdminRole[]> = {
  view_all_orders:              ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'],
  review_kyc_sessions:          ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'],
  verify_insurance:             ['PLATFORM_ADMIN', 'SUPPORT_ADMIN', 'COMPLIANCE_ADMIN'],
  suspend_ban_contractors:      ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'],
  issue_dispute_determinations: ['PLATFORM_ADMIN', 'SUPPORT_ADMIN'],
  trigger_aml_screens:          ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'],
  view_audit_logs:              ['PLATFORM_ADMIN', 'COMPLIANCE_ADMIN'],
  manage_platform_config:       ['PLATFORM_ADMIN'],
};

export type Permission = keyof typeof PERMISSIONS;

// Base guard — any admin role
export function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) {
  if (!req.user || !(ADMIN_ROLES as readonly string[]).includes(req.user.accountType)) {
    void reply.status(403).send({
      success: false,
      error: {
        code: 'ADMIN_REQUIRED',
        message: 'This endpoint requires an admin account.',
      },
    });
    return;
  }
  done();
}

// Permission-specific guard factory
// Usage: preHandler: [authenticate, requirePermission('suspend_ban_contractors')]
export function requirePermission(permission: Permission) {
  return function permissionGuard(
    req: FastifyRequest,
    reply: FastifyReply,
    done: () => void,
  ) {
    const allowed = PERMISSIONS[permission];
    if (!req.user || !allowed.includes(req.user.accountType as AdminRole)) {
      void reply.status(403).send({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message:
            `Your role (${req.user?.accountType ?? 'unknown'}) ` +
            `does not have the '${permission}' permission.`,
          required_roles: allowed,
        },
      });
      return;
    }
    done();
  };
}

// Convenience: check permission programmatically (for service layer)
export function hasPermission(accountType: string, permission: Permission): boolean {
  return (PERMISSIONS[permission] as string[]).includes(accountType);
}
