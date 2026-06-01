import { createHmac } from "node:crypto";

import type { DbClient, MessageStatus } from "@ums/db";

export type WebhookEventType = "MESSAGE_SENT" | "MESSAGE_DELIVERED" | "MESSAGE_FAILED";

export interface WebhookUpdatePayload {
  tenantId: string;
  messageId?: string;
  externalId?: string;
  newStatus: MessageStatus;
  previousStatus?: MessageStatus;
  providerName: string;
  rawPayload: Record<string, any>;
  eventType: WebhookEventType;
}

/**
 * Service to handle webhook updates
 * - Update message status in database
 * - Create MessageEvent record
 * - Fire outbound webhooks to client apps
 */
export async function processWebhookUpdate(
  db: DbClient,
  payload: WebhookUpdatePayload,
): Promise<void> {
  // Check for idempotency using externalId + provider + newStatus
  if (payload.externalId && payload.providerName) {
    const existingEvent = await db.messageEvent.findFirst({
      where: {
        externalId: payload.externalId,
        providerName: payload.providerName,
        eventType: payload.eventType,
      },
    });

    if (existingEvent) {
      // Duplicate webhook, log and return
      return;
    }
  }

  // Find the message
  let message;
  if (payload.messageId) {
    message = await db.message.findUnique({
      where: {
        id: payload.messageId,
      },
    });
  } else if (payload.externalId && payload.tenantId) {
    message = await db.message.findUnique({
      where: {
        tenantId_externalId: {
          tenantId: payload.tenantId,
          externalId: payload.externalId,
        },
      },
    });
  }

  if (!message) {
    throw new Error(
      `Message not found: ${payload.messageId || payload.externalId}`,
    );
  }

  // Only update if new status is different from current
  if (message.status !== payload.newStatus) {
    await db.message.update({
      where: { id: message.id },
      data: {
        status: payload.newStatus,
        deliveredAt:
          payload.newStatus === "DELIVERED"
            ? new Date()
            : message.deliveredAt,
        failedAt:
          payload.newStatus === "FAILED" ? new Date() : message.failedAt,
        sentAt: payload.newStatus === "DISPATCHED" ? new Date() : message.sentAt,
      },
    });
  }

  // Create MessageEvent record
  const event = await db.messageEvent.create({
    data: {
      messageId: message.id,
      tenantId: message.tenantId,
      eventType: payload.eventType,
      previousStatus: payload.previousStatus ?? message.status,
      newStatus: payload.newStatus,
      externalId: payload.externalId ?? null,
      providerName: payload.providerName,
      rawPayload: payload.rawPayload,
    },
  });

  // Fire outbound webhooks if subscriptions exist
  const subscriptions = await db.webhookSubscription.findMany({
    where: {
      tenantId: message.tenantId,
      active: true,
      events: {
        has: payload.eventType,
      },
    },
  });

  for (const subscription of subscriptions) {
    void fireOutboundWebhook(subscription, event, message);
  }
}

/**
 * Fire outbound webhook to client app
 * Uses fire-and-forget pattern with error logging
 */
async function fireOutboundWebhook(
  subscription: any,
  event: any,
  message: any,
): Promise<void> {
  try {
    const payloadData = {
      event: subscription.events,
      data: {
        messageId: message.id,
        externalId: message.externalId,
        status: event.newStatus,
        previousStatus: event.previousStatus,
        channel: message.channel,
        toAddress: message.toAddress,
        timestamp: event.createdAt.toISOString(),
      },
    };

    const payloadString = JSON.stringify(payloadData);
    const hmac = createHmac("sha256", subscription.secret);
    hmac.update(payloadString);
    const signature = hmac.digest("hex");

    await fetch(subscription.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
      },
      body: payloadString,
    });
  } catch (error) {
    // Log but don't throw - webhooks are best-effort
    console.error(
      `Failed to fire outbound webhook to ${subscription.url}:`,
      error,
    );
  }
}
