import type { PrismaClient, Prisma } from '@prisma/client';

interface AuditParams {
  actorId?: string;
  actionType: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
}

export async function writeAudit(
  prisma: PrismaClient,
  params: AuditParams,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        ...(params.actorId !== undefined && { actor_id: params.actorId }),
        action_type: params.actionType,
        entity_type: params.entityType,
        entity_id: params.entityId,
        ...(params.ipAddress !== undefined && { ip_address: params.ipAddress }),
        ...(params.userAgent !== undefined && { user_agent: params.userAgent }),
        metadata: params.metadata as Prisma.JsonObject,
      },
    });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err);
  }
}
