import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import type { FastifyInstance, FastifyRequest } from "fastify";

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: "api_gateway_",
});

export const messagesAcceptedTotal = new Counter({
  name: "messages_accepted_total",
  help: "Total messages accepted by the API gateway",
  labelNames: ["channel"] as const,
  registers: [metricsRegistry],
});

const apiRequestsTotal = new Counter({
  name: "api_requests_total",
  help: "Total API requests",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [metricsRegistry],
});

const apiRequestDurationSeconds = new Histogram({
  name: "api_request_duration_seconds",
  help: "API request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const requestStartTimes = new WeakMap<FastifyRequest, bigint>();

export function registerMetricsMiddleware(server: FastifyInstance): void {
  server.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, process.hrtime.bigint());
  });

  server.addHook("onResponse", async (request, reply) => {
    const startTime = requestStartTimes.get(request);
    if (!startTime) {
      return;
    }

    const durationSeconds =
      Number(process.hrtime.bigint() - startTime) / 1_000_000_000;
    const labels = {
      method: request.method,
      route: getRouteLabel(request),
      status_code: reply.statusCode.toString(),
    };

    apiRequestsTotal.inc(labels);
    apiRequestDurationSeconds.observe(labels, durationSeconds);
  });

  server.get("/metrics", async (_request, reply) => {
    return reply
      .header("Content-Type", metricsRegistry.contentType)
      .send(await metricsRegistry.metrics());
  });
}

function getRouteLabel(request: FastifyRequest): string {
  return request.routeOptions.url ?? request.url.split("?")[0] ?? "unknown";
}
