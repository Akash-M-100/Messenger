import { z } from "zod";

const serverConfigSchema = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().max(65_535).default(3003),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  AUTH_API_KEY: z.string().min(1),
  API_GATEWAY_URL: z.string().default("http://localhost:3000"),
});

export interface ServerConfig {
  host: string;
  port: number;
  apiKey: string;
  apiGatewayUrl: string;
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
    port: parsed.AUTH_SERVICE_PORT,
    apiKey: parsed.AUTH_API_KEY,
    apiGatewayUrl: parsed.API_GATEWAY_URL,
    logger: {
      level: parsed.LOG_LEVEL,
    },
  };
}
