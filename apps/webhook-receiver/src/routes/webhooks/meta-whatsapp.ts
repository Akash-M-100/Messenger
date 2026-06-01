import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { verifyMetaSignature } from "../../utils/signature-verification.js";
import { normalizeMetaStatus } from "../../utils/status-normalization.js";
import { processWebhookUpdate } from "../../services/webhook-service.js";

/**
 * Meta (WhatsApp) webhook handler
 * POST /webhooks/meta/whatsapp
 */
export async function registerMetaRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.post<{ Body: Record<string, any> }>(
    "/meta/whatsapp",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, any>;
        const signature = (request.headers["x-hub-signature-256"] as string) || "";
        const token = process.env.META_WEBHOOK_TOKEN;

        if (!token) {
          return reply.status(400).send({
            error: {
              code: "MISSING_CONFIG",
              message: "META_WEBHOOK_TOKEN not set",
            },
          });
        }

        // Verify signature (skip in development if configured)
        const config = (server as any).config as any;
        const skipVerification = config?.skipSignatureVerification ?? false;
        
        if (!skipVerification) {
          const payloadString = JSON.stringify(body);
          if (!verifyMetaSignature(payloadString, signature, token)) {
            return reply.status(401).send({
              error: {
                code: "INVALID_SIGNATURE",
                message: "Webhook signature verification failed",
              },
            });
          }
        }

        // Handle different webhook types
        const entry = body.entry?.[0];
        const change = entry?.changes?.[0];

        if (!change) {
          return reply.send({ success: true }); // Ignore non-status updates
        }

        const value = change.value || {};
        const statuses = value.statuses || [];

        for (const statusUpdate of statuses) {
          const status = normalizeMetaStatus(statusUpdate.status);
          if (!status) continue;

          const externalId = statusUpdate.id || "";
          const tenantId = body.tenant_id || "";

          if (!tenantId || !externalId) {
            continue;
          }

          await processWebhookUpdate((server as any).db, {
            tenantId,
            externalId,
            newStatus: status,
            providerName: "META",
            rawPayload: statusUpdate,
            eventType:
              status === "DELIVERED"
                ? "MESSAGE_DELIVERED"
                : status === "FAILED"
                  ? "MESSAGE_FAILED"
                  : "MESSAGE_SENT",
          });
        }

        return reply.send({ success: true });
      } catch (error) {
        server.log.error({ error }, "Meta webhook processing failed");
        return reply.status(500).send({
          error: {
            code: "PROCESSING_FAILED",
            message: "Webhook processing failed",
          },
        });
      }
    },
  );
}
