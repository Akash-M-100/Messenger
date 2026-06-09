import { createServer, type Server } from "node:http";

import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "worker_sms_",
});

export const jobsCompletedTotal = new Counter({
  name: "jobs_completed_total",
  help: "Total completed jobs",
  labelNames: ["channel", "provider"] as const,
  registers: [metricsRegistry],
});

export const jobsFailedTotal = new Counter({
  name: "jobs_failed_total",
  help: "Total failed jobs",
  labelNames: ["channel", "provider", "error_type"] as const,
  registers: [metricsRegistry],
});

export const jobDurationSeconds = new Histogram({
  name: "job_duration_seconds",
  help: "Job processing duration in seconds",
  labelNames: ["channel", "provider"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const providerApiLatencySeconds = new Histogram({
  name: "provider_api_latency_seconds",
  help: "Provider API latency in seconds",
  labelNames: ["provider"] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export function startMetricsServer(port: number): Server {
  const server = createServer(async (request, response) => {
    if (request.url?.split("?")[0] !== "/metrics") {
      response.writeHead(404).end("Not Found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": metricsRegistry.contentType,
    });
    response.end(await metricsRegistry.metrics());
  });

  server.listen(port);
  return server;
}
