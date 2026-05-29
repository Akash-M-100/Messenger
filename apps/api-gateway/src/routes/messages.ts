import type { FastifyInstance, FastifyRequest } from "fastify";

import { UnauthorizedError, ValidationError } from "../middleware/errors.js";
import {
  createMessageRequestSchema,
  idempotencyKeySchema,
  type CreateMessageRequest,
} from "../schemas/message.js";

export async function registerMessageRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.post("/messages", async (request, reply) => {
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

    return reply.code(202).send({
      data: message,
    });
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
}
