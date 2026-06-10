import { Job } from "bullmq";
import { PrismaClient, MessageStatus } from "@ums/db";
import type { MessageJobData, JobResult } from "@ums/queue";
import type { IChannelProvider } from "@ums/core";
import {
  jobDurationSeconds,
  jobsCompletedTotal,
  jobsFailedTotal,
  providerApiLatencySeconds,
} from "./metrics.js";

export async function processMessage(
  job: Job<MessageJobData>,
  provider: IChannelProvider,
  prisma: PrismaClient,
  providerName: string,
): Promise<JobResult> {
  const jobStartedAt = process.hrtime.bigint();

  try {
    // Load message
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: job.data.message_id },
    });
    const metadata = toMetadataRecord(message.metadata);
    const windowValidation = validateWhatsAppSessionWindow(metadata);
    const metadataWithWindowValidation = {
      ...metadata,
      whatsapp_24h_window_checked: true,
      whatsapp_24h_window_valid: windowValidation.withinWindow,
      whatsapp_template_allowed: windowValidation.isTemplate,
    };

    if (!windowValidation.allowed) {
      const errorMessage =
        "WhatsApp 24-hour session window expired. Use a template message.";
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          failedAt: new Date(),
          errorMessage,
          metadata: metadataWithWindowValidation,
        },
      });
      throw new Error(errorMessage);
    }

    // Update to DISPATCHING
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DISPATCHED,
        metadata: metadataWithWindowValidation,
      },
    });

    // Send via provider
    const content: Record<string, string> = {};
    if (message.subject) content.subject = message.subject;
    if (message.body) content.body = message.body;
    
    const providerStartedAt = process.hrtime.bigint();
    const result = await provider.send({
      channel: message.channel.toLowerCase() as any,
      recipient: {
        phone: message.toAddress,
        email: message.toAddress,
      },
      content,
      metadata: metadataWithWindowValidation,
    });
    providerApiLatencySeconds.observe(
      { provider: providerName },
      elapsedSeconds(providerStartedAt),
    );

    // Update to DELIVERED
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DELIVERED,
        deliveredAt: new Date(),
      },
    });

    jobsCompletedTotal.inc({
      channel: job.data.channel,
      provider: providerName,
    });

    return {
      success: true,
      provider_message_id: result.providerMessageId,
    };
  } catch (error) {
    console.error("Error processing message:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    jobsFailedTotal.inc({
      channel: job.data.channel,
      provider: providerName,
      error_type: getErrorType(error),
    });

    await prisma.message.update({
      where: { id: job.data.message_id },
      data: {
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        errorMessage: errorMessage ?? undefined,
      },
    });

    throw error;
  } finally {
    jobDurationSeconds.observe(
      {
        channel: job.data.channel,
        provider: providerName,
      },
      elapsedSeconds(jobStartedAt),
    );
  }
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function getErrorType(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function toMetadataRecord(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {};
}

function validateWhatsAppSessionWindow(metadata: Record<string, unknown>) {
  const lastUserMessageAt = parseDate(metadata.last_user_message_at);
  const withinWindow =
    !!lastUserMessageAt &&
    Date.now() - lastUserMessageAt.getTime() <= 24 * 60 * 60 * 1000;
  const isTemplate = metadata.is_template === true;

  return {
    allowed: withinWindow || isTemplate,
    withinWindow,
    isTemplate,
  };
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
