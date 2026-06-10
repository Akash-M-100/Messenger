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

    // Update to DISPATCHING
    await prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.DISPATCHED },
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
      metadata: (message.metadata ?? undefined) as Record<string, unknown>,
    });
    providerApiLatencySeconds.observe(
      { provider: providerName },
      elapsedSeconds(providerStartedAt),
    );

    // Update to DISPATCHED with provider message ID as externalId
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DISPATCHED,
        externalId: result.providerMessageId,
        sentAt: new Date(),
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
