import Fastify, { type FastifyInstance } from "fastify";

import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerServicesPlugin } from "../plugins/services.js";
import { registerRoutes } from "../routes/index.js";
import type { ServerConfig } from "./config.js";

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

  // Execute services plugin directly without creating a scope
  await registerServicesPlugin(server, {
    db: options.db,
    redis: options.redis,
  });

  await registerRoutes(server);

  return server;
}
