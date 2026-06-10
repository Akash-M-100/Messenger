import Fastify, { type FastifyInstance } from "fastify";
import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";
import { createDeadLetterQueue, type DeadLetterQueue } from "@ums/queue";
import { metricsRegistry } from "../routes/metrics.js";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerAdminAuth } from "../middleware/admin-auth.js";
import { registerRoutes } from "../routes/index.js";
import type { AdminConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    redis: RedisInstance;
    config: AdminConfig;
    dlq: DeadLetterQueue;
  }
}

export interface BuildAdminServerOptions {
  config: AdminConfig;
  db: DbClient;
  redis: RedisInstance;
}

export async function buildAdminServer(
  options: BuildAdminServerOptions,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: options.config.logger,
  });

  registerErrorHandler(server);
  registerAdminAuth(server, options.config.adminSecret);

  const dlq = await createDeadLetterQueue(options.redis, metricsRegistry);

  server.decorate("db", options.db);
  server.decorate("redis", options.redis);
  server.decorate("config", options.config);
  server.decorate("dlq", dlq);

  await registerRoutes(server);

  return server;
}
