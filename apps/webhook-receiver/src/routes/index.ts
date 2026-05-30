import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { registerMsg91Routes } from "./webhooks/msg91-sms.js";
import { registerMetaRoutes } from "./webhooks/meta-whatsapp.js";
import { registerSesRoutes } from "./webhooks/ses-email.js";
import { registerExotelRoutes } from "./webhooks/exotel-voice.js";

export async function registerRoutes(server: FastifyInstance): Promise<void> {
  await server.register(registerMsg91Routes, { prefix: "/webhooks" });
  await server.register(registerMetaRoutes, { prefix: "/webhooks" });
  await server.register(registerSesRoutes, { prefix: "/webhooks" });
  await server.register(registerExotelRoutes, { prefix: "/webhooks" });

  // Health check
  server.get(
    "/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ status: "ok" });
    },
  );
}
