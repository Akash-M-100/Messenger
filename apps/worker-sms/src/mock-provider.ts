import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class MockSMSProvider implements IChannelProvider {
  readonly providerId = "mock_sms";

  async send(payload: SendPayload): Promise<SendResult> {
    // Simulate send
    await new Promise(r => setTimeout(r, 100));
    return {
      providerId: this.providerId,
      providerMessageId: `sms_${Date.now()}_${Math.random()}`,
      status: "DISPATCHED" as MessageStatus,
      cost: Math.floor(Math.random() * 5) + 1,
    };
  }

  async getStatus(messageId: string) {
    return { status: "DELIVERED" as MessageStatus, deliveredAt: new Date() };
  }

  async validateTemplate(template: any) {
    return { valid: !!template.body };
  }

  async healthCheck() {
    return { healthy: true, latencyMs: Math.random() * 50 };
  }
}
