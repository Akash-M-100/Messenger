import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";

export function registerErrorHandler(server: FastifyInstance): void {
  server.setErrorHandler(
    async (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode || 500;
      
      if (statusCode >= 500) {
        server.log.error({ error }, "Unhandled server error");
      } else {
        server.log.debug({ error }, "Client error");
      }

      await reply.code(statusCode).send({
        statusCode,
        message: error.message,
        error: error.code || "INTERNAL_SERVER_ERROR",
      });
    },
  );
}
