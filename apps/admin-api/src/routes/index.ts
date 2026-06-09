import { FastifyInstance } from "fastify";
import { registerTenantRoutes } from "./tenants.js";
import { registerTemplateRoutes } from "./templates.js";
import { registerApiKeyRoutes } from "./api-keys.js";
import { registerMessageRoutes } from "./messages.js";
import { registerAuditLogRoutes } from "./audit-logs.js";
import { registerProviderRoutes } from "./providers.js";
import { registerHealthRoutes } from "./health.js";
import { registerMetricsRoutes } from "./metrics.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await registerHealthRoutes(server);
  await registerMetricsRoutes(server);
  await registerTenantRoutes(server);
  await registerTemplateRoutes(server);
  await registerApiKeyRoutes(server);
  await registerMessageRoutes(server);
  await registerAuditLogRoutes(server);
  await registerProviderRoutes(server);
}
