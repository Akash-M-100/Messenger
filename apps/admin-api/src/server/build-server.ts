import Fastify, { type FastifyInstance } from "fastify";
import type { DbClient } from "@ums/db";

import { registerErrorHandler } from "../middleware/error-handler.js";
import { registerAdminAuth } from "../middleware/admin-auth.js";
import { registerRoutes } from "../routes/index.js";
import type { AdminConfig } from "./config.js";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    config: AdminConfig;
  }
}

export interface BuildAdminServerOptions {
  config: AdminConfig;
  db: DbClient;
}

export async function buildAdminServer(
  options: BuildAdminServerOptions,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: options.config.logger,
  });

  registerErrorHandler(server);
  registerAdminAuth(server, options.config.adminSecret);

  server.decorate("db", options.db);
  server.decorate("config", options.config);

  await registerRoutes(server);

  return server;
}
