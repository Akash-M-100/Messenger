import { Job } from "bullmq";
import { PrismaClient, MessageStatus } from "@ums/db";
import type { MessageJobData, JobResult } from "@ums/queue";
import type { IChannelProvider } from "@ums/core";

export async function processMessage(
  job: Job<MessageJobData>,
  provider: IChannelProvider,
  prisma: PrismaClient,
): Promise<JobResult> {
  try {
    // Load message
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: job.data.message_id },
    });

    // Send via provider
    const content: Record<string, string> = {};
    if (message.subject) content.subject = message.subject;
    if (message.body) content.body = message.body;
    
    const result = await provider.send({
      channel: message.channel.toLowerCase() as any,
      recipient: {
        phone: message.toAddress,
        email: message.toAddress,
      },
      content,
      metadata: (message.metadata ?? undefined) as Record<string, unknown>,
    });

    // Update to DISPATCHED with provider message ID as externalId
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.DISPATCHED,
        externalId: result.providerMessageId,
        sentAt: new Date(),
      },
    });

    return {
      success: true,
      provider_message_id: result.providerMessageId,
    };
  } catch (error) {
    console.error("Error processing message:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

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
  }
}
