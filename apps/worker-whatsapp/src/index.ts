import { createRedisConnection, createQueueManager, BaseConsumer, type Channel, type MessageJobData, type JobResult } from "@ums/queue";
import { PrismaClient } from "@ums/db";
import type { Job } from "bullmq";
import { MockWhatsAppProvider } from "./mock-provider.js";
import { TwilioWhatsAppProvider } from "./twilio-provider.js";
import { processMessage } from "./processor.js";

const channel: Channel = "whatsapp";
const prisma = new PrismaClient();
const redis = createRedisConnection({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD,
});

class WhatsAppWorker extends BaseConsumer {
  private provider =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER
      ? new TwilioWhatsAppProvider(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN,
          process.env.TWILIO_WHATSAPP_NUMBER,
        )
      : new MockWhatsAppProvider();

  async processJob(job: Job<MessageJobData>): Promise<JobResult> {
    return processMessage(job, this.provider, prisma);
  }
}

async function start() {
  const queueManager = await createQueueManager(redis);
  const worker = new WhatsAppWorker({
    connection: redis,
    channel,
    concurrency: 8,
  });

  const providerName =
    process.env.TWILIO_ACCOUNT_SID ? "Twilio" : "Mock";
  console.log(`✓ WhatsApp Worker started (${providerName})`);

  process.on("SIGTERM", async () => {
    console.log("🛑 Shutting down...");
    await worker.close();
    await queueManager.closeAll();
    await prisma.$disconnect();
    process.exit(0);
  });
}

start().catch(console.error);
