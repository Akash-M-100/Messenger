import { createRedisConnection, createQueueManager, BaseConsumer, type Channel, type MessageJobData, type JobResult } from "@ums/queue";
import { PrismaClient } from "@ums/db";
import type { Job } from "bullmq";
import { MockSMSProvider } from "./mock-provider.js";
import { TwilioSMSProvider } from "./twilio-provider.js";
import { processMessage } from "./processor.js";
import { startMetricsServer, metricsRegistry } from "./metrics.js";

const channel: Channel = "sms";
const providerName =
  process.env.TWILIO_ACCOUNT_SID ? "Twilio" : "Mock";
const prisma = new PrismaClient();
const redis = createRedisConnection({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

class SMSWorker extends BaseConsumer {
  private provider =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
      ? new TwilioSMSProvider(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN,
          process.env.TWILIO_PHONE_NUMBER,
        )
      : new MockSMSProvider();

  async processJob(job: Job<MessageJobData>): Promise<JobResult> {
    return processMessage(job, this.provider, prisma, providerName);
  }
}

async function start() {
  const queueManager = await createQueueManager(redis);
  const worker = new SMSWorker({
    connection: redis,
    channel,
    concurrency: 10,
    prisma,
    registry: metricsRegistry,
  });

  const metricsServer = startMetricsServer(
    parseInt(process.env.METRICS_PORT || "9101", 10),
  );
  console.log(`✓ SMS Worker started (${providerName})`);

  process.on("SIGTERM", async () => {
    console.log("🛑 Shutting down...");
    await worker.close();
    await queueManager.closeAll();
    await prisma.$disconnect();
    metricsServer.close();
    process.exit(0);
  });
}

start().catch(console.error);
