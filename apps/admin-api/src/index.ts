import { prisma } from "@ums/db";
import {
  createRedisConnection,
  getRedisConfigFromEnv,
} from "@ums/queue";
import { loadAdminConfig } from "./server/config.js";
import { buildAdminServer } from "./server/build-server.js";

async function main(): Promise<void> {
  try {
    const config = loadAdminConfig(process.env);
    const redis = createRedisConnection(getRedisConfigFromEnv());

    const server = await buildAdminServer({
      config,
      db: prisma,
      redis,
    });

    const address = await server.listen({ port: config.port, host: config.host });
    server.log.info(`Admin API server running on ${address}`);

    // Graceful shutdown
    const signals = ["SIGINT", "SIGTERM"];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        server.log.info(`Received ${signal}, shutting down gracefully...`);
        await server.close();
        await redis.quit();
        await prisma.$disconnect();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("Failed to start admin API server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
