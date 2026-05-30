import { Queue } from "bullmq";
import { DLQ_NAMES, type Channel, type MessageJobData } from "./types.js";
import type { RedisInstance } from "./redis.js";

export interface DLQConfig {
  redis: RedisInstance;
}

export class DeadLetterQueue {
  private dlqs: Map<Channel, Queue<MessageJobData>> = new Map();
  private redis: RedisInstance;

  constructor(config: DLQConfig) {
    this.redis = config.redis;
    this.initializeDLQs();
  }

  private initializeDLQs(): void {
    const channels: Channel[] = ["sms", "whatsapp", "email", "voice"];

    for (const channel of channels) {
      const dlq = new Queue<MessageJobData>(DLQ_NAMES[channel], {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
        },
      });

      this.dlqs.set(channel, dlq);
    }
  }

  getDLQ(channel: Channel): Queue<MessageJobData> {
    const dlq = this.dlqs.get(channel);
    if (!dlq) {
      throw new Error(`DLQ not found for channel: ${channel}`);
    }
    return dlq;
  }

  /**
   * Move a failed job to DLQ
   */
  async addToDeadLetterQueue(
    channel: Channel,
    jobData: MessageJobData,
    failureReason: string,
    failureCode?: string,
  ): Promise<string> {
    const dlq = this.getDLQ(channel);

    const jobDataWithMetadata = {
      ...jobData,
      failed_reason: failureReason,
      failed_code: failureCode,
      failed_at: new Date().toISOString(),
    };

    const job = await dlq.add(
      `failed-${jobData.message_id}`,
      jobDataWithMetadata as MessageJobData,
      {
        jobId: `failed-${jobData.message_id}`,
      },
    );

    return job.id ?? `failed-${jobData.message_id}`;
  }

  /**
   * Get DLQ job count for a channel
   */
  async getDLQCount(channel: Channel): Promise<number> {
    const dlq = this.getDLQ(channel);
    return dlq.count();
  }

  /**
   * Get all DLQ jobs for a channel
   */
  async getDLQJobs(
    channel: Channel,
    start: number = 0,
    end: number = -1,
  ): Promise<MessageJobData[]> {
    const dlq = this.getDLQ(channel);
    const jobs = await dlq.getJobs(["failed", "completed"], start, end);
    return jobs.map((job) => job.data);
  }

  /**
   * Clear DLQ for a channel
   */
  async clearDLQ(channel: Channel): Promise<number> {
    const dlq = this.getDLQ(channel);
    const cleaned = await dlq.clean(0, 0, "failed");
    return cleaned.length;
  }

  /**
   * Close all DLQs
   */
  async closeAll(): Promise<void> {
    for (const dlq of this.dlqs.values()) {
      await dlq.close();
    }
  }
}

export async function createDeadLetterQueue(
  redis: RedisInstance,
): Promise<DeadLetterQueue> {
  return new DeadLetterQueue({
    redis,
  });
}
