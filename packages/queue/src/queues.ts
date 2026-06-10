import { Queue, QueueEvents } from "bullmq";
import {
  QUEUE_NAMES,
  DLQ_NAMES,
  RETRY_DELAYS,
  PRIORITY_MAP,
  type Channel,
  type MessageJobData,
} from "./types.js";
import type { RedisInstance } from "./redis.js";

export interface QueueConfig {
  redis: RedisInstance;
  defaultJobOptions?: {
    removeOnComplete?: boolean;
    removeOnFail?: boolean;
  };
}

export class QueueManager {
  private queues: Map<Channel, Queue<MessageJobData>> = new Map();
  private queueEvents: Map<Channel, QueueEvents> = new Map();
  private redis: RedisInstance;

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
          attempts: 3,
          backoff: {
            type: "customExponential",
          },
          removeOnComplete: {
            count: 100,
          },
          removeOnFail: {
            count: 500,
          },
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
  redis: RedisInstance,
): Promise<QueueManager> {
  return new QueueManager({
    redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}
