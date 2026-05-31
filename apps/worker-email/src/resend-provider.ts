import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class ResendEmailProvider implements IChannelProvider {
  readonly providerId = "resend";
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Resend API key is required");
    }
    this.apiKey = apiKey;
  }

  async send(payload: SendPayload): Promise<SendResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: payload.content?.from || "noreply@resend.dev",
        to: payload.recipient.email,
        subject: payload.content?.subject || "Message",
        html: payload.content?.html || payload.content?.body,
        text: payload.content?.body,
        reply_to: payload.content?.replyTo,
        headers: payload.metadata?.headers || {},
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Resend API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { id: string };

    return {
      providerId: this.providerId,
      providerMessageId: result.id,
      status: "DISPATCHED" as MessageStatus,
      cost: 0,
    };
  }

  async getStatus(messageId: string) {
    const response = await fetch(`https://api.resend.com/emails/${messageId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Resend API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { status: string; created_at: string; };

    return {
      status: (result.status.toUpperCase() === "SENT"
        ? "DELIVERED"
        : result.status.toUpperCase()) as MessageStatus,
      deliveredAt: new Date(result.created_at),
    };
  }

  async validateTemplate(template: any) {
    return { valid: !!(template.body && template.subject) };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: "noreply@resend.dev",
          to: "delivered@resend.dev",
          subject: "Health Check",
          html: "<p>Health check</p>",
        }),
      });

      const latencyMs = Date.now() - start;
      return { healthy: response.ok, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return { healthy: false, latencyMs, error: (error as Error).message };
    }
  }
}
