// IChannelProvider and related types
// This file implements the provider contract required by the PRD (sections 7 & 8).

export enum Channel {
  SMS = "sms",
  WHATSAPP = "whatsapp",
  EMAIL = "email",
  VOICE = "voice",
}

export enum MessageStatus {
  QUEUED = "queued",
  DISPATCHED = "dispatched",
  DELIVERED = "delivered",
  FAILED = "failed",
}

// Minimal Template shape (matches PRD §7). Providers may use additional fields.
export interface Template {
  id: string;
  tenantId?: string;
  channel: Channel;
  language?: string;
  body: string;
  subject?: string;
  variables?: Record<string, string>;
  status?: "draft" | "submitted" | "approved" | "rejected";
  version?: number;
}

export interface SendPayload {
  channel: Channel;
  recipient: {
    phone?: string; // E.164 for SMS/WhatsApp/Voice
    email?: string; // for Email
    name?: string;
  };
  content?: {
    subject?: string;
    body?: string;
    html?: string;
    media_url?: string;
    voice_script_url?: string;
    from?: string; // email: sender address
    replyTo?: string; // email: reply-to address
  };
  templateId?: string; // optional: reference to stored template
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  providerId: string; // e.g. "msg91", "meta_cloud"
  providerMessageId: string; // id returned by provider
  status: MessageStatus;
  cost?: number; // cost in paise (integer) when known
  rawResponse?: unknown; // provider raw response for debugging
}

export interface StatusResult {
  status: MessageStatus;
  deliveredAt?: Date | null;
  failureReason?: string | null;
  providerMessageId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface HealthResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string | null;
}

// Primary provider interface. Implementations MUST follow this contract.
export interface IChannelProvider {
  readonly providerId: string; // human-friendly id for the provider

  // Send a message. Implementations should throw on unrecoverable errors
  // or throw a ProviderError (see errors/ProviderError) with retriable flag
  send(payload: SendPayload): Promise<SendResult>;

  // Query a provider-specific status for a message id.
  getStatus(messageId: string): Promise<StatusResult>;

  // Validate that a tenant template is compatible with this provider.
  validateTemplate(template: Template): Promise<ValidationResult>;

  // Health check used by selection logic.
  healthCheck(): Promise<HealthResult>;
}
