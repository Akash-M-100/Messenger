import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { ApiKeyService } from "../services/api-key-service.js";
import { createApiKeySchema, CreateApiKeyInput } from "../schemas/api-keys.js";
import { paginationSchema } from "../schemas/pagination.js";
import { createAuditLog } from "../utils/audit-log.js";

export async function registerApiKeyRoutes(server: FastifyInstance) {
  const apiKeyService = new ApiKeyService((server as any).db);

  // Generate API Key
  server.post<{ Body: CreateApiKeyInput }>(
    "/v1/tenants/:id/keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as Record<string, any>;
        const id = params.id;
        if (!id) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const input = createApiKeySchema.parse(request.body);
        const generatedKey = await apiKeyService.generateApiKey(id, input);

        const tenantId = (request as any).tenantId || id;
        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "CREATE",
          resourceType: "ApiKey",
          resourceId: generatedKey.id,
          changes: { name: input.name, scopes: input.scopes },
        });

        // Only return the plaintext key once - never again
        return reply.code(201).send(generatedKey);
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

  // List API Keys
  server.get(
    "/v1/tenants/:id/keys",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as Record<string, any>;
        const id = params.id;
        if (!id) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const query = request.query as Record<string, any>;
        const pagination = paginationSchema.parse(query);
        const result = await apiKeyService.getApiKeys(id, pagination);
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

  // Revoke API Key
  server.delete(
    "/v1/tenants/:id/keys/:keyId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, any>;
      const id = params.id;
      const keyId = params.keyId;
      
      if (!id || !keyId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID and Key ID are required",
        });
      }

      const revokedKey = await apiKeyService.revokeApiKey(id, keyId);

      const tenantId = (request as any).tenantId || id;
      await createAuditLog({
        db: (server as any).db,
        request,
        tenantId,
        actionType: "DELETE",
        resourceType: "ApiKey",
        resourceId: keyId,
        changes: { revokedAt: new Date() },
      });

      return reply.send(revokedKey);
    }
  );
}
