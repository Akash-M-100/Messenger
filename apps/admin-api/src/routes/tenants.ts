import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { TenantService } from "../services/tenant-service.js";
import {
  createTenantSchema,
  updateTenantSchema,
  CreateTenantInput,
  UpdateTenantInput,
} from "../schemas/tenants.js";
import { paginationSchema } from "../schemas/pagination.js";
import { createAuditLog } from "../utils/audit-log.js";

export async function registerTenantRoutes(server: FastifyInstance) {
  const tenantService = new TenantService((server as any).db);

  // Create Tenant
  server.post<{ Body: CreateTenantInput }>(
    "/v1/tenants",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = createTenantSchema.parse(request.body);
        const tenant = await tenantService.createTenant(input);

        const tenantId = (request as any).tenantId || tenant.id;
        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "CREATE",
          resourceType: "Tenant",
          resourceId: tenant.id,
          changes: input,
        });

        return reply.code(201).send(tenant);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        if (error instanceof Error && error.message.includes("slug already exists")) {
          return reply.code(409).send({
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // List Tenants
  server.get(
    "/v1/tenants",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as Record<string, any>;
        const pagination = paginationSchema.parse(query);
        const result = await tenantService.getTenants(pagination);
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

  // Get Tenant
  server.get(
    "/v1/tenants/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const id = (request.params as Record<string, any>).id;
      const tenant = await tenantService.getTenantById(id);
      if (!tenant) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Tenant not found",
        });
      }
      return reply.send(tenant);
    }
  );

  // Update Tenant
  server.put<{ Body: UpdateTenantInput }>(
    "/v1/tenants/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const id = (request.params as Record<string, any>).id;
        const input = updateTenantSchema.parse(request.body);
        const tenant = await tenantService.updateTenant(id, input);

        const tenantId = (request as any).tenantId || id;
        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "UPDATE",
          resourceType: "Tenant",
          resourceId: id,
          changes: input,
        });

        return reply.send(tenant);
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

  // Delete Tenant
  server.delete(
    "/v1/tenants/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const id = (request.params as Record<string, any>).id;
      const tenant = await tenantService.deleteTenant(id);

      const tenantId = (request as any).tenantId || id;
      await createAuditLog({
        db: (server as any).db,
        request,
        tenantId,
        actionType: "DELETE",
        resourceType: "Tenant",
        resourceId: id,
      });

      return reply.send(tenant);
    }
  );
}
