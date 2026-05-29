import process from "node:process";
import { pathToFileURL } from "node:url";

import { prisma } from "@ums/db";

import { buildServer } from "./server/build-server.js";
import { loadServerConfig } from "./server/config.js";

export { buildServer } from "./server/build-server.js";
export { loadServerConfig } from "./server/config.js";

export const apiGatewayPackageName = "@ums/api-gateway";

async function main(): Promise<void> {
  const config = loadServerConfig(process.env);
  const server = await buildServer({
    config,
    db: prisma,
  });

  const close = async (signal: NodeJS.Signals): Promise<void> => {
    server.log.info({ signal }, "Shutting down");
    try {
      await server.close();
      await prisma.$disconnect();
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
    console.error(error);
    void prisma.$disconnect();
    process.exit(1);
  });
}
