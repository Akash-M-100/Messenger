import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

const CORRELATION_ID_HEADER = "x-correlation-id";

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
  }
}

export function registerCorrelationIdMiddleware(server: FastifyInstance): void {
  server.decorateRequest("correlationId", "");

  server.addHook("onRequest", async (request, reply) => {
    const correlationId = getCorrelationId(request.headers[CORRELATION_ID_HEADER]);
    request.correlationId = correlationId;
    reply.header("X-Correlation-ID", correlationId);
  });
}

function getCorrelationId(value: string | string[] | undefined): string {
  const headerValue = Array.isArray(value) ? value[0] : value;
  const normalized = headerValue?.trim();

  return normalized || randomUUID();
}
