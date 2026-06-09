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
    const dltValidation = validateDltCompliance(message.toAddress, metadata);
    const metadataWithDltValidation = {
      ...metadata,
      dlt_checked: dltValidation.checked,
      dlt_compliant: dltValidation.compliant,
      dlt_warnings: dltValidation.warnings,
    };

    for (const warning of dltValidation.warnings) {
      console.warn("DLT compliance warning:", {
        messageId: message.id,
        recipient: message.toAddress,
        warning,
      });
    }

    // Update to DISPATCHING
    await prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.SENT },
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DISPATCHED,
        metadata: metadataWithDltValidation,
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
      metadata: metadataWithDltValidation,
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

    return { success: true, provider_message_id: result.providerMessageId };
  } catch (error) {
    // Log failed event
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

    return {
      success: false,
      error: errorMessage,
      retry_count: job.attemptsMade,
    };
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

function validateDltCompliance(
  recipient: string,
  metadata: Record<string, unknown>,
) {
  const isIndianNumber = recipient.startsWith("+91");
  const warnings: string[] = [];

  if (isIndianNumber) {
    if (!isNonEmptyString(metadata.dlt_template_id)) {
      warnings.push("missing dlt_template_id");
    }

    if (!isNonEmptyString(metadata.dlt_entity_id)) {
      warnings.push("missing dlt_entity_id");
    }

    if (!isNonEmptyString(metadata.sender_id)) {
      warnings.push("missing sender_id");
    } else if ((metadata.sender_id as string).length !== 6) {
      warnings.push("sender_id must be 6 characters");
    }
  }

  return {
    checked: isIndianNumber,
    compliant: !isIndianNumber || warnings.length === 0,
    warnings,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
