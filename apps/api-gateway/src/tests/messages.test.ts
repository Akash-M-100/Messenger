import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  ApiKeyStatus,
  MessageChannel,
  MessageStatus,
  Prisma,
  TenantStatus,
} from "@ums/db";
import type { FastifyInstance } from "fastify";

const mockRedis = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue("OK"),
  setex: vi.fn().mockResolvedValue("OK"),
  del: vi.fn().mockResolvedValue(0),
  quit: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  off: vi.fn(),
};

const mockDb = {
  message: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  apiKey: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  $disconnect: vi.fn(),
};

vi.mock("@ums/queue", () => ({
  createRedisConnection: vi.fn(() => mockRedis),
  getRedisConfigFromEnv: vi.fn(() => ({})),
  QueueManager: vi.fn().mockImplementation(() => ({
    getProducer: vi.fn(() => ({
      enqueueMessage: vi.fn().mockResolvedValue(undefined),
    })),
  })),
  MessageProducer: vi.fn().mockImplementation(() => ({
    enqueueMessage: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { buildServer } from "../server/build-server.js";

describe("Messages API", () => {
  let server: FastifyInstance;
  const testApiKey = "test-api-key-123";
  const testTenantId = "tenant-123";
  const testApiKeyHash = hashApiKey(testApiKey);

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default mocks
    mockDb.apiKey.findUnique.mockResolvedValue({
      id: "api-key-1",
      tenantId: testTenantId,
      keyHash: testApiKeyHash,
      status: ApiKeyStatus.ACTIVE,
      expiresAt: null,
      revokedAt: null,
      tenant: {
        id: testTenantId,
        status: TenantStatus.ACTIVE,
        deletedAt: null,
      },
      createdAt: new Date(),
    });
    mockDb.apiKey.update.mockResolvedValue({});

    mockDb.message.findUnique.mockResolvedValue(null);
    mockDb.message.create.mockResolvedValue({
      id: "msg-1",
      tenantId: testTenantId,
      channel: MessageChannel.EMAIL,
      direction: "OUTBOUND",
      status: MessageStatus.QUEUED,
      toAddress: "user@example.com",
      fromAddress: null,
      subject: null,
      body: null,
      externalId: null,
      payload: null,
      metadata: null,
      scheduledAt: null,
      idempotencyKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.setex.mockResolvedValue("OK");
    mockRedis.del.mockResolvedValue(0);

    server = await buildServer({
      config: {
        host: "localhost",
        port: 3000,
        logger: {
          level: "silent",
        },
      },
      db: mockDb as any,
      redis: mockRedis as any,
    });
  });

  afterEach(async () => {
    if (server) {
      await server.close().catch(() => {});
    }
  });

  describe("POST /v1/messages", () => {
    it("should create message successfully", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/v1/messages",
        headers: {
          "x-api-key": testApiKey,
        },
        payload: {
          channel: MessageChannel.EMAIL,
          to: "user@example.com",
          body: "Test message",
        },
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe("msg-1");
      expect(body.data.to).toBe("user@example.com");
    });

    it("should return 401 for invalid API key", async () => {
      mockDb.apiKey.findUnique.mockResolvedValueOnce(null);

      const response = await server.inject({
        method: "POST",
        url: "/v1/messages",
        headers: {
          "x-api-key": "invalid-key",
        },
        payload: {
          channel: MessageChannel.EMAIL,
          to: "user@example.com",
          body: "Test message",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should return 400 for missing required fields", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/v1/messages",
        headers: {
          "x-api-key": testApiKey,
        },
        payload: {
          channel: MessageChannel.EMAIL,
          to: "user@example.com",
          // missing body and payload
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for missing to address", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/v1/messages",
        headers: {
          "x-api-key": testApiKey,
        },
        payload: {
          channel: MessageChannel.EMAIL,
          body: "Test message",
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 401 when API key is missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/v1/messages",
        payload: {
          channel: MessageChannel.EMAIL,
          to: "user@example.com",
          body: "Test message",
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("GET /v1/messages/:id", () => {
    it("should return message by id", async () => {
      mockDb.message.findUniqueOrThrow.mockResolvedValueOnce({
        id: "msg-1",
        tenantId: testTenantId,
        channel: MessageChannel.EMAIL,
        direction: "OUTBOUND",
        status: MessageStatus.DELIVERED,
        toAddress: "user@example.com",
        fromAddress: "sender@example.com",
        subject: "Test",
        body: "Test message",
        externalId: null,
        payload: null,
        metadata: null,
        scheduledAt: null,
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages/msg-1",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe("msg-1");
      expect(body.data.to).toBe("user@example.com");
    });

    it("should return 404 when message not found", async () => {
      mockDb.message.findUniqueOrThrow.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Record not found", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages/non-existent",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("should enforce tenant isolation", async () => {
      mockDb.message.findUniqueOrThrow.mockResolvedValueOnce({
        id: "msg-1",
        tenantId: "different-tenant",
        channel: MessageChannel.EMAIL,
        direction: "OUTBOUND",
        status: MessageStatus.DELIVERED,
        toAddress: "user@example.com",
        fromAddress: null,
        subject: null,
        body: "Test",
        externalId: null,
        payload: null,
        metadata: null,
        scheduledAt: null,
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages/msg-1",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.message).toBe("Message not found");
    });

    it("should return 401 when API key is missing", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/v1/messages/msg-1",
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe("GET /v1/messages", () => {
    it("should return paginated list of messages", async () => {
      mockDb.message.findMany.mockResolvedValueOnce([
        {
          id: "msg-1",
          tenantId: testTenantId,
          channel: MessageChannel.EMAIL,
          direction: "OUTBOUND",
          status: MessageStatus.DELIVERED,
          toAddress: "user1@example.com",
          fromAddress: null,
          subject: null,
          body: "Message 1",
          externalId: null,
          payload: null,
          metadata: null,
          scheduledAt: null,
          idempotencyKey: null,
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date(),
        },
        {
          id: "msg-2",
          tenantId: testTenantId,
          channel: MessageChannel.SMS,
          direction: "OUTBOUND",
          status: MessageStatus.QUEUED,
          toAddress: "user2@example.com",
          fromAddress: null,
          subject: null,
          body: "Message 2",
          externalId: null,
          payload: null,
          metadata: null,
          scheduledAt: null,
          idempotencyKey: null,
          createdAt: new Date("2024-01-02"),
          updatedAt: new Date(),
        },
      ]);
      mockDb.message.count.mockResolvedValueOnce(2);

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages?page=1&limit=20",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.pages).toBe(1);
    });

    it("should support custom limit", async () => {
      mockDb.message.findMany.mockResolvedValueOnce([]);
      mockDb.message.count.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages?page=1&limit=10",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.pagination.limit).toBe(10);
    });

    it("should default pagination to page 1, limit 20", async () => {
      mockDb.message.findMany.mockResolvedValueOnce([]);
      mockDb.message.count.mockResolvedValueOnce(0);

      const response = await server.inject({
        method: "GET",
        url: "/v1/messages",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
    });

    it("should filter by tenant", async () => {
      mockDb.message.findMany.mockResolvedValueOnce([]);
      mockDb.message.count.mockResolvedValueOnce(0);

      await server.inject({
        method: "GET",
        url: "/v1/messages",
        headers: {
          "x-api-key": testApiKey,
        },
      });

      expect(mockDb.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: testTenantId },
        })
      );
    });

    it("should return 401 when API key is missing", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/v1/messages",
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}
