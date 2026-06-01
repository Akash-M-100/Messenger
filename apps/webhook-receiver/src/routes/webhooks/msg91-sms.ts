import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { verifyMsg91Signature } from "../../utils/signature-verification.js";
import { normalizeMsg91Status } from "../../utils/status-normalization.js";
import { processWebhookUpdate } from "../../services/webhook-service.js";

/**
 * MSG91 DLR webhook handler
 * POST /webhooks/msg91/sms
 */
export async function registerMsg91Routes(
  server: FastifyInstance,
): Promise<void> {
  server.post<{ Body: Record<string, any> }>(
    "/msg91/sms",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, any>;

        // Extract signature and payload
        const signature = body.signature || "";
        const apiKey = process.env.MSG91_API_KEY;

        if (!apiKey) {
          return reply.status(400).send({
            error: { code: "MISSING_CONFIG", message: "MSG91_API_KEY not set" },
          });
        }

        // Verify signature (skip in development if configured)
        const config = (server as any).config as any;
        const skipVerification = config?.skipSignatureVerification ?? false;
        
        if (!skipVerification) {
          const payloadString = JSON.stringify(body);
          if (!verifyMsg91Signature(payloadString, signature, apiKey)) {
            return reply.status(401).send({
              error: {
                code: "INVALID_SIGNATURE",
                message: "Webhook signature verification failed",
              },
            });
          }
        }

        // Parse MSG91 response format
        const status = normalizeMsg91Status(body.status);
        if (!status) {
          return reply.status(400).send({
            error: { code: "INVALID_STATUS", message: "Unknown status" },
          });
        }

        // Extract tenant and message identifiers
        const tenantId = body.tenant_id || "";
        const externalId = body.message_id || "";

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
              code: "MISSING_MESSAGE_ID",
              message: "message_id is required",
            },
          });
        }

        // Process the webhook
        await processWebhookUpdate((server as any).db, {
          tenantId,
          externalId,
          newStatus: status,
          providerName: "MSG91",
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
        server.log.error({ error }, "MSG91 webhook processing failed");
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
