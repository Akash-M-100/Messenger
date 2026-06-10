import { createHash } from "node:crypto";

import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

const API_KEY_LIMIT = 100;
const API_KEY_WINDOW_SECONDS = 60;
const TENANT_MESSAGE_LIMIT = 1000;
const TENANT_MESSAGE_WINDOW_SECONDS = 60 * 60;

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end

local ttl = redis.call("TTL", KEYS[1])
if ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end

return { current, ttl }
`;

interface RedisRateLimitClient {
  eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | Buffer | number>
  ): Promise<unknown>;
}

export interface RateLimitMiddlewareOptions {
  redis: RedisRateLimitClient;
}

interface RateLimitResult {
  limit: number;
  remaining: number;
  resetAt: number;
  exceeded: boolean;
}

export function registerRateLimitMiddleware(
  server: FastifyInstance,
  options: RateLimitMiddlewareOptions,
): void {
  server.addHook("preHandler", async (request, reply) => {
    if (isHealthCheck(request)) {
      return;
    }

    const apiKey = getApiKey(request);
    if (!apiKey) {
      return;
    }

    const apiKeyResult = await consumeRateLimit({
      redis: options.redis,
      key: `rate-limit:api-key:${hashValue(apiKey)}`,
      limit: API_KEY_LIMIT,
      windowSeconds: API_KEY_WINDOW_SECONDS,
    });
    setRateLimitHeaders(reply, apiKeyResult);

    if (apiKeyResult.exceeded) {
      return sendTooManyRequests(reply, apiKeyResult);
    }

    if (!isCreateMessageRequest(request)) {
      return;
    }

    const authContext = await request.server.services.apiKeys.verifyApiKey(apiKey);
    const tenantResult = await consumeRateLimit({
      redis: options.redis,
      key: `rate-limit:tenant:${authContext.tenantId}:messages`,
      limit: TENANT_MESSAGE_LIMIT,
      windowSeconds: TENANT_MESSAGE_WINDOW_SECONDS,
    });
    setRateLimitHeaders(reply, tenantResult);

    if (tenantResult.exceeded) {
      return sendTooManyRequests(reply, tenantResult);
    }
  });
}

async function consumeRateLimit(options: {
  redis: RedisRateLimitClient;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  let response: unknown;

  try {
    response = await options.redis.eval(
      RATE_LIMIT_SCRIPT,
      1,
      options.key,
      options.windowSeconds.toString(),
    );
  } catch (error) {
    throw new Error("Rate limit check failed", { cause: error });
  }

  const [current, ttl] = parseRedisRateLimitResponse(response);
  const remaining = Math.max(options.limit - current, 0);
  const ttlSeconds = Math.max(ttl, 0);

  return {
    limit: options.limit,
    remaining,
    resetAt: Math.ceil(Date.now() / 1000) + ttlSeconds,
    exceeded: current > options.limit,
  };
}

function parseRedisRateLimitResponse(response: unknown): [number, number] {
  if (!Array.isArray(response) || response.length !== 2) {
    throw new Error("Unexpected Redis rate limit response");
  }

  const current = Number(response[0]);
  const ttl = Number(response[1]);

  if (!Number.isFinite(current) || !Number.isFinite(ttl)) {
    throw new Error("Invalid Redis rate limit response");
  }

  return [current, ttl];
}

function setRateLimitHeaders(
  reply: FastifyReply,
  result: RateLimitResult,
): void {
  reply.header("X-RateLimit-Limit", result.limit.toString());
  reply.header("X-RateLimit-Remaining", result.remaining.toString());
  reply.header("X-RateLimit-Reset", result.resetAt.toString());
}

function sendTooManyRequests(
  reply: FastifyReply,
  result: RateLimitResult,
): FastifyReply {
  return reply.code(429).send({
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too Many Requests",
      details: {
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
      },
    },
  });
}

function isHealthCheck(request: FastifyRequest): boolean {
  return request.method === "GET" && request.url.split("?")[0] === "/healthz";
}

function isCreateMessageRequest(request: FastifyRequest): boolean {
  return request.method === "POST" && request.url.split("?")[0] === "/v1/messages";
}

function getApiKey(request: FastifyRequest): string | undefined {
  const headerApiKey = firstHeaderValue(request.headers["x-api-key"]);
  if (headerApiKey) {
    return headerApiKey;
  }

  const authorization = firstHeaderValue(request.headers.authorization);
  const bearerPrefix = "Bearer ";
  if (authorization?.startsWith(bearerPrefix)) {
    const bearerToken = authorization.slice(bearerPrefix.length).trim();
    return bearerToken || undefined;
  }

  return undefined;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
