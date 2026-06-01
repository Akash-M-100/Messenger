export interface CacheOptions {
  ttl?: number; // Time to live in seconds, default 300 (5 minutes)
  staleTtl?: number; // Stale cache TTL in seconds, default 3600 (1 hour)
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  isStale: boolean;
}

// Redis instance type - accept any type to avoid circular dependency with @ums/queue
export type RedisInstance = any;

export class CacheManager {
  constructor(
    private redis: RedisInstance,
    private defaultTtl: number = 300,
    private defaultStaleTtl: number = 3600,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (_error) {
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const ttl = options?.ttl ?? this.defaultTtl;
      const data = JSON.stringify(value);
      await this.redis.setex(key, ttl, data);

      // Also store stale copy for fallback
      const staleTtl = options?.staleTtl ?? this.defaultStaleTtl;
      const staleKey = `${key}:stale`;
      await this.redis.setex(staleKey, staleTtl, data);
    } catch (_error) {
      // Silently fail on cache write
    }
  }

  async getStale<T>(key: string): Promise<T | null> {
    try {
      const staleKey = `${key}:stale`;
      const data = await this.redis.get(staleKey);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (_error) {
      return null;
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.redis.del(key, `${key}:stale`);
    } catch (_error) {
      // Silently fail on cache invalidate
    }
  }

  async getOrExecute<T>(
    key: string,
    executor: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached) return cached;

    // Execute and cache
    const result = await executor();
    await this.set(key, result, options);
    return result;
  }

  async getOrExecuteWithFallback<T>(
    key: string,
    executor: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T | null> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached) return cached;

    try {
      // Execute and cache
      const result = await executor();
      await this.set(key, result, options);
      return result;
    } catch (_error) {
      // On failure, try to get stale cache
      const stale = await this.getStale<T>(key);
      if (stale) {
        return stale;
      }
      throw _error;
    }
  }
}
