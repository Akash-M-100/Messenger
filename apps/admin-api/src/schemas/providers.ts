import { z } from "zod";

export const createProviderConfigSchema = z.object({
  type: z.enum(["SMS", "EMAIL", "WHATSAPP", "PUSH"]),
  name: z.string().min(1).max(160),
  config: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
});

export const updateProviderConfigSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  config: z.record(z.any()).optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateProviderConfigInput = z.infer<typeof createProviderConfigSchema>;
export type UpdateProviderConfigInput = z.infer<typeof updateProviderConfigSchema>;
