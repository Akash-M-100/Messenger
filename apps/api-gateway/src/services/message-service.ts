import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
  Prisma,
  type DbClient,
} from "@ums/db";

import type {
  CreateMessageRequest,
  CreateMessageResponse,
  ListMessagesQuery,
  MessageDetail,
  MessageEvent,
} from "../schemas/message.js";
import { NotFoundError } from "../middleware/errors.js";
import type { AuthContext } from "./api-key-service.js";

export interface FallbackInfo {
  original: MessageChannel;
  fallback?: MessageChannel;
  attempted: MessageChannel;
}

export interface CreateMessageResponseWithFallback
  extends CreateMessageResponse {
  fallback?: FallbackInfo;
}

export interface MessageService {
  createMessage(
    authContext: AuthContext,
    request: CreateMessageRequest,
  ): Promise<CreateMessageResponseWithFallback>;
  listMessages(
    authContext: AuthContext,
    query: ListMessagesQuery,
  ): Promise<{ messages: CreateMessageResponse[]; total: number }>;
  getMessage(
    authContext: AuthContext,
    messageId: string,
  ): Promise<MessageDetail>;
  getMessageEvents(
    authContext: AuthContext,
    messageId: string,
    limit: number,
    offset: number,
  ): Promise<{ events: MessageEvent[]; total: number }>;
  cancelMessage(authContext: AuthContext, messageId: string): Promise<void>;
  recordFallbackEvent(
    messageId: string,
    fromChannel: MessageChannel,
    toChannel: MessageChannel,
    reason: string,
  ): Promise<void>;
}

export interface MessageServiceDependencies {
  db: DbClient;
}

const FALLBACK_CHAINS: Record<string, string | null> = {
  SMS: "WHATSAPP",
  WHATSAPP: "SMS",
  EMAIL: null,
  VOICE: "SMS",
  PUSH: null,
  IN_APP: null,
};

export function createMessageService(
  dependencies: MessageServiceDependencies,
): MessageService {
  return {
    async createMessage(authContext, request) {
      if (request.idempotencyKey) {
        const existing = await dependencies.db.message.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: authContext.tenantId,
              idempotencyKey: request.idempotencyKey,
            },
          },
        });

        if (existing) {
          return toCreateMessageResponseWithFallback(existing);
        }
      }

      const scheduledAt = request.scheduledAt
        ? new Date(request.scheduledAt)
        : undefined;
      const createData: Prisma.MessageUncheckedCreateInput = {
        tenantId: authContext.tenantId,
        channel: request.channel,
        direction: MessageDirection.OUTBOUND,
        status: scheduledAt ? MessageStatus.SCHEDULED : MessageStatus.ACCEPTED,
        toAddress: request.to,
      };

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

      const message = await dependencies.db.message.create({
        data: createData,
      });

      return toCreateMessageResponseWithFallback(message);
    },
    async listMessages(authContext, query) {
      const where: Prisma.MessageWhereInput = {
        tenantId: authContext.tenantId,
      };

      if (query.channel) {
        where.channel = query.channel;
      }

      if (query.status) {
        where.status = query.status as MessageStatus;
      }

      if (query.dateFrom || query.dateTo) {
        where.createdAt = {};
        if (query.dateFrom) {
          (where.createdAt as any).gte = new Date(query.dateFrom);
        }
        if (query.dateTo) {
          (where.createdAt as any).lte = new Date(query.dateTo);
        }
      }

      const [messages, total] = await Promise.all([
        dependencies.db.message.findMany({
          where,
          orderBy: {
            createdAt: "desc",
          },
          take: query.limit,
          skip: query.offset,
        }),
        dependencies.db.message.count({ where }),
      ]);

      return {
        messages: messages.map(toCreateMessageResponse),
        total,
      };
    },
    async getMessage(authContext, messageId) {
      const message = await dependencies.db.message.findUnique({
        where: {
          id: messageId,
          tenantId: authContext.tenantId,
        },
      });

      if (!message) {
        throw new NotFoundError("Message not found");
      }

      return toMessageDetail(message);
    },
    async getMessageEvents(authContext, messageId, limit, offset) {
      // First verify the message exists and belongs to tenant
      const message = await dependencies.db.message.findUnique({
        where: {
          id: messageId,
          tenantId: authContext.tenantId,
        },
      });

      if (!message) {
        throw new NotFoundError("Message not found");
      }

      // For now, generate synthetic events from message state
      // In a production system with MessageEvent model, query from there
      const events: MessageEvent[] = [];

      events.push({
        id: `${messageId}-created`,
        type: "message.created",
        status: message.status,
        createdAt: message.createdAt.toISOString(),
      });

      if (message.sentAt) {
        events.push({
          id: `${messageId}-sent`,
          type: "message.sent",
          status: "SENT",
          createdAt: message.sentAt.toISOString(),
        });
      }

      if (message.deliveredAt) {
        events.push({
          id: `${messageId}-delivered`,
          type: "message.delivered",
          status: "DELIVERED",
          createdAt: message.deliveredAt.toISOString(),
        });
      }

      if (message.failedAt) {
        events.push({
          id: `${messageId}-failed`,
          type: "message.failed",
          status: "FAILED",
          reason: message.errorMessage,
          createdAt: message.failedAt.toISOString(),
        });
      }

      // Sort by created time
      events.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

      // Apply pagination
      const paginatedEvents = events.slice(offset, offset + limit);

      return {
        events: paginatedEvents,
        total: events.length,
      };
    },
    async cancelMessage(authContext, messageId) {
      const message = await dependencies.db.message.findUnique({
        where: {
          id: messageId,
          tenantId: authContext.tenantId,
        },
      });

      if (!message) {
        throw new NotFoundError("Message not found");
      }

      if (message.status !== MessageStatus.SCHEDULED) {
        throw new Error("Only scheduled messages can be cancelled");
      }

      await dependencies.db.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.CANCELED },
      });
    },
    async recordFallbackEvent(messageId, fromChannel, toChannel, reason) {
      // Update message metadata to track fallback
      const message = await dependencies.db.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        throw new Error("Message not found for fallback recording");
      }

      const currentMetadata = (message.metadata as Record<string, any>) || {};
      currentMetadata.fallbackAttempted = {
        fromChannel,
        toChannel,
        reason,
        timestamp: new Date().toISOString(),
      };

      await dependencies.db.message.update({
        where: { id: messageId },
        data: {
          metadata: currentMetadata,
        },
      });
    },
  };
}

export function getFallbackChannel(channel: string): string | null {
  return FALLBACK_CHAINS[channel] ?? null;
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

function toCreateMessageResponseWithFallback(
  message: PersistedMessage,
): CreateMessageResponseWithFallback {
  const base = toCreateMessageResponse(message);
  const metadata = message.metadata as Record<string, any> | null;
  const fallback = metadata?.fallbackAttempted;

  if (fallback) {
    return {
      ...base,
      fallback: {
        original: fallback.fromChannel,
        fallback: fallback.toChannel,
        attempted: fallback.toChannel,
      },
    };
  }

  return base;
}

function toMessageDetail(message: PersistedMessage): MessageDetail {
  return {
    id: message.id,
    externalId: message.externalId,
    channel: message.channel,
    status: message.status,
    to: message.toAddress,
    from: message.fromAddress,
    subject: message.subject,
    body: message.body,
    metadata: message.metadata,
    errorCode: message.errorCode,
    errorMessage: message.errorMessage,
    scheduledAt: message.scheduledAt?.toISOString() ?? null,
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    failedAt: message.failedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
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

