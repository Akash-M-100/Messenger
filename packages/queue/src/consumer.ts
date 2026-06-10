import { Worker, type Job } from "bullmq";
import { QUEUE_NAMES, RETRY_DELAYS, type Channel, type MessageJobData, type JobResult } from "./types.js";
import type { RedisInstance } from "./redis.js";
import { DeadLetterQueue } from "./dlq.js";
import { QueueManager } from "./queues.js";
import { MessageProducer } from "./producer.js";

export interface ConsumerConfig {
  connection: RedisInstance;
  channel: Channel;
  concurrency?: number;
  removeOnComplete?: boolean;
  registry?: any; // prom-client Registry
  prisma?: any;   // PrismaClient
}

export abstract class BaseConsumer {
  protected worker: Worker<MessageJobData, JobResult>;
  protected channel: Channel;
  protected connection: RedisInstance;
  protected dlq: DeadLetterQueue;
  protected prisma?: any;

  constructor(config: ConsumerConfig) {
    this.channel = config.channel;
    this.connection = config.connection;
    this.prisma = config.prisma;

    this.dlq = new DeadLetterQueue({
      redis: config.connection,
      registry: config.registry,
    });

    this.worker = new Worker<MessageJobData, JobResult>(
      QUEUE_NAMES[config.channel],
      async (job) => {
        return this.processJob(job);
      },
      {
        connection: config.connection,
        concurrency: config.concurrency ?? 50,
        settings: {
          backoffStrategy(attemptsMade: number, type: string | undefined) {
            if (type === "customExponential") {
              const index = Math.min(attemptsMade - 1, RETRY_DELAYS.length - 1);
              return RETRY_DELAYS[index] ?? 60000;
            }
            return 1000;
          },
        },
      },
    );

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      this.onJobCompleted(job);
    });

    this.worker.on("failed", async (job, error) => {
      this.onJobFailed(job, error);
      if (job) {
        // If final failure, trigger fallback chain, then move to DLQ
        if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
          try {
            await this.handleFinalFailure(job, error);
          } catch (err) {
            console.error(`[${this.channel}] Error handling final failure for job ${job.id}:`, err);
          }
        }
      }
    });

    this.worker.on("error", (error) => {
      this.onWorkerError(error);
    });

    this.worker.on("stalled", (jobId) => {
      this.onJobStalled(jobId);
    });
  }

  /**
   * Process a job - must be implemented by subclasses
   */
  abstract processJob(job: Job<MessageJobData>): Promise<JobResult>;

  /**
   * Hook called when a job completes successfully
   */
  protected onJobCompleted(job: Job<MessageJobData>): void {
    console.log(`[${this.channel}] Job completed: ${job.id}`);
  }

  /**
   * Hook called when a job fails
   */
  protected onJobFailed(job: Job<MessageJobData> | undefined, error: Error): void {
    console.error(`[${this.channel}] Job failed:`, {
      jobId: job?.id,
      error: error.message,
      attempts: job?.attemptsMade,
    });
  }

  /**
   * Hook called on worker errors
   */
  protected onWorkerError(error: Error): void {
    console.error(`[${this.channel}] Worker error:`, error);
  }

  /**
   * Hook called when a job stalls
   */
  protected onJobStalled(jobId: string): void {
    console.warn(`[${this.channel}] Job stalled: ${jobId}`);
  }

  /**
   * Handle final failure - Fallback chain + DLQ
   */
  protected async handleFinalFailure(job: Job<MessageJobData>, error: Error): Promise<void> {
    if (!this.prisma) {
      console.warn(`[${this.channel}] Prisma client not configured on worker, moving directly to DLQ`);
      await this.moveToDLQ(job, error);
      return;
    }

    try {
      const message = await this.prisma.message.findUnique({
        where: { id: job.data.message_id },
      });

      if (!message) {
        console.warn(`[${this.channel}] Message ${job.data.message_id} not found in DB, moving to DLQ`);
        await this.moveToDLQ(job, error);
        return;
      }

      const metadata = (message.metadata || {}) as Record<string, any>;
      const isAlreadyFallback = metadata.fallback === true;

      let fallbackChannel: "SMS" | "WHATSAPP" | "EMAIL" | "VOICE" | null = null;
      if (!isAlreadyFallback) {
        if (message.channel === "SMS") {
          fallbackChannel = "WHATSAPP";
        } else if (message.channel === "WHATSAPP") {
          fallbackChannel = "SMS";
        } else if (message.channel === "VOICE") {
          fallbackChannel = "SMS";
        }
      }

      if (fallbackChannel) {
        console.log(`[${this.channel}] Final attempt failed. Triggering fallback to ${fallbackChannel} for message ${message.id}`);

        const updatedMetadata = {
          ...metadata,
          fallback: true,
          original_channel: message.channel,
          fallback_channel: fallbackChannel,
          fallback_reason: "max retries exhausted",
        };

        // Update database message with fallback info
        await this.prisma.message.update({
          where: { id: message.id },
          data: {
            channel: fallbackChannel,
            status: "QUEUED",
            metadata: updatedMetadata,
            errorMessage: null,
            failedAt: null,
          },
        });

        // Enqueue job to the fallback queue
        const queueManager = new QueueManager({ redis: this.connection });
        const producer = new MessageProducer({ queueManager });
        await producer.enqueueMessage(
          message.id,
          message.tenantId,
          fallbackChannel.toLowerCase() as Channel,
          job.data.priority || "normal",
          job.data.idempotency_key,
          job.data.correlation_id,
        );
        await queueManager.closeAll();
        return;
      }
    } catch (fallbackErr) {
      console.error(`[${this.channel}] Error processing fallback for message ${job.data.message_id}:`, fallbackErr);
    }

    // Move to DLQ if no fallback was matched or if fallback failed
    await this.moveToDLQ(job, error);
  }

  /**
   * Move job to Dead Letter Queue
   */
  private async moveToDLQ(job: Job<MessageJobData>, error: Error): Promise<void> {
    await this.dlq.addToDeadLetterQueue(this.channel, {
      jobId: job.id ?? `failed-${job.data.message_id}`,
      messageId: job.data.message_id,
      channel: this.channel,
      error: error.message,
      attempts: job.attemptsMade,
      timestamp: new Date().toISOString(),
      ...(job.data.tenant_id ? { tenantId: job.data.tenant_id } : {}),
      ...(job.data.priority ? { priority: job.data.priority } : {}),
      ...(job.data.idempotency_key ? { idempotencyKey: job.data.idempotency_key } : {}),
      ...(job.data.correlation_id ? { correlationId: job.data.correlation_id } : {}),
    });
  }

  /**
   * Get retry delay based on attempt number
   */
  protected getRetryDelay(attemptNumber: number): number {
    const delayIndex = Math.min(attemptNumber - 1, RETRY_DELAYS.length - 1);
    return RETRY_DELAYS[delayIndex] ?? 1 * 60 * 1000;
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.dlq.closeAll();
  }

  /**
   * Pause the worker
   */
  async pause(): Promise<void> {
    await this.worker.pause();
  }

  /**
   * Resume the worker
   */
  async resume(): Promise<void> {
    await this.worker.resume();
  }

  /**
   * Get worker stats
   */
  async getStats(): Promise<{
    paused: boolean;
    concurrency: number;
    channel: Channel;
  }> {
    const isPaused = await this.worker.isPaused();
    const concurrency = (this.worker.opts.concurrency ?? 50) as number;

    return {
      paused: isPaused,
      concurrency,
      channel: this.channel,
    };
  }
}

export async function createConsumer(
  config: ConsumerConfig,
  processJobFn: (job: Job<MessageJobData>) => Promise<JobResult>,
): Promise<Worker<MessageJobData, JobResult>> {
  const worker = new Worker<MessageJobData, JobResult>(
    QUEUE_NAMES[config.channel],
    processJobFn,
    {
      connection: config.connection,
      concurrency: config.concurrency ?? 50,
      settings: {
        backoffStrategy(attemptsMade: number, type: string | undefined) {
          if (type === "customExponential") {
            const index = Math.min(attemptsMade - 1, RETRY_DELAYS.length - 1);
            return RETRY_DELAYS[index] ?? 60000;
          }
          return 1000;
        },
      },
    },
  );

  return worker;
}
