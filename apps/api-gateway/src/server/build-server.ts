import Fastify, { type FastifyInstance } from "fastify";
import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";
import cors from "@fastify/cors";

import { registerCorrelationIdMiddleware } from "../middleware/correlation-id.js";
import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerMetricsMiddleware } from "../middleware/metrics.js";
import { registerRateLimitMiddleware } from "../middleware/rate-limit.js";
import { registerServicesPlugin } from "../plugins/services.js";
import { registerRoutes } from "../routes/index.js";
import type { ServerConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    redis: RedisInstance;
  }
}

export interface BuildServerOptions {
  config: ServerConfig;
  db: DbClient;
  redis: RedisInstance;
}

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
 const server = Fastify({
  logger: options.config.logger,
});

await server.register(cors, {
  origin: [
    "http://localhost:3003",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-API-Key",
  ],
});

registerErrorHandler(server);
registerCorrelationIdMiddleware(server);

  // Execute services plugin directly without creating a scope
  await registerServicesPlugin(server, {
    db: options.db,
    redis: options.redis,
  });

  server.decorate("db", options.db);
  server.decorate("redis", options.redis);

  registerRateLimitMiddleware(server, {
    redis: options.redis,
  });
  registerMetricsMiddleware(server);

  await registerRoutes(server);

  return server;
}
