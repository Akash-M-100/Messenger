import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { AuditLogService, AuditLogFilters } from "../services/audit-log-service.js";
import { paginationSchema } from "../schemas/pagination.js";

export async function registerAuditLogRoutes(server: FastifyInstance) {
  const auditLogService = new AuditLogService((server as any).db);

  // List Audit Logs
  server.get(
    "/v1/audit-logs",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId;
        if (!tenantId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const query = request.query as Record<string, any>;
        const pagination = paginationSchema.parse(query);

        const filters: AuditLogFilters = {};
        if (query.actionType) {
          filters.actionType = query.actionType as string;
        }
        if (query.resourceType) {
          filters.resourceType = query.resourceType as string;
        }
        if (query.startDate) {
          filters.startDate = new Date(query.startDate as string);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate as string);
        }

        const result = await auditLogService.getAuditLogs(tenantId, filters, pagination);
        return reply.send(result);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );
}
