import type { FastifyInstance } from "fastify";

type HealthStatus = "ok" | "degraded" | "down";

interface DependencyCheck {
  status: HealthStatus;
  latencyMs: number;
  error?: string;
}

export async function registerHealthRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.get("/healthz", async (_request, reply) => {
    const [database, redis] = await Promise.all([
      measureDependency(async () => {
        await server.db.$queryRaw`SELECT 1`;
      }),
      measureDependency(async () => {
        await server.redis.ping();
      }),
    ]);
    const status = getOverallStatus([database, redis]);

    return reply.code(status === "down" ? 503 : 200).send({
      status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis,
      },
    });
  });
}

async function measureDependency(
  check: () => Promise<void>,
): Promise<DependencyCheck> {
  const startedAt = process.hrtime.bigint();

  try {
    await check();
    return {
      status: "ok",
      latencyMs: elapsedMs(startedAt),
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: elapsedMs(startedAt),
      error: error instanceof Error ? error.message : "Unknown health check error",
    };
  }
}

function getOverallStatus(checks: DependencyCheck[]): HealthStatus {
  const downCount = checks.filter((check) => check.status === "down").length;

  if (downCount === 0) {
    return "ok";
  }

  return downCount === checks.length ? "down" : "degraded";
}

function elapsedMs(startedAt: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
}
