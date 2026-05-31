import type { FastifyInstance, FastifyRequest } from "fastify";

import { MessageChannel } from "@ums/db";
import { UnauthorizedError, ValidationError, AppError, NotFoundError } from "../middleware/errors.js";
import {
  createMessageRequestSchema,
  idempotencyKeySchema,
  type CreateMessageRequest,
  listMessagesQuerySchema,
  getMessageEventsQuerySchema,
  type ListMessagesQuery,
  type GetMessageEventsQuery,
  type ListMessagesResponse,
  type GetMessageEventsResponse,
} from "../schemas/message.js";
import { getFallbackChannel } from "../services/message-service.js";

export async function registerMessageRoutes(
  server: FastifyInstance,
): Promise<void> {
  // POST /messages - Create a new message with fallback chain logic
  server.post<{ Body: CreateMessageRequest }>(
    "/messages",
    async (request, reply) => {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        throw new UnauthorizedError("Missing API key");
      }

      const parsedBody = createMessageRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        throw new ValidationError("Invalid message request", parsedBody.error);
      }

      const authContext = await server.services.apiKeys.verifyApiKey(apiKey);
      const message = await server.services.messages.createMessage(
        authContext,
        withIdempotencyKey(parsedBody.data, request.headers["idempotency-key"]),
      );

      // Prepare fallback info for response
      const fallbackChannel = getFallbackChannel(message.channel);
      const responseData: any = {
        id: message.id,
        status: message.status,
        channel: message.channel,
        to: message.to,
        createdAt: message.createdAt,
      };

      if (fallbackChannel && message.fallback) {
        responseData.fallback = {
          available: fallbackChannel,
          message: `Fallback to ${fallbackChannel} available if primary channel fails`,
        };
      }

      return reply.code(202).send({
        data: responseData,
      });
    },
  );

  // GET /messages - List messages with pagination and filtering
  server.get<{ Querystring: GetMessageEventsQuery }>(
    "/messages",
    async (request, reply) => {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        throw new UnauthorizedError("Missing API key");
      }

      const parsedQuery = listMessagesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new ValidationError("Invalid query parameters", parsedQuery.error);
      }

      const query: ListMessagesQuery = parsedQuery.data as any;
      const authContext = await server.services.apiKeys.verifyApiKey(apiKey);
      const { messages, total } =
        await server.services.messages.listMessages(authContext, query);

      const response: ListMessagesResponse = {
        data: messages,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      };

      return reply.code(200).send(response);
    },
  );

  // GET /messages/:id - Get a single message with all details
  server.get<{ Params: { id: string } }>(
    "/messages/:id",
    async (request, reply) => {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        throw new UnauthorizedError("Missing API key");
      }

      const { id } = request.params;
      if (!id) {
        throw new AppError(400, "MISSING_PARAM", "Message ID is required");
      }

      const authContext = await server.services.apiKeys.verifyApiKey(apiKey);
      try {
        const message = await server.services.messages.getMessage(
          authContext,
          id,
        );

        return reply.code(200).send({
          data: message,
        });
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        throw error;
      }
    },
  );

  // GET /messages/:id/events - Get message event timeline
  server.get<{ Params: { id: string }; Querystring: GetMessageEventsQuery }>(
    "/messages/:id/events",
    async (request, reply) => {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        throw new UnauthorizedError("Missing API key");
      }

      const { id } = request.params;
      if (!id) {
        throw new AppError(400, "MISSING_PARAM", "Message ID is required");
      }

      const parsedQuery = getMessageEventsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        throw new ValidationError("Invalid query parameters", parsedQuery.error);
      }

      const query: GetMessageEventsQuery = parsedQuery.data as any;
      const authContext = await server.services.apiKeys.verifyApiKey(apiKey);

      try {
        const { events, total } =
          await server.services.messages.getMessageEvents(
            authContext,
            id,
            query.limit,
            query.offset,
          );

        const response: GetMessageEventsResponse = {
          data: events,
          pagination: {
            limit: query.limit,
            offset: query.offset,
            total,
          },
        };

        return reply.code(200).send(response);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        throw error;
      }
    },
  );

  // DELETE /messages/:id - Cancel a scheduled message
  server.delete<{ Params: { id: string } }>(
    "/messages/:id",
    async (request, reply) => {
      const apiKey = getApiKey(request);
      if (!apiKey) {
        throw new UnauthorizedError("Missing API key");
      }

      const { id } = request.params;
      if (!id) {
        throw new AppError(400, "MISSING_PARAM", "Message ID is required");
      }

      const authContext = await server.services.apiKeys.verifyApiKey(apiKey);
      try {
        await server.services.messages.cancelMessage(authContext, id);

        return reply.code(204).send();
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        throw error;
      }
    },
  );
}

function getApiKey(request: FastifyRequest): string | undefined {
  const headerApiKey = firstHeaderValue(request.headers["x-api-key"]);
  if (headerApiKey) {
    return headerApiKey;
  }

  const authorization = firstHeaderValue(request.headers.authorization);
  const bearerPrefix = "Bearer ";
  if (authorization?.startsWith(bearerPrefix)) {
    return authorization.slice(bearerPrefix.length).trim();
  }

  return undefined;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function withIdempotencyKey(
  body: CreateMessageRequest,
  headerValue: string | string[] | undefined,
): CreateMessageRequest {
  if (body.idempotencyKey) {
    return body;
  }

  const idempotencyKey = firstHeaderValue(headerValue);
  if (!idempotencyKey) {
    return body;
  }

  const result = idempotencyKeySchema.safeParse(idempotencyKey);

  if (!result.success) {
    throw new ValidationError("Invalid idempotency key", result.error);
  }

  return {
    ...body,
    idempotencyKey: result.data,
  };
}
