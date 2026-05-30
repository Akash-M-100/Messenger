import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class MockWhatsAppProvider implements IChannelProvider {
  readonly providerId = "mock_whatsapp";

  async send(payload: SendPayload): Promise<SendResult> {
    await new Promise(r => setTimeout(r, 200));
    return {
      providerId: this.providerId,
      providerMessageId: `wa_${Date.now()}_${Math.random()}`,
      status: "DISPATCHED" as MessageStatus,
      cost: Math.floor(Math.random() * 3) + 2,
    };
  }

  async getStatus(messageId: string) {
    return { status: "DELIVERED" as MessageStatus, deliveredAt: new Date() };
  }

  async validateTemplate(template: any) {
    return { valid: !!template.body };
  }

  async healthCheck() {
    return { healthy: true, latencyMs: Math.random() * 80 };
  }
}
