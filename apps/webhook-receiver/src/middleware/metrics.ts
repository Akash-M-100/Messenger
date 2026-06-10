import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { FastifyInstance, FastifyRequest } from "fastify";

const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "webhook_receiver_",
});

const webhooksReceivedTotal = new Counter({
  name: "webhooks_received_total",
  help: "Total webhooks received",
  labelNames: ["provider", "channel"] as const,
  registers: [metricsRegistry],
});

const webhookProcessingDurationSeconds = new Histogram({
  name: "webhook_processing_duration_seconds",
  help: "Webhook processing duration in seconds",
  labelNames: ["provider"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const requestStartTimes = new WeakMap<FastifyRequest, bigint>();

export function registerMetricsMiddleware(server: FastifyInstance): void {
  server.addHook("onRequest", async (request) => {
    const labels = getWebhookLabels(request.url);
    if (!labels) {
      return;
    }

    requestStartTimes.set(request, process.hrtime.bigint());
    webhooksReceivedTotal.inc(labels);
  });

  server.addHook("onResponse", async (request) => {
    const startedAt = requestStartTimes.get(request);
    const labels = getWebhookLabels(request.url);

    if (!startedAt || !labels) {
      return;
    }

    webhookProcessingDurationSeconds.observe(
      { provider: labels.provider },
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000,
    );
  });

  server.get("/metrics", async (_request, reply) => {
    return reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });
}

function getWebhookLabels(
  url: string,
): { provider: string; channel: string } | undefined {
  const path = url.split("?")[0] ?? "";
  const [, root, provider, channel] = path.split("/");

  if (root !== "webhooks" || !provider || !channel) {
    return undefined;
  }

  return {
    provider,
    channel,
  };
}
