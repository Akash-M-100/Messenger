import Fastify, { type FastifyInstance } from "fastify";

import type { DbClient } from "@ums/db";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerRoutes } from "../routes/index.js";
import type { ServerConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    config: ServerConfig;
  }
}

export interface BuildServerOptions {
  config: ServerConfig;
  db: DbClient;
}

export async function buildServer(
  options: BuildServerOptions,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: options.config.logger,
  });

  registerErrorHandler(server);

  server.decorate("db", options.db);
  server.decorate("config", options.config);

  await registerRoutes(server);

  return server;
}
