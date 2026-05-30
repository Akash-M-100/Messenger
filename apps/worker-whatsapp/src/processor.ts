import { Job } from "bullmq";
import { PrismaClient } from "@ums/db";
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

    // Update to DISPATCHING
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "DISPATCHED" },
    });

    // Send via provider
    const result = await provider.send({
      channel: message.channel.toLowerCase() as any,
      recipient: {
        phone: message.toAddress,
        email: message.toAddress,
      },
      content: { body: message.body, subject: message.subject },
      metadata: message.metadata || {},
    });

    // Update to DELIVERED
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });

    return {
      success: true,
      provider_message_id: result.message_id,
    };
  } catch (error) {
    console.error("Error processing message:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.message.update({
      where: { id: job.data.message_id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage,
      },
    });

    return {
      success: false,
      error: errorMessage,
      retry_count: job.attemptsMade,
    };
  }
}
