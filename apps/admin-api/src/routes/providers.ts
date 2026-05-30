import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { ProviderService } from "../services/provider-service.js";
import {
  createProviderConfigSchema,
  updateProviderConfigSchema,
  CreateProviderConfigInput,
  UpdateProviderConfigInput,
} from "../schemas/providers.js";
import { paginationSchema } from "../schemas/pagination.js";
import { createAuditLog } from "../utils/audit-log.js";

export async function registerProviderRoutes(server: FastifyInstance) {
  const providerService = new ProviderService((server as any).db);

  // Create Provider Config
  server.post<{ Body: CreateProviderConfigInput }>(
    "/v1/providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId;
        if (!tenantId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const input = createProviderConfigSchema.parse(request.body);
        const config = await providerService.createProviderConfig(tenantId, input);

        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "CREATE",
          resourceType: "ProviderConfig",
          resourceId: config.id,
          changes: { type: input.type, name: input.name },
        });

        return reply.code(201).send(config);
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        if (error instanceof Error && error.message.includes("already exists")) {
          return reply.code(409).send({
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    }
  );

  // List Provider Configs
  server.get(
    "/v1/providers",
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
        const result = await providerService.getProviderConfigs(tenantId, pagination);
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

  // Get Provider Config
  server.get(
    "/v1/providers/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID is required",
        });
      }

      const id = (request.params as Record<string, any>).id;
      const config = await providerService.getProviderConfigById(tenantId, id);
      if (!config) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Provider config not found",
        });
      }
      return reply.send(config);
    }
  );

  // Update Provider Config
  server.put<{ Body: UpdateProviderConfigInput }>(
    "/v1/providers/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId;
        if (!tenantId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const id = (request.params as Record<string, any>).id;
        const input = updateProviderConfigSchema.parse(request.body);
        const config = await providerService.updateProviderConfig(tenantId, id, input);

        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "UPDATE",
          resourceType: "ProviderConfig",
          resourceId: id,
          changes: input,
        });

        return reply.send(config);
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

  // Delete Provider Config
  server.delete(
    "/v1/providers/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID is required",
        });
      }

      const id = (request.params as Record<string, any>).id;
      const config = await providerService.deleteProviderConfig(tenantId, id);

      await createAuditLog({
        db: (server as any).db,
        request,
        tenantId,
        actionType: "DELETE",
        resourceType: "ProviderConfig",
        resourceId: id,
      });

      return reply.send(config);
    }
  );
}
