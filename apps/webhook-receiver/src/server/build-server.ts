import Fastify, { type FastifyInstance } from "fastify";

import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerMetricsMiddleware } from "../middleware/metrics.js";
import { registerRoutes } from "../routes/index.js";
import type { ServerConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    redis: RedisInstance;
    config: ServerConfig;
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

  registerErrorHandler(server);

  server.decorate("db", options.db);
  server.decorate("redis", options.redis);
  server.decorate("config", options.config);
  registerMetricsMiddleware(server);

  await registerRoutes(server);

  return server;
}
