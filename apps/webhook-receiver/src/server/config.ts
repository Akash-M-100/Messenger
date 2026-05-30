import { z } from "zod";

const configSchema = z.object({
  host: z.string().default("localhost"),
  port: z.coerce.number().default(3002),
  skipSignatureVerification: z
    .enum(["true", "false"])
    .default("false")
    .transform((val) => val === "true"),
  logger: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    })
    .default({}),
});

export type ServerConfig = z.infer<typeof configSchema>;

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  return configSchema.parse({
    host: env.WEBHOOK_RECEIVER_HOST,
    port: env.WEBHOOK_RECEIVER_PORT,
    skipSignatureVerification: env.SKIP_SIGNATURE_VERIFICATION,
    logger: {
      level: env.LOG_LEVEL,
    },
  });
}
