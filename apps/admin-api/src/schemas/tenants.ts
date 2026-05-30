import { z } from "zod";

export const createTenantSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(80),
  metadata: z.record(z.any()).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
