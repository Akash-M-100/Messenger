import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { MessageService, MessageFilters } from "../services/message-service.js";
import { paginationSchema } from "../schemas/pagination.js";

export async function registerMessageRoutes(server: FastifyInstance) {
  const messageService = new MessageService((server as any).db);

  // List Messages
  server.get(
    "/v1/messages",
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

        const filters: MessageFilters = {};
        if (query.status) {
          filters.status = query.status as string;
        }
        if (query.channel) {
          filters.channel = query.channel as string;
        }
        if (query.startDate) {
          filters.startDate = new Date(query.startDate as string);
        }
        if (query.endDate) {
          filters.endDate = new Date(query.endDate as string);
        }

        const result = await messageService.getMessages(tenantId, filters, pagination);
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

  // Get Single Message
  server.get(
    "/v1/messages/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = (request as any).tenantId;
      if (!tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Tenant ID is required",
        });
      }

      const params = request.params as Record<string, any>;
      const id = params.id;
      if (!id) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Message ID is required",
        });
      }

      const message = await messageService.getMessageById(tenantId, id);
      if (!message) {
        return reply.code(404).send({
          error: "Not Found",
          message: "Message not found",
        });
      }
      return reply.send(message);
    }
  );

  // Get Message Events (Timeline)
  server.get(
    "/v1/messages/:id/events",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tenantId = (request as any).tenantId;
        if (!tenantId) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Tenant ID is required",
          });
        }

        const params = request.params as Record<string, any>;
        const id = params.id;
        if (!id) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "Message ID is required",
          });
        }

        const query = request.query as Record<string, any>;
        const pagination = paginationSchema.parse(query);
        const result = await messageService.getMessageEvents(tenantId, id, pagination);
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
