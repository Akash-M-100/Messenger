import { Queue, QueueEvents } from "bullmq";
import type Redis from "ioredis";
import {
  QUEUE_NAMES,
  DLQ_NAMES,
  RETRY_DELAYS,
  PRIORITY_MAP,
  type Channel,
  type MessageJobData,
} from "./types.js";

export interface QueueConfig {
  redis: Redis;
  defaultJobOptions?: {
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
  };
}

export class QueueManager {
  private queues: Map<Channel, Queue<MessageJobData>> = new Map();
  private queueEvents: Map<Channel, QueueEvents> = new Map();
  private redis: Redis;

  constructor(config: QueueConfig) {
    this.redis = config.redis;
    this.initializeQueues();
  }

  private initializeQueues(): void {
    const channels: Channel[] = ["sms", "whatsapp", "email", "voice"];

    for (const channel of channels) {
      const queue = new Queue<MessageJobData>(QUEUE_NAMES[channel], {
        connection: this.redis,
        defaultJobOptions: {
          attempts: RETRY_DELAYS.length,
          backoff: {
            type: "fixed" as const,
            delay: RETRY_DELAYS[0] ?? 60000,
          },
          removeOnComplete: {
            age: 3600, // Keep completed jobs for 1 hour
          },
          removeOnFail: false, // Keep failed jobs for debugging
        },
      });

      this.queues.set(channel, queue);

      // Setup queue events listener
      const queueEvents = new QueueEvents(QUEUE_NAMES[channel], {
        connection: this.redis,
      });
      this.queueEvents.set(channel, queueEvents);
    }
  }

  getQueue(channel: Channel): Queue<MessageJobData> {
    const queue = this.queues.get(channel);
    if (!queue) {
      throw new Error(`Queue not found for channel: ${channel}`);
    }
    return queue;
  }

  getQueueEvents(channel: Channel): QueueEvents {
    const events = this.queueEvents.get(channel);
    if (!events) {
      throw new Error(`Queue events not found for channel: ${channel}`);
    }
    return events;
  }

  getAllQueues(): Map<Channel, Queue<MessageJobData>> {
    return this.queues;
  }

  async closeAll(): Promise<void> {
    // Close all queue events
    for (const events of this.queueEvents.values()) {
      await events.close();
    }

    // Close all queues
    for (const queue of this.queues.values()) {
      await queue.close();
    }
  }
}

export async function createQueueManager(
  redis: Redis,
): Promise<QueueManager> {
  return new QueueManager({
    redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}
