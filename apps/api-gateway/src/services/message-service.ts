import {
  MessageDirection,
  MessageStatus,
  Prisma,
  type DbClient,
} from "@ums/db";

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
}

export interface MessageServiceDependencies {
  db: DbClient;
}

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

      return toCreateMessageResponse(message);
    },
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
