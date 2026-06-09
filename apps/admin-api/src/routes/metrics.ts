import type { FastifyInstance } from "fastify";
import { Registry, collectDefaultMetrics } from "prom-client";

const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "admin_api_",
});

export async function registerMetricsRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.get("/metrics", async (_request, reply) => {
    return reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });
}
