import type { FastifyPluginAsync } from "fastify";

import type { DbClient } from "@ums/db";
import type { RedisInstance } from "@ums/core";
import { QueueManager } from "@ums/queue";

import {
  createApiKeyService,
  type ApiKeyService,
} from "../services/api-key-service.js";
import {
  createMessageService,
  type MessageService,
} from "../services/message-service.js";

export interface AppServices {
  apiKeys: ApiKeyService;
  messages: MessageService;
}

export interface ServicesPluginOptions {
  db: DbClient;
  redis: RedisInstance;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

export const registerServicesPlugin: FastifyPluginAsync<
  ServicesPluginOptions
> = async (server, options) => {
  const apiKeys = createApiKeyService({
    db: options.db,
  });

  const queueManager = new QueueManager({
    redis: options.redis,
  });

  const messages = createMessageService({
    db: options.db,
    redis: options.redis,
    queueManager,
  });

  server.decorate("services", {
    apiKeys,
    messages,
  });
};
