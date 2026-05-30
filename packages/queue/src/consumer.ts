import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { QUEUE_NAMES, RETRY_DELAYS, type Channel, type MessageJobData, type JobResult } from "./types.js";

export interface ConsumerConfig {
  connection: Redis;
  channel: Channel;
  concurrency?: number;
  removeOnComplete?: boolean;
}

export abstract class BaseConsumer {
  protected worker: Worker<MessageJobData, JobResult>;
  protected channel: Channel;
  protected connection: Redis;

  constructor(config: ConsumerConfig) {
    this.channel = config.channel;
    this.connection = config.connection;

    this.worker = new Worker<MessageJobData, JobResult>(
      QUEUE_NAMES[config.channel],
      async (job) => {
        return this.processJob(job);
      },
      {
        connection: config.connection,
        concurrency: config.concurrency ?? 50,
      },
    );

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      this.onJobCompleted(job);
    });

    this.worker.on("failed", (job, error) => {
      this.onJobFailed(job, error);
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
   * Get retry delay based on attempt number
   */
  protected getRetryDelay(attemptNumber: number): number {
    const delayIndex = Math.min(attemptNumber - 1, RETRY_DELAYS.length - 1);
    return RETRY_DELAYS[delayIndex];
  }

  /**
   * Close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
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
    const concurrency = this.worker.opts.concurrency ?? 50;

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
    },
  );

  return worker;
}
