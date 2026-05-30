import { z } from "zod";

const configSchema = z.object({
  host: z.string().default("localhost"),
  port: z.coerce.number().default(3001),
  adminSecret: z.string().min(32, "ADMIN_SECRET must be at least 32 characters"),
  logger: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    })
    .default({}),
});

export type AdminConfig = z.infer<typeof configSchema>;

export function loadAdminConfig(env: NodeJS.ProcessEnv): AdminConfig {
  return configSchema.parse({
    host: env.ADMIN_API_HOST,
    port: env.ADMIN_API_PORT,
    adminSecret: env.ADMIN_SECRET,
    logger: {
      level: env.LOG_LEVEL,
    },
  });
}
