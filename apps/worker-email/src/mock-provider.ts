import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class MockEmailProvider implements IChannelProvider {
  readonly providerId = "mock_email";

  async send(payload: SendPayload): Promise<SendResult> {
    await new Promise(r => setTimeout(r, 150));
    return {
      providerId: this.providerId,
      providerMessageId: `email_${Date.now()}_${Math.random()}`,
      status: "DISPATCHED" as MessageStatus,
      cost: Math.floor(Math.random() * 10) + 5,
    };
  }

  async getStatus(messageId: string) {
    return { status: "DELIVERED" as MessageStatus, deliveredAt: new Date() };
  }

  async validateTemplate(template: any) {
    return { valid: !!(template.body && template.subject) };
  }

  async healthCheck() {
    return { healthy: true, latencyMs: Math.random() * 100 };
  }
}
