export type Channel = "sms" | "whatsapp" | "email" | "voice";

export type Priority = "high" | "normal" | "low";

export interface MessageJobData {
  message_id: string;
  tenant_id: string;
  channel: Channel;
  priority: Priority;
  created_at: string;
  idempotency_key?: string | undefined;
}

export interface JobResult {
  success: boolean;
  provider_message_id?: string;
  error?: string;
  retry_count?: number;
}

export const QUEUE_NAMES: Record<Channel, string> = {
  sms: "q-sms",
  whatsapp: "q-whatsapp",
  email: "q-email",
  voice: "q-voice",
};

export const DLQ_NAMES: Record<Channel, string> = {
  sms: "dlq-sms",
  whatsapp: "dlq-whatsapp",
  email: "dlq-email",
  voice: "dlq-voice",
};

export const RETRY_CONFIG = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 60000, // 1 minute initial delay
  },
};

// Retry delays in milliseconds: 1min, 5min, 15min
export const RETRY_DELAYS = [1 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];

export const PRIORITY_MAP: Record<Priority, number> = {
  high: 1,
  normal: 5,
  low: 10,
};
