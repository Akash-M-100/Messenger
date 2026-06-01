import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { verifySesSignature } from "../../utils/signature-verification.js";
import { normalizeSesStatus } from "../../utils/status-normalization.js";
import { processWebhookUpdate } from "../../services/webhook-service.js";

/**
 * AWS SES email webhook handler
 * POST /webhooks/ses/email
 *
 * SES sends bounce/delivery notifications via SNS
 */
export async function registerSesRoutes(
  server: FastifyInstance,
): Promise<void> {
  server.post<{ Body: Record<string, any> }>(
    "/ses/email",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as Record<string, any>;
        const signature = (request.headers["x-amz-sns-signature"] as string) || "";
        const sesSecret = process.env.SES_WEBHOOK_SECRET;

        if (!sesSecret) {
          return reply.status(400).send({
            error: {
              code: "MISSING_CONFIG",
              message: "SES_WEBHOOK_SECRET not set",
            },
          });
        }

        // Verify signature (skip in development if configured)
        const config = (server as any).config as any;
        const skipVerification = config?.skipSignatureVerification ?? false;
        
        if (!skipVerification) {
          const payloadString = JSON.stringify(body);
          if (!verifySesSignature(payloadString, signature, sesSecret)) {
            return reply.status(401).send({
              error: {
                code: "INVALID_SIGNATURE",
                message: "Webhook signature verification failed",
              },
            });
          }
        }

        // Parse SNS message
        const message = JSON.parse(body.Message || "{}");

        if (message.eventType === "Bounce") {
          const bounces = message.bounce?.bouncedRecipients || [];
          for (const bounce of bounces) {
            const status = normalizeSesStatus(
              message.eventType,
              message.bounce?.bounceType,
            );

            if (!status) continue;

            const externalId = message.mail?.messageId || "";
            const tenantId = message.tenant_id || "";

            if (!tenantId || !externalId) {
              continue;
            }

            await processWebhookUpdate((server as any).db, {
              tenantId,
              externalId,
              newStatus: status,
              providerName: "SES",
              rawPayload: message,
              eventType:
                status === "FAILED" ? "MESSAGE_FAILED" : "MESSAGE_DELIVERED",
            });
          }
        } else if (message.eventType === "Delivery") {
          const status = normalizeSesStatus(message.eventType);
          if (status) {
            const externalId = message.mail?.messageId || "";
            const tenantId = message.tenant_id || "";

            if (tenantId && externalId) {
              await processWebhookUpdate((server as any).db, {
                tenantId,
                externalId,
                newStatus: status,
                providerName: "SES",
                rawPayload: message,
                eventType: "MESSAGE_DELIVERED",
              });
            }
          }
        } else if (message.eventType === "Send") {
          const status = normalizeSesStatus(message.eventType);
          if (status) {
            const externalId = message.mail?.messageId || "";
            const tenantId = message.tenant_id || "";

            if (tenantId && externalId) {
              await processWebhookUpdate((server as any).db, {
                tenantId,
                externalId,
                newStatus: status,
                providerName: "SES",
                rawPayload: message,
                eventType: "MESSAGE_SENT",
              });
            }
          }
        }

        return reply.send({ success: true });
      } catch (error) {
        server.log.error({ error }, "SES webhook processing failed");
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
