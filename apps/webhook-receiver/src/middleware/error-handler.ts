import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";

export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode || 500;
      const code = (error as any).code || "INTERNAL_SERVER_ERROR";

    server.log.error({ error, code }, "Request error");

    void reply.status(statusCode).send({
      error: {
        code,
        message: error.message,
      },
    });
  });
}
