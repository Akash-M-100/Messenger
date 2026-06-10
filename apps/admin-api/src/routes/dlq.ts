import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { createDeadLetterQueue, createQueueManager, QueueManager, MessageProducer, type Channel } from "@ums/queue";
import { paginationSchema } from "../schemas/pagination.js";

export async function registerDlqRoutes(server: FastifyInstance) {
  // GET /v1/dlq endpoint to view failed jobs
  server.get(
    "/v1/dlq",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as Record<string, any>;
        const pagination = paginationSchema.parse(query);
        const channel = query.channel as Channel | undefined;

        const dlq = (server as any).dlq || await createDeadLetterQueue((server as any).redis);

        let allJobs: any[] = [];

        if (channel) {
          if (!["sms", "whatsapp", "email", "voice"].includes(channel)) {
            return reply.code(400).send({
              error: "Bad Request",
              message: "Invalid channel",
            });
          }
          allJobs = await dlq.getDLQJobs(channel);
        } else {
          // Fetch from all queues
          const channels: Channel[] = ["sms", "whatsapp", "email", "voice"];
          const jobsPromises = channels.map((ch) => dlq.getDLQJobs(ch));
          const results = await Promise.all(jobsPromises);
          allJobs = results.flat();
        }

        // Sort allJobs by timestamp descending
        allJobs.sort((a, b) => {
          const timeA = new Date(a.timestamp || a.failed_at || 0).getTime();
          const timeB = new Date(b.timestamp || b.failed_at || 0).getTime();
          return timeB - timeA;
        });

        // Filter by tenantId if request context has one
        const tenantId = (request as any).tenantId;
        if (tenantId) {
          allJobs = allJobs.filter((job) => job.tenantId === tenantId || job.tenant_id === tenantId);
        }

        // Paginate manually
        const total = allJobs.length;
        const page = pagination.page;
        const limit = pagination.limit;
        const pages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const paginatedJobs = allJobs.slice(startIndex, startIndex + limit);

        return reply.send({
          data: paginatedJobs,
          pagination: {
            page,
            limit,
            total,
            pages,
          },
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return reply.code(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        throw error;
      }
    }
  );

  // POST /v1/dlq/:jobId/retry endpoint to retry a failed job
  server.post(
    "/v1/dlq/:jobId/retry",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, any>;
      const jobId = params.jobId;
      if (!jobId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Job ID is required",
        });
      }

      const dlq = (server as any).dlq || await createDeadLetterQueue((server as any).redis);

      // Find job in all DLQs
      let job: any = null;
      let foundChannel: Channel | null = null;

      const channels: Channel[] = ["sms", "whatsapp", "email", "voice"];
      for (const ch of channels) {
        const dlqQueue = dlq.getDLQ(ch);
        const j = await dlqQueue.getJob(jobId);
        if (j) {
          job = j;
          foundChannel = ch;
          break;
        }
      }

      if (!job || !foundChannel) {
        return reply.code(404).send({
          error: "Not Found",
          message: `Job ${jobId} not found in Dead Letter Queue`,
        });
      }

      // Enqueue job data back to primary queue
      const messageId = job.data.messageId || job.data.message_id;
      const tenantId = job.data.tenantId || job.data.tenant_id;
      const priority = job.data.priority || "normal";
      const idempotencyKey = job.data.idempotencyKey || job.data.idempotency_key;
      const correlationId = job.data.correlationId || job.data.correlation_id;

      if (!messageId || !tenantId) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "DLQ job data is missing messageId or tenantId",
        });
      }

      // If x-tenant-id was passed, verify it matches
      const requestTenantId = (request as any).tenantId;
      if (requestTenantId && requestTenantId !== tenantId) {
        return reply.code(403).send({
          error: "Forbidden",
          message: "Unauthorized access to this tenant's DLQ job",
        });
      }

      // Update database message status back to QUEUED
      await (server as any).db.message.update({
        where: { id: messageId },
        data: {
          status: "QUEUED",
          errorMessage: null,
          failedAt: null,
        },
      });

      // Re-enqueue
      const queueManager = new QueueManager({ redis: (server as any).redis });
      const producer = new MessageProducer({ queueManager });
      await producer.enqueueMessage(
        messageId,
        tenantId,
        foundChannel,
        priority,
        idempotencyKey,
        correlationId
      );
      await queueManager.closeAll();

      // Increment DLQ retry counter
      dlq.incrementRetryMetric(foundChannel);

      // Remove from DLQ
      await job.remove();

      return reply.send({
        success: true,
        message: `Job ${jobId} re-enqueued for channel ${foundChannel}`,
      });
    }
  );
}
