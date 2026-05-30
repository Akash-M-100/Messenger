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

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        tenantId: message.tenantId,
        eventType: "DISPATCHED",
        metadata: {},
      },
    });

    // Send via provider
    const result = await provider.send({
      channel: message.channel,
      recipient: {
        phone: message.toAddress,
        email: message.toAddress,
      },
      content: { body: message.body, subject: message.subject },
      metadata: message.metadata,
    });

    // Update to DELIVERED
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: message.id,
        tenantId: message.tenantId,
        eventType: "DELIVERED",
        metadata: { providerMessageId: result.providerMessageId },
      },
    });

    return { success: true, provider_message_id: result.providerMessageId };
  } catch (error) {
    // Log failed event
    await prisma.message.update({
      where: { id: job.data.message_id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        errorMessage: (error as Error).message,
      },
    });

    await prisma.messageEvent.create({
      data: {
        messageId: job.data.message_id,
        tenantId: job.data.tenant_id,
        eventType: "FAILED",
        metadata: { error: (error as Error).message },
      },
    });

    throw error;
  }
}
