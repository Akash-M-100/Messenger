import { Queue } from "bullmq";
import { DLQ_NAMES, type Channel, type DLQJobData } from "./types.js";
import type { RedisInstance } from "./redis.js";
import { Counter, Registry, register } from "prom-client";

export interface DLQConfig {
  redis: RedisInstance;
  registry?: any; // prom-client Registry
}

export class DeadLetterQueue {
  private dlqs: Map<Channel, Queue<DLQJobData>> = new Map();
  private redis: RedisInstance;
  private dlqJobsTotal: Counter<string>;
  private dlqRetryTotal: Counter<string>;

  constructor(config: DLQConfig) {
    this.redis = config.redis;

    const reg = config.registry || register;

    // Check if metrics already exist in the registry to avoid re-registration errors
    const jobsMetricName = "dlq_jobs_total";
    const retryMetricName = "dlq_retry_total";

    const existingJobs = reg.getSingleMetric(jobsMetricName) as Counter<string>;
    this.dlqJobsTotal = existingJobs || new Counter({
      name: jobsMetricName,
      help: "Total jobs sent to Dead Letter Queue",
      labelNames: ["channel"] as const,
      registers: [reg],
    });

    const existingRetry = reg.getSingleMetric(retryMetricName) as Counter<string>;
    this.dlqRetryTotal = existingRetry || new Counter({
      name: retryMetricName,
      help: "Total DLQ retries initiated",
      labelNames: ["channel"] as const,
      registers: [reg],
    });

    this.initializeDLQs();
  }

  private initializeDLQs(): void {
    const channels: Channel[] = ["sms", "whatsapp", "email", "voice"];

    for (const channel of channels) {
      const dlq = new Queue<DLQJobData>(DLQ_NAMES[channel], {
        connection: this.redis,
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
        },
      });

      this.dlqs.set(channel, dlq);
    }
  }

  getDLQ(channel: Channel): Queue<DLQJobData> {
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
    jobData: {
      jobId: string;
      messageId: string;
      channel: Channel;
      error: string;
      attempts: number;
      timestamp: string;
      tenantId?: string;
      priority?: any;
      idempotencyKey?: string;
      correlationId?: string;
    },
  ): Promise<string> {
    const dlq = this.getDLQ(channel);

    const job = await dlq.add(
      `failed-${jobData.messageId}`,
      jobData,
      {
        jobId: `failed-${jobData.messageId}`,
      },
    );

    // Increment metrics
    this.dlqJobsTotal.inc({ channel });

    return job.id ?? `failed-${jobData.messageId}`;
  }

  /**
   * Increment retry metric
   */
  incrementRetryMetric(channel: Channel): void {
    this.dlqRetryTotal.inc({ channel });
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
  ): Promise<any[]> {
    const dlq = this.getDLQ(channel);
    // Query all states to make sure we don't miss jobs in 'waiting' state
    const jobs = await dlq.getJobs(
      ["waiting", "active", "completed", "failed", "delayed", "paused"],
      start,
      end,
    );
    return jobs.map((job) => {
      const { jobId, ...rest } = job.data;
      return {
        jobId: job.id ?? jobId,
        ...rest,
      };
    });
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
  registry?: any,
): Promise<DeadLetterQueue> {
  return new DeadLetterQueue({
    redis,
    registry,
  });
}
