import {
  MessageDirection,
  MessageStatus,
  Prisma,
  type DbClient,
} from "@ums/db";
import {
  CacheManager,
  CircuitBreaker,
  withRetry,
  type RedisInstance,
} from "@ums/core";
import { MessageProducer, type QueueManager } from "@ums/queue";

import type {
  CreateMessageRequest,
  CreateMessageResponse,
} from "../schemas/message.js";
import type { AuthContext } from "./api-key-service.js";

export interface MessageService {
  createMessage(
    authContext: AuthContext,
    request: CreateMessageRequest,
  ): Promise<CreateMessageResponse>;
  listMessages(authContext: AuthContext): Promise<CreateMessageResponse[]>;
  getMessage(
    authContext: AuthContext,
    messageId: string,
  ): Promise<CreateMessageResponse>;
  cancelMessage(authContext: AuthContext, messageId: string): Promise<void>;
}

export interface MessageServiceDependencies {
  db: DbClient;
  redis: RedisInstance;
  queueManager: QueueManager;
}

export function createMessageService(
  dependencies: MessageServiceDependencies,
): MessageService {
  const cache = new CacheManager(dependencies.redis);
  const circuitBreaker = new CircuitBreaker(5, 2, 60000); // 5 failures threshold, 2 successes to recover, 60s timeout
  const producer = new MessageProducer({ queueManager: dependencies.queueManager });

  return {
    async createMessage(authContext, request) {
      try {
        if (request.idempotencyKey) {
          const existing = await withRetry(
            () =>
              dependencies.db.message.findUnique({
                where: {
                  tenantId_idempotencyKey: {
                    tenantId: authContext.tenantId,
                    idempotencyKey: request.idempotencyKey as string,
                  },
                },
              }),
            { maxAttempts: 3, initialDelayMs: 100 },
          );

          if (existing) {
            return toCreateMessageResponse(existing);
          }
        }

        const scheduledAt = request.scheduledAt
          ? new Date(request.scheduledAt)
          : undefined;
        const createData: Prisma.MessageUncheckedCreateInput = {
          tenantId: authContext.tenantId,
          channel: request.channel,
          direction: MessageDirection.OUTBOUND,
          status: scheduledAt ? MessageStatus.SCHEDULED : MessageStatus.QUEUED,
          toAddress: request.to ?? "",
        };

        if (scheduledAt) {
          (createData as Prisma.MessageUncheckedCreateInput).scheduledAt = scheduledAt;
        } else if (request.scheduledAt) {
          // If scheduledAt is provided but can't be parsed, handle it
          (createData as Prisma.MessageUncheckedCreateInput).scheduledAt = new Date(
            request.scheduledAt,
          );
        }

        if (request.idempotencyKey) {
          createData.idempotencyKey = request.idempotencyKey;
        }

        if (request.externalId) {
          createData.externalId = request.externalId;
        }

        if (request.from) {
          createData.fromAddress = request.from;
        }

        if (request.subject) {
          createData.subject = request.subject;
        }

        if (request.body) {
          createData.body = request.body;
        }

        if (request.payload !== undefined) {
          createData.payload = toNullableJson(request.payload);
        }

        if (request.metadata !== undefined) {
          createData.metadata = toNullableJson(request.metadata);
        }

        if (scheduledAt) {
          createData.scheduledAt = scheduledAt;
        }

        const message = await withRetry(
          () => circuitBreaker.execute(() => dependencies.db.message.create({ data: createData })),
          { maxAttempts: 3, initialDelayMs: 100 },
        );

        // Enqueue message for processing (unless it's scheduled for later)
        if (!scheduledAt) {
          try {
            await producer.enqueueMessage(
              message.id,
              authContext.tenantId,
              request.channel.toLowerCase() as any,
              "normal",
              request.idempotencyKey,
            );
          } catch (queueError) {
            // Log queue error but don't fail the message creation
            console.warn(
              "Failed to enqueue message:",
              {
                messageId: message.id,
                tenantId: authContext.tenantId,
                channel: request.channel,
                error: queueError instanceof Error ? queueError.message : String(queueError),
              },
            );
          }
        }

        // Invalidate list cache on create
        await cache.invalidate(`messages:list:${authContext.tenantId}`);

        return toCreateMessageResponse(message);
      } catch (error) {
        const errorDetails = extractErrorDetails(error);
        console.error(
          "Error creating message:",
          {
            name: errorDetails.name,
            message: errorDetails.message,
            code: errorDetails.code,
            stack: errorDetails.stack,
            tenantId: authContext.tenantId,
            channel: request.channel,
          },
        );
        throw error;
      }
    },
    async listMessages(authContext) {
      const cacheKey = `messages:list:${authContext.tenantId}`;
      const result = await cache.getOrExecuteWithFallback(
        cacheKey,
        async () => {
          const messages = await withRetry(
            () =>
              circuitBreaker.execute(() =>
                dependencies.db.message.findMany({
                  where: { tenantId: authContext.tenantId },
                  orderBy: { createdAt: "desc" },
                }),
              ),
            { maxAttempts: 3, initialDelayMs: 100 },
          );
          return messages.map(toCreateMessageResponse);
        },
        { ttl: 300, staleTtl: 3600 },
      );
      return result ?? [];
    },
    async getMessage(authContext, messageId) {
      const cacheKey = `message:${authContext.tenantId}:${messageId}`;
      const result = await cache.getOrExecuteWithFallback(
        cacheKey,
        async () => {
          const message = await withRetry(
            () =>
              circuitBreaker.execute(() =>
                dependencies.db.message.findUniqueOrThrow({
                  where: {
                    id: messageId,
                  },
                }),
              ),
            { maxAttempts: 3, initialDelayMs: 100 },
          );
          // Verify the message belongs to the tenant
          if (message.tenantId !== authContext.tenantId) {
            throw new Error("Message not found");
          }
          return toCreateMessageResponse(message);
        },
        { ttl: 300, staleTtl: 3600 },
      );
      if (!result) {
        throw new Error("Message not found");
      }
      return result;
    },
    async cancelMessage(authContext, messageId) {
      const message = await withRetry(
        () =>
          circuitBreaker.execute(() =>
            dependencies.db.message.findUniqueOrThrow({
              where: {
                id: messageId,
                tenantId: authContext.tenantId,
              },
            }),
          ),
        { maxAttempts: 3, initialDelayMs: 100 },
      );

      if (message.status !== MessageStatus.SCHEDULED) {
        throw new Error("Only scheduled messages can be cancelled");
      }

      await withRetry(
        () =>
          circuitBreaker.execute(() =>
            dependencies.db.message.update({
              where: { id: messageId },
              data: { status: MessageStatus.CANCELED },
            }),
          ),
        { maxAttempts: 3, initialDelayMs: 100 },
      );

      // Invalidate caches on cancel
      await cache.invalidate(`message:${authContext.tenantId}:${messageId}`);
      await cache.invalidate(`messages:list:${authContext.tenantId}`);
    },
  };
}

function extractErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: (error as any).code,
      stack: (error as any).stack,
    };
  }
  return {
    type: typeof error,
    value: error,
  };
}

type PersistedMessage = Awaited<
  ReturnType<DbClient["message"]["create"]>
>;

function toCreateMessageResponse(
  message: PersistedMessage,
): CreateMessageResponse {
  return {
    id: message.id,
    externalId: message.externalId,
    channel: message.channel,
    status: message.status,
    to: message.toAddress,
    scheduledAt: message.scheduledAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

function toNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}
