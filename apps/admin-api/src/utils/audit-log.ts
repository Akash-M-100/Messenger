import type { FastifyRequest } from "fastify";
import type { DbClient, AuditActionType } from "@ums/db";

export interface CreateAuditLogParams {
  db: DbClient;
  request: FastifyRequest;
  actionType: AuditActionType;
  resourceType: string;
  resourceId: string;
  tenantId: string;
  changes?: Record<string, any>;
}

export async function createAuditLog(
  params: CreateAuditLogParams,
): Promise<void> {
  try {
    const ipAddress = (
      params.request.headers["x-forwarded-for"] ||
      params.request.headers["cf-connecting-ip"] ||
      params.request.socket.remoteAddress ||
      ""
    ) as string;

    const ipOnly = Array.isArray(ipAddress)
      ? ipAddress[0]?.split(",")[0]?.trim()
      : ipAddress.split(",")[0]?.trim();

    const createData: Parameters<typeof params.db.auditLog.create>[0]["data"] = {
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      tenantId: params.tenantId,
      adminId: "admin",
      ipAddress: ipOnly || null,
      userAgent:
        (params.request.headers["user-agent"] as string | undefined) ||
        null,
    };

    if (params.changes !== undefined) {
      createData.changes = params.changes;
    }

    await params.db.auditLog.create({ data: createData });
  } catch (error) {
    // Log audit failures but don't throw - audit logging is best-effort
    console.error("Failed to create audit log:", error);
  }
}
