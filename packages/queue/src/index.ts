// Re-export Redis setup
export { createRedisConnection, getRedisConfigFromEnv } from "./redis.js";
export type { RedisConfig } from "./redis.js";

// Re-export types
export type { Channel, Priority, MessageJobData, DLQJobData, JobResult } from "./types.js";
export {
  QUEUE_NAMES,
  DLQ_NAMES,
  RETRY_CONFIG,
  RETRY_DELAYS,
  PRIORITY_MAP,
} from "./types.js";

// Re-export Queue Manager
export { QueueManager, createQueueManager } from "./queues.js";
export type { QueueConfig } from "./queues.js";

// Re-export Producer
export { MessageProducer, createMessageProducer } from "./producer.js";
export type { ProducerConfig } from "./producer.js";

// Re-export Consumer
export { BaseConsumer, createConsumer } from "./consumer.js";
export type { ConsumerConfig } from "./consumer.js";

// Re-export DLQ
export { DeadLetterQueue, createDeadLetterQueue } from "./dlq.js";
