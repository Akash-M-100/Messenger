import { z } from "zod";

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  channel: z.enum(["SMS", "EMAIL", "WHATSAPP", "VOICE"]),
  type: z.enum(["TEXT", "PROMOTIONAL", "TRANSACTIONAL", "OTP"]).default("TEXT"),
  content: z.string().min(1),
  variables: z.array(z.string()).default([]),
  metadata: z.record(z.any()).optional(),
});

export const submitTemplateSchema = z.object({
  dltEntityId: z.string().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  content: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type SubmitTemplateInput = z.infer<typeof submitTemplateSchema>;
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;
