import { DbClient, AuditLog } from "@ums/db";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

export interface AuditLogFilters {
  actionType?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
}

export class AuditLogService {
  constructor(private db: DbClient) {}

  async getAuditLogs(
    tenantId: string,
    filters: AuditLogFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<AuditLog>> {
    const where: Record<string, any> = { tenantId };

    if (filters.actionType) {
      where.actionType = filters.actionType;
    }
    if (filters.resourceType) {
      where.resourceType = filters.resourceType;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.auditLog.count({ where }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: logs,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }
}
