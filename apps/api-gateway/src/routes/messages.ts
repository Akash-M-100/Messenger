import type { FastifyPluginAsync } from "fastify";
import type { FastifyRequest } from "fastify";

import { messagesAcceptedTotal } from "../middleware/metrics.js";
import { UnauthorizedError, ValidationError } from "../middleware/errors.js";
import {
  createMessageRequestSchema,
  idempotencyKeySchema,
  type CreateMessageRequest,
} from "../schemas/message.js";

export const registerMessageRoutes: FastifyPluginAsync = async (
  server,
  options,
): Promise<void> => {
  server.post("/messages", async (request, reply) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new UnauthorizedError("Missing API key");
    }

    const parsedBody = createMessageRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      throw new ValidationError("Invalid message request", parsedBody.error);
    }

    const authContext = await request.server.services.apiKeys.verifyApiKey(apiKey);
    const message = await request.server.services.messages.createMessage(
      authContext,
      withIdempotencyKey(parsedBody.data, request.headers["idempotency-key"]),
      request.correlationId,
    );
    messagesAcceptedTotal.inc({
      channel: parsedBody.data.channel.toLowerCase(),
    });

    return reply.code(202).send({
      data: message,
    });
  });

  server.get("/messages", async (request, reply) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new UnauthorizedError("Missing API key");
    }

    const authContext = await request.server.services.apiKeys.verifyApiKey(apiKey);
    const messages = await request.server.services.messages.listMessages(authContext);

    return reply.code(200).send({
      data: messages,
    });
  });

  server.get("/messages/:id", async (request, reply) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new UnauthorizedError("Missing API key");
    }

    const { id } = request.params as { id: string };
    if (!id) {
      throw new UnauthorizedError("Message ID is required");
    }

    const authContext = await request.server.services.apiKeys.verifyApiKey(apiKey);
    const message = await request.server.services.messages.getMessage(authContext, id);

    return reply.code(200).send({
      data: message,
    });
  });

  server.delete("/messages/:id", async (request, reply) => {
    const apiKey = getApiKey(request);
    if (!apiKey) {
      throw new UnauthorizedError("Missing API key");
    }

    const { id } = request.params as { id: string };
    if (!id) {
      throw new UnauthorizedError("Message ID is required");
    }

    const authContext = await request.server.services.apiKeys.verifyApiKey(apiKey);
    await request.server.services.messages.cancelMessage(authContext, id);

    return reply.code(204).send();
  });
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
};
