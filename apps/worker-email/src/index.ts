import { createRedisConnection, createQueueManager, BaseConsumer, type Channel, type MessageJobData, type JobResult } from "@ums/queue";
import { PrismaClient } from "@ums/db";
import type { Job } from "bullmq";
import { MockEmailProvider } from "./mock-provider.js";
import { ResendEmailProvider } from "./resend-provider.js";
import { processMessage } from "./processor.js";
import { startMetricsServer, metricsRegistry } from "./metrics.js";

const channel: Channel = "email";
const providerName =
  process.env.RESEND_API_KEY ? "Resend" : "Mock";
const prisma = new PrismaClient();
const redis = createRedisConnection({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

class EmailWorker extends BaseConsumer {
  private provider =
    process.env.RESEND_API_KEY
      ? new ResendEmailProvider(process.env.RESEND_API_KEY)
      : new MockEmailProvider();

  async processJob(job: Job<MessageJobData>): Promise<JobResult> {
    return processMessage(job, this.provider, prisma, providerName);
  }
}

async function start() {
  const queueManager = await createQueueManager(redis);
  const worker = new EmailWorker({
    connection: redis,
    channel,
    concurrency: 15,
    prisma,
    registry: metricsRegistry,
  });

  const metricsServer = startMetricsServer(
    parseInt(process.env.METRICS_PORT || "9102", 10),
  );
  console.log(`✓ Email Worker started (${providerName})`);

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
