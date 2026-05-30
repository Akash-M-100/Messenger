import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      const formatted = error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
        code: e.code,
      }));

      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: formatted,
        },
      });
    }

    const err = error as any;
    const statusCode =
      err.statusCode || err.code === "FST_ERR_BAD_STATUS_CODE" ? 400 : 500;
    const code = err.code || "INTERNAL_ERROR";
    const message = err.message || "Internal server error";

    server.log.error({ error }, "Request failed");

    return reply.status(statusCode).send({
      error: {
        code,
        message,
      },
    });
  });
}
