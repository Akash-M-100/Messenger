import RedisLib from "ioredis";

// Type alias - use any to avoid ioredis namespace export issues
export type RedisInstance = any;

export interface RedisConfig {
  host: string;
  port: number;
  password?: string | undefined;
  db?: number | undefined;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean | undefined;
}

export function createRedisConnection(config: RedisConfig): RedisInstance {
  return new (RedisLib as any)({
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db ?? 0,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null,
    enableReadyCheck: config.enableReadyCheck ?? true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });
}

export function getRedisConfigFromEnv(): RedisConfig {
  const password = process.env.REDIS_PASSWORD;
  const db = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined;
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: password,
    db: db,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
