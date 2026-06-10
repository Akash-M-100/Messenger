import { PRIORITY_MAP, RETRY_DELAYS, type Channel, type MessageJobData, type Priority } from "./types.js";
import { QueueManager } from "./queues.js";

export interface ProducerConfig {
  queueManager: QueueManager;
}

export class MessageProducer {
  private queueManager: QueueManager;

  constructor(config: ProducerConfig) {
    this.queueManager = config.queueManager;
  }

  async enqueueMessage(
    messageId: string,
    tenantId: string,
    channel: Channel,
    priority: Priority = "normal",
    idempotencyKey?: string,
    correlationId?: string,
  ): Promise<string> {
    const queue = this.queueManager.getQueue(channel);

    const jobData: MessageJobData = {
      message_id: messageId,
      tenant_id: tenantId,
      channel,
      priority,
      created_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
      correlation_id: correlationId,
    };

    const job = await queue.add(
      `message-${messageId}`,
      jobData,
      {
        attempts: 3,
        backoff: {
          type: "customExponential",
        },
        priority: PRIORITY_MAP[priority],
        jobId: messageId, // Use message ID as job ID for deduplication
        removeOnComplete: {
          count: 100,
        },
        removeOnFail: {
          count: 500,
        },
      },
    );

    return job.id ?? messageId;
  }

  async enqueueBulkMessages(
    messages: Array<{
      messageId: string;
      tenantId: string;
      channel: Channel;
      priority?: Priority;
      idempotencyKey?: string;
      correlationId?: string;
    }>,
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const msg of messages) {
      const jobId = await this.enqueueMessage(
        msg.messageId,
        msg.tenantId,
        msg.channel,
        msg.priority ?? "normal",
        msg.idempotencyKey,
        msg.correlationId,
      );
      jobIds.push(jobId);
    }

    return jobIds;
  }
}

export async function createMessageProducer(
  queueManager: QueueManager,
): Promise<MessageProducer> {
  return new MessageProducer({
    queueManager,
  });
}
