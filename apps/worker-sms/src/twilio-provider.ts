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
    const requestBody = new URLSearchParams({
      From: this.fromNumber,
      To: payload.recipient.phone || "",
      Body: payload.content?.body || "",
    });
    const statusCallback = buildStatusCallbackUrl(payload.metadata);
    if (statusCallback) {
      requestBody.set("StatusCallback", statusCallback);
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: this.getAuthHeader(),
        },
        body: requestBody.toString(),
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

function buildStatusCallbackUrl(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  const configuredUrl =
    stringValue(metadata?.status_callback_url) ||
    stringValue(process.env.TWILIO_SMS_STATUS_CALLBACK_URL);
  if (!configuredUrl) {
    return undefined;
  }

  const url = new URL(configuredUrl);
  for (const key of ["dlt_template_id", "dlt_entity_id", "sender_id"]) {
    const value = stringValue(metadata?.[key]);
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
