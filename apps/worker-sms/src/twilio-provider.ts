import type { IChannelProvider, SendPayload, SendResult, MessageStatus } from "@ums/core";

export class TwilioSMSProvider implements IChannelProvider {
  readonly providerId = "twilio";
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;

  constructor(accountSid: string, authToken: string, fromNumber: string) {
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials (accountSid, authToken, fromNumber) are required");
    }
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    return `Basic ${credentials}`;
  }

  async send(payload: SendPayload): Promise<SendResult> {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: this.getAuthHeader(),
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: payload.recipient.phone || "",
          Body: payload.content?.body || "",
        }).toString(),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Twilio API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { sid: string; price?: string };

    return {
      providerId: this.providerId,
      providerMessageId: result.sid,
      status: "DISPATCHED" as MessageStatus,
      cost: result.price ? Math.abs(parseFloat(result.price)) : 0.0075,
    };
  }

  async getStatus(messageId: string) {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages/${messageId}.json`,
      {
        headers: {
          Authorization: this.getAuthHeader(),
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Twilio API error: ${response.status} ${response.statusText}`,
      );
    }

    const result = (await response.json()) as { status: string; date_sent: string };

    return {
      status: result.status.toUpperCase() as MessageStatus,
      deliveredAt: new Date(result.date_sent),
    };
  }

  async validateTemplate(template: any) {
    return { valid: !!template.body };
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}.json`,
        {
          headers: {
            Authorization: this.getAuthHeader(),
          },
        },
      );

      const latencyMs = Date.now() - start;
      return { healthy: response.ok, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return { healthy: false, latencyMs, error: (error as Error).message };
    }
  }
}
