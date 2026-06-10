import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export function registerAdminAuth(
  server: FastifyInstance,
  adminSecret: string,
): void {
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (path === "/healthz" || path === "/metrics") {
      return;
    }

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

    const tenantIdHeader = request.headers["x-tenant-id"];
    if (tenantIdHeader) {
      (request as any).tenantId = Array.isArray(tenantIdHeader) ? tenantIdHeader[0] : tenantIdHeader;
    }
  });
}
