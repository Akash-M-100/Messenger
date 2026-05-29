import { createHash, timingSafeEqual } from "node:crypto";

import {
  ApiKeyStatus,
  type DbClient,
  TenantStatus,
} from "@ums/db";

import { ForbiddenError, UnauthorizedError } from "../middleware/errors.js";

export interface AuthContext {
  tenantId: string;
  apiKeyId: string;
}

export interface ApiKeyService {
  verifyApiKey(apiKey: string): Promise<AuthContext>;
}

export interface ApiKeyServiceDependencies {
  db: DbClient;
}

export function createApiKeyService(
  dependencies: ApiKeyServiceDependencies,
): ApiKeyService {
  return {
    async verifyApiKey(apiKey) {
      const keyHash = hashApiKey(apiKey);
      const record = await dependencies.db.apiKey.findUnique({
        where: {
          keyHash,
        },
        include: {
          tenant: true,
        },
      });

      if (!record || !safeEquals(record.keyHash, keyHash)) {
        throw new UnauthorizedError("Invalid API key");
      }

      const now = new Date();
      if (
        record.status !== ApiKeyStatus.ACTIVE ||
        record.revokedAt ||
        (record.expiresAt && record.expiresAt <= now)
      ) {
        throw new UnauthorizedError("Inactive API key");
      }

      if (record.tenant.status !== TenantStatus.ACTIVE || record.tenant.deletedAt) {
        throw new ForbiddenError("Tenant is not active");
      }

      await dependencies.db.apiKey.update({
        where: {
          id: record.id,
        },
        data: {
          lastUsedAt: now,
        },
      });

      return {
        tenantId: record.tenantId,
        apiKeyId: record.id,
      };
    },
  };
}

function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
