import { z } from "zod";

const serverConfigSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export interface ServerConfig {
  host: string;
  port: number;
  logger: {
    level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  };
}

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = serverConfigSchema.parse(env);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    logger: {
      level: parsed.LOG_LEVEL,
    },
  };
}
