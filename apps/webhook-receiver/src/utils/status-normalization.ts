import type { MessageStatus } from "@ums/db";

/**
 * Normalize MSG91 DLR statuses to common format
 */
export function normalizeMsg91Status(
  status: string,
): MessageStatus | undefined {
  const normalizedStatus: Record<string, MessageStatus | undefined> = {
    "0": "FAILED", // Failed
    "1": "SENT", // Submitted
    "2": "DELIVERED", // Delivered
    "3": "FAILED", // Rejected
    "4": "FAILED", // Undelivered
    "5": "SENT", // Accepted
    "6": "FAILED", // Undelivered
    "7": "DELIVERED", // Delivered by Carrier
  };

  return normalizedStatus[status];
}

/**
 * Normalize Meta (WhatsApp) webhook statuses to common format
 */
export function normalizeMetaStatus(
  status: string,
): MessageStatus | undefined {
  const normalizedStatus: Record<string, MessageStatus | undefined> = {
    read: "DELIVERED",
    delivered: "DELIVERED",
    sent: "SENT",
    failed: "FAILED",
    pending: "SENT",
  };

  return normalizedStatus[status.toLowerCase()];
}

/**
 * Normalize AWS SES bounce/delivery notifications to common format
 */
export function normalizeSesStatus(
  eventType: string,
  bounceType?: string,
): MessageStatus | undefined {
  if (eventType === "Delivery") {
    return "DELIVERED";
  }

  if (eventType === "Send") {
    return "SENT";
  }

  if (eventType === "Bounce") {
    // Permanent bounces = failed, temporary = keep as sent
    return bounceType === "Permanent" ? "FAILED" : undefined;
  }

  if (eventType === "Complaint") {
    return "DELIVERED";
  }

  return undefined;
}

/**
 * Normalize Exotel voice call statuses to common format
 */
export function normalizeExotelStatus(
  status: string,
): MessageStatus | undefined {
  const normalizedStatus: Record<string, MessageStatus | undefined> = {
    initiated: "SENT",
    ringing: "SENT",
    answered: "DELIVERED",
    completed: "DELIVERED",
    failed: "FAILED",
    not_answered: "FAILED",
    rejected: "FAILED",
    timedout: "FAILED",
    no_call_flow: "FAILED",
  };

  return normalizedStatus[status.toLowerCase()];
}
