import { MessageChannel } from "@ums/db";
import { z } from "zod";

const jsonSchema: z.ZodType<unknown> = z.unknown();

export const idempotencyKeySchema = z.string().trim().min(1).max(160);

export const createMessageRequestSchema = z
  .object({
    channel: z.nativeEnum(MessageChannel),
    to: z.string().trim().min(1).max(320),
    from: z.string().trim().min(1).max(320).optional(),
    subject: z.string().trim().min(1).max(998).optional(),
    body: z.string().min(1).optional(),
    payload: jsonSchema.optional(),
    metadata: jsonSchema.optional(),
    externalId: z.string().trim().min(1).max(160).optional(),
    idempotencyKey: idempotencyKeySchema.optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .superRefine((value, context) => {
    if (!value.body && value.payload === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either body or payload is required",
        path: ["body"],
      });
    }
  });

export type CreateMessageRequest = z.infer<typeof createMessageRequestSchema>;

export interface CreateMessageResponse {
  id: string;
  externalId: string | null;
  channel: MessageChannel;
  status: string;
  to: string;
  scheduledAt: string | null;
  createdAt: string;
}

// List messages query schema with pagination and filtering
export const listMessagesQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v >= 1 && v <= 100, {
      message: "limit must be between 1 and 100",
    })
    .default("20"),
  offset: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v >= 0, {
      message: "offset must be non-negative",
    })
    .optional()
    .default("0"),
  channel: z.nativeEnum(MessageChannel).optional(),
  status: z.string().optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;

// Get message events query schema
export const getMessageEventsQuerySchema = z.object({
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v >= 1 && v <= 100, {
      message: "limit must be between 1 and 100",
    })
    .default("50"),
  offset: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => !Number.isNaN(v) && v >= 0, {
      message: "offset must be non-negative",
    })
    .optional()
    .default("0"),
});

export type GetMessageEventsQuery = z.infer<
  typeof getMessageEventsQuerySchema
>;

// Response types
export interface MessageDetail {
  id: string;
  externalId: string | null;
  channel: MessageChannel;
  status: string;
  to: string;
  from?: string | null;
  subject?: string | null;
  body?: string | null;
  metadata?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageEvent {
  id: string;
  type: string;
  status?: string;
  reason?: string | null;
  channel?: string;
  data?: unknown;
  createdAt: string;
}

export interface ListMessagesResponse {
  data: CreateMessageResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface GetMessageEventsResponse {
  data: MessageEvent[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

