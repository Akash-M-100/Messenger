import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerAdminAuth(
  server: FastifyInstance,
  adminSecret: string,
): void {
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization || "";
    const expectedAuth = `Bearer ${adminSecret}`;

    if (authHeader !== expectedAuth) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Missing or invalid authorization header",
        },
      });
    }

    // Token is valid, continue
  });
}
