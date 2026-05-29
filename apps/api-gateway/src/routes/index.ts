import type { FastifyInstance } from "fastify";

import { registerHealthRoutes } from "./health.js";
import { registerMessageRoutes } from "./messages.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(registerHealthRoutes);
  await server.register(registerMessageRoutes, {
    prefix: "/v1",
  });
}
