import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class MockVoiceProvider implements IChannelProvider {
  readonly providerId = "mock_voice";

  async send(payload: SendPayload): Promise<SendResult> {
    await new Promise(r => setTimeout(r, 300));
    return {
      providerId: this.providerId,
      providerMessageId: `voice_${Date.now()}_${Math.random()}`,
      status: "DISPATCHED" as MessageStatus,
      cost: Math.floor(Math.random() * 15) + 10,
    };
  }

  async getStatus(messageId: string) {
    return { status: "DELIVERED" as MessageStatus, deliveredAt: new Date() };
  }

  async validateTemplate(template: any) {
    return { valid: !!template.body };
  }

  async healthCheck() {
    return { healthy: true, latencyMs: Math.random() * 120 };
  }
}
