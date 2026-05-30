import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { TemplateService } from "../services/template-service.js";
import {
  createTemplateSchema,
  updateTemplateSchema,
  submitTemplateSchema,
  CreateTemplateInput,
  UpdateTemplateInput,
  SubmitTemplateInput,
} from "../schemas/templates.js";
import { paginationSchema } from "../schemas/pagination.js";
import { createAuditLog } from "../utils/audit-log.js";

export async function registerTemplateRoutes(server: FastifyInstance) {
  const templateService = new TemplateService((server as any).db);

  // Create Template
  server.post<{ Body: CreateTemplateInput }>(
    "/v1/templates",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const input = createTemplateSchema.parse(request.body);
        
        // Get tenantId from request context (would be set by auth middleware in real scenario)
        const tenantId = (request as any).tenantId;
        if (!tenantId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const template = await templateService.createTemplate(tenantId, input);

        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "CREATE",
          resourceType: "Template",
          resourceId: template.id,
          changes: input,
        });

        return reply.code(201).send(template);
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

  // List Templates
  server.get(
    "/v1/templates",
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
        const result = await templateService.getTemplates(tenantId, pagination);
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

  // Get Template
  server.get(
    "/v1/templates/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID is required",
        });
      }

      const id = (request.params as Record<string, any>).id;
      const template = await templateService.getTemplateById(tenantId, id);
      if (!template) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Template not found",
        });
      }
      return reply.send(template);
    }
  );

  // Update Template
  server.put<{ Body: UpdateTemplateInput }>(
    "/v1/templates/:id",
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
        const input = updateTemplateSchema.parse(request.body);
        const template = await templateService.updateTemplate(tenantId, id, input);

        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "UPDATE",
          resourceType: "Template",
          resourceId: id,
          changes: input,
        });

        return reply.send(template);
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

  // Delete Template
  server.delete(
    "/v1/templates/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID is required",
        });
      }

      const id = (request.params as Record<string, any>).id;
      const template = await templateService.deleteTemplate(tenantId, id);

      await createAuditLog({
        db: (server as any).db,
        request,
        tenantId,
        actionType: "DELETE",
        resourceType: "Template",
        resourceId: id,
      });

      return reply.send(template);
    }
  );

  // Submit Template for Approval
  server.post<{ Body: SubmitTemplateInput }>(
    "/v1/templates/:id/submit",
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
        const input = submitTemplateSchema.parse(request.body);
        const template = await templateService.submitTemplate(tenantId, id, input);

        await createAuditLog({
          db: (server as any).db,
          request,
          tenantId,
          actionType: "CREATE",
          resourceType: "TemplateSubmission",
          resourceId: id,
          changes: { status: "SUBMITTED", ...input },
        });

        return reply.send(template);
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
