import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string()).default([]),
  expiresIn: z.number().int().positive().optional().describe("Expiration in seconds"),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
