import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";

import { registerErrorHandler } from "../middleware/error-handler.js";
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

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const publicDir = join(__dirname, "..", "public");

  await server.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
  });

  const htmlPath = join(publicDir, "index.html");

  server.get("/", async (_request, reply) => {
    try {
      const html = readFileSync(htmlPath, "utf-8");
      return reply.type("text/html").send(html);
    } catch (error) {
      server.log.error({ error }, "Failed to serve HTML");
      return reply.code(500).send({
        statusCode: 500,
        message: "Internal server error",
        error: "INTERNAL_SERVER_ERROR",
      });
    }
  });

  await registerRoutes(server);

  return server;
}
