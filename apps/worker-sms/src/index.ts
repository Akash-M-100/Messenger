import { createRedisConnection, createQueueManager, BaseConsumer, type Channel, type MessageJobData, type JobResult } from "@ums/queue";
import { PrismaClient } from "@ums/db";
import type { Job } from "bullmq";
import { MockSMSProvider } from "./mock-provider.js";
import { processMessage } from "./processor.js";

const channel: Channel = "sms";
const prisma = new PrismaClient();
const redis = createRedisConnection({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

class SMSWorker extends BaseConsumer {
  private provider = new MockSMSProvider();

  async processJob(job: Job<MessageJobData>): Promise<JobResult> {
    return processMessage(job, this.provider, prisma);
  }
}

async function start() {
  const queueManager = await createQueueManager(redis);
  const worker = new SMSWorker({
    connection: redis,
    channel,
    concurrency: 10,
  });

  console.log("✓ SMS Worker started");

  process.on("SIGTERM", async () => {
    console.log("🛑 Shutting down...");
    await worker.close();
    await queueManager.closeAll();
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch(console.error);
