import Fastify, { type FastifyInstance } from "fastify";

import type { DbClient } from "@ums/db";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerServicesPlugin } from "../plugins/services.js";
import { registerRoutes } from "../routes/index.js";
import type { ServerConfig } from "./config.js";

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

  await server.register(registerServicesPlugin, {
    db: options.db,
  });

  await registerRoutes(server);

  return server;
}
