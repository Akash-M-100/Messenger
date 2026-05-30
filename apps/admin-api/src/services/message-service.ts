import { DbClient, Message, MessageEvent } from "@ums/db";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

export interface MessageFilters {
  status?: string;
  channel?: string;
  startDate?: Date;
  endDate?: Date;
}

export class MessageService {
  constructor(private db: DbClient) {}

  async getMessages(
    tenantId: string,
    filters: MessageFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Message>> {
    const where: Record<string, any> = { tenantId };

    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.channel) {
      where.channel = filters.channel;
    }
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const [messages, total] = await Promise.all([
      this.db.message.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.message.count({ where }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: messages,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }

  async getMessageById(tenantId: string, id: string): Promise<Message | null> {
    return this.db.message.findUnique({
      where: { id, tenantId },
    });
  }

  async getMessageEvents(
    tenantId: string,
    messageId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<MessageEvent>> {
    const [events, total] = await Promise.all([
      this.db.messageEvent.findMany({
        where: { messageId },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.messageEvent.count({ where: { messageId } }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: events,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }
}
