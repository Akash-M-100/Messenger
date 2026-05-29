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
