import process from "node:process";

import { prisma } from "@ums/db";
import {
  createRedisConnection,
  getRedisConfigFromEnv,
} from "@ums/queue";

import { buildServer } from "./server/build-server.js";
import { loadServerConfig } from "./server/config.js";

export { buildServer } from "./server/build-server.js";
export { loadServerConfig } from "./server/config.js";

export const authServicePackageName = "@ums/auth-service";

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const redis = createRedisConnection(getRedisConfigFromEnv());

  const server = await buildServer({
    config,
    db: prisma,
    redis,
  });

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    server.log.info({ signal }, "Shutting down");
    try {
      await server.close();
      await prisma.$disconnect();
      await redis.quit();
    } catch (error) {
      server.log.error({ error }, "Error during shutdown");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => {
    void close("SIGINT");
  });
  process.once("SIGTERM", () => {
    void close("SIGTERM");
  });

  await server.listen({
    host: config.host,
    port: config.port,
  });

  server.log.info(`Auth Service running on ${config.host}:${config.port}`);
}

main().catch((error) => {
  console.error("Failed to start auth service:", error);
  process.exit(1);
});
