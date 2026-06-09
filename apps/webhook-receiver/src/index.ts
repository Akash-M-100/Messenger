import process from "node:process";
import { pathToFileURL } from "node:url";

import { prisma } from "@ums/db";
import {
  createRedisConnection,
  getRedisConfigFromEnv,
} from "@ums/queue";

import { buildServer } from "./server/build-server.js";
import { loadServerConfig } from "./server/config.js";

export { buildServer } from "./server/build-server.js";
export { loadServerConfig } from "./server/config.js";

export const webhookReceiverPackageName = "@ums/webhook-receiver";

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
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : undefined;

if (import.meta.url === entrypoint) {
  main().catch((error) => {
    console.error("Failed to start webhook receiver:", error);
    process.exit(1);
  });
}
