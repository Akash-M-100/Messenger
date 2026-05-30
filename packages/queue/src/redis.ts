import type Redis from "ioredis";
import IORedis from "ioredis";

export interface RedisConfig {
  host: string;
  port: number;
  password?: string | null;
  db?: number;
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
}

export function createRedisConnection(config: RedisConfig): Redis {
  return new IORedis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db ?? 0,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null,
    enableReadyCheck: config.enableReadyCheck ?? true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  }) as Redis;
}

export function getRedisConfigFromEnv(): RedisConfig {
  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
    password: process.env.REDIS_PASSWORD || null,
    db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
}
