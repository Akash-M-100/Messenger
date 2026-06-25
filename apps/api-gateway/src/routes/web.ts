import { readFile } from "node:fs/promises";

import type { FastifyInstance } from "fastify";

const settingsPageUrl = new URL("../public/settings.html", import.meta.url);

export async function registerWebRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.get("/", async (_request, reply) => {
    return reply.redirect("/settings");
  });

  server.get("/settings", async (_request, reply) => {
    const page = await readFile(settingsPageUrl, "utf8");
    return reply.type("text/html; charset=utf-8").send(page);
  });
}
