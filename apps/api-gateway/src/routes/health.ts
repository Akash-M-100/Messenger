import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.get("/healthz", async () => ({
    ok: true,
  }));
}
