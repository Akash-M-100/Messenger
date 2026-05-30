import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { verifyExotelSignature } from "../../utils/signature-verification.js";
import { normalizeExotelStatus } from "../../utils/status-normalization.js";
import { processWebhookUpdate } from "../../services/webhook-service.js";

/**
 * Exotel voice webhook handler
 * POST /webhooks/exotel/voice
 */
export async function registerExotelRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.post<{ Body: Record<string, any> }>(
    "/exotel/voice",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, any>;
        const signature = (request.headers["x-exotel-signature"] as string) || "";
        const apiToken = process.env.EXOTEL_API_TOKEN;

        if (!apiToken) {
          return reply.status(400).send({
            error: {
              code: "MISSING_CONFIG",
              message: "EXOTEL_API_TOKEN not set",
            },
          });
        }

        // Verify signature (skip in development if configured)
        const config = (server as any).config as any;
        const skipVerification = config?.skipSignatureVerification ?? false;
        
        if (!skipVerification) {
          const payloadString = JSON.stringify(body);
          if (!verifyExotelSignature(payloadString, signature, apiToken)) {
            return reply.status(401).send({
              error: {
                code: "INVALID_SIGNATURE",
                message: "Webhook signature verification failed",
              },
            });
          }
        }

        // Parse Exotel call status update
        const status = normalizeExotelStatus(body.call_status);
        if (!status) {
          return reply.status(400).send({
            error: {
              code: "INVALID_STATUS",
              message: "Unknown call status",
            },
          });
        }

        const externalId = body.call_sid || "";
        const tenantId = body.tenant_id || "";

        if (!tenantId) {
          return reply.status(400).send({
            error: {
              code: "MISSING_TENANT",
              message: "tenant_id is required",
            },
          });
        }

        if (!externalId) {
          return reply.status(400).send({
            error: {
              code: "MISSING_CALL_ID",
              message: "call_sid is required",
            },
          });
        }

        // Process the webhook
        await processWebhookUpdate((server as any).db, {
          tenantId,
          externalId,
          newStatus: status,
          providerName: "EXOTEL",
          rawPayload: body,
          eventType:
            status === "DELIVERED"
              ? "MESSAGE_DELIVERED"
              : status === "FAILED"
                ? "MESSAGE_FAILED"
                : "MESSAGE_SENT",
        });

        return reply.send({ success: true });
      } catch (error) {
        server.log.error({ error }, "Exotel webhook processing failed");
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
