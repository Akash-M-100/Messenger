import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { buildServer } from "../../server/build-server.js";
import { loadServerConfig } from "../../server/config.js";
import { prisma } from "@ums/db";
import { createRedisConnection, getRedisConfigFromEnv } from "@ums/queue";
import { Queue } from "bullmq";

let server: any;
let redis: any;
let testTenant: any;
let testApiKey: string;
let testApiKeyHash: string;

beforeAll(async () => {
  const config = loadServerConfig(process.env);
  redis = createRedisConnection(getRedisConfigFromEnv());
  server = await buildServer({
    config,
    db: prisma,
    redis,
  });
});

afterAll(async () => {
  if (server) await server.close();
  if (redis) await redis.quit();
  await prisma.$disconnect();
});

beforeEach(async () => {
  const tenantSlug = `test-tenant-${crypto.randomUUID()}`;
  testTenant = await prisma.tenant.create({
    data: {
      name: "Test Tenant",
      slug: tenantSlug,
    },
  });

  const randomPart = crypto.randomBytes(24).toString("hex");
  testApiKey = `key_${randomPart}`;
  testApiKeyHash = crypto.createHash("sha256").update(testApiKey).digest("hex");

  await prisma.apiKey.create({
    data: {
      tenantId: testTenant.id,
      name: "Test API Key",
      keyPrefix: "key_",
      keyHash: testApiKeyHash,
      status: "ACTIVE",
    },
  });
});

afterEach(async () => {
  if (testTenant) {
    await prisma.message.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.apiKey.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
  }

  // Clear rate limits in Redis
  const keys = await redis.keys("rate-limit:*");
  if (keys.length > 0) {
    await redis.del(...keys);
  }
});

describe("API Gateway - Message Flow Integration Tests", () => {
  // Test 1: POST /v1/messages → returns 202 with message ID
  it("should return 202 and a message ID on successful POST /v1/messages", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Hello integration test 1",
      },
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(body.data.id).toBeDefined();
    expect(body.data.channel).toBe("SMS");
    expect(body.data.status).toBe("QUEUED");
  });

  // Test 2: POST /v1/messages → message saved in DB with status QUEUED
  it("should save message to DB with status QUEUED", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Hello integration test 2",
      },
    });

    const body = JSON.parse(res.payload);
    const msgId = body.data.id;

    const dbMsg = await prisma.message.findUnique({
      where: { id: msgId },
    });

    expect(dbMsg).toBeDefined();
    expect(dbMsg?.status).toBe("QUEUED");
    expect(dbMsg?.toAddress).toBe("+1234567890");
    expect(dbMsg?.body).toBe("Hello integration test 2");
  });

  // Test 3: POST /v1/messages → job enqueued in BullMQ
  it("should enqueue a job in BullMQ primary queue", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Hello integration test 3",
      },
    });

    const body = JSON.parse(res.payload);
    const msgId = body.data.id;

    const queue = new Queue("q-sms", { connection: redis });
    try {
      const job = await queue.getJob(msgId);
      expect(job).toBeDefined();
      expect(job?.id).toBe(msgId);
      expect(job?.data.message_id).toBe(msgId);
      expect(job?.data.tenant_id).toBe(testTenant.id);
      expect(job?.data.channel).toBe("sms");
    } finally {
      await queue.close();
    }
  });

  // Test 4: POST /v1/messages with invalid API key → returns 401
  it("should return 401 when sending a message with invalid API key", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": "invalid-api-key-value",
      },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Hello integration test 4",
      },
    });

    expect(res.statusCode).toBe(401);
  });

  // Test 5: POST /v1/messages with missing fields → returns 400
  it("should return 400 when missing required fields", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
      payload: {
        channel: "SMS",
        // missing "to"
        body: "Hello integration test 5",
      },
    });

    expect(res.statusCode).toBe(400);
  });

  // Test 6: GET /v1/messages/:id → returns message details
  it("should return message details by ID", async () => {
    const postRes = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Hello integration test 6",
      },
    });

    const msgId = JSON.parse(postRes.payload).data.id;

    const getRes = await server.inject({
      method: "GET",
      url: `/v1/messages/${msgId}`,
      headers: {
        "x-api-key": testApiKey,
      },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = JSON.parse(getRes.payload);
    expect(getBody.data).toBeDefined();
    expect(getBody.data.id).toBe(msgId);
    expect(getBody.data.to).toBe("+1234567890");
    expect(getBody.data.channel).toBe("SMS");
  });

  // Test 7: GET /v1/messages/:id → returns 404 for non-existent message
  it("should return 404 for non-existent message ID", async () => {
    const getRes = await server.inject({
      method: "GET",
      url: "/v1/messages/non_existent_message_id_12345",
      headers: {
        "x-api-key": testApiKey,
      },
    });

    expect(getRes.statusCode).toBe(404);
  });

  // Test 8: GET /v1/messages → returns paginated list
  it("should return the list of messages", async () => {
    // Seed a couple of messages
    await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": testApiKey },
      payload: { channel: "SMS", to: "+1234567890", body: "Message A" },
    });
    await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": testApiKey },
      payload: { channel: "SMS", to: "+1234567890", body: "Message B" },
    });

    const res = await server.inject({
      method: "GET",
      url: "/v1/messages",
      headers: {
        "x-api-key": testApiKey,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
  });

  // Test 9: Rate limiting → returns 429 after 100 requests
  it("should rate limit and return 429 after 100 requests in a window", async () => {
    // Send 100 requests
    for (let i = 0; i < 100; i++) {
      const res = await server.inject({
        method: "POST",
        url: "/v1/messages",
        headers: { "x-api-key": testApiKey },
        payload: {
          channel: "SMS",
          to: "+1234567890",
          body: `Rate limit test ${i}`,
        },
      });
      expect(res.statusCode).toBe(202);
    }

    // 101st request should be rate-limited
    const resLimit = await server.inject({
      method: "POST",
      url: "/v1/messages",
      headers: { "x-api-key": testApiKey },
      payload: {
        channel: "SMS",
        to: "+1234567890",
        body: "Rate limit exceed",
      },
    });

    expect(resLimit.statusCode).toBe(429);
    const body = JSON.parse(resLimit.payload);
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("TOO_MANY_REQUESTS");
  });
});
