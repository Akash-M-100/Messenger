import type { FastifyInstance } from "fastify";

import { registerAuthRoutes } from "./auth.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(registerAuthRoutes, { prefix: "/auth" });

  // Health check
  server.get("/health", async () => {
    return { status: "ok" };
  });
}
