import crypto from "crypto";
import { DbClient, ApiKey } from "@ums/db";
import { CreateApiKeyInput } from "../schemas/api-keys.js";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

export interface GeneratedApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: Date;
}

export class ApiKeyService {
  constructor(private db: DbClient) {}

  async generateApiKey(
    tenantId: string,
    input: CreateApiKeyInput
  ): Promise<GeneratedApiKey> {
    const keyPrefix = "key_";
    const randomPart = crypto.randomBytes(24).toString("hex");
    const plainKey = `${keyPrefix}${randomPart}`;

    const keyHash = crypto.createHash("sha256").update(plainKey).digest("hex");

    const expiresAt = input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null;

    const apiKey = await this.db.apiKey.create({
      data: {
        tenantId,
        name: input.name,
        keyPrefix,
        keyHash,
        scopes: input.scopes,
        expiresAt,
        lastUsedAt: null,
      },
    });

    return {
      id: apiKey.id,
      key: plainKey,
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    };
  }

  async getApiKeys(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<ApiKey>> {
    const [keys, total] = await Promise.all([
      this.db.apiKey.findMany({
        where: { tenantId, revokedAt: null },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.apiKey.count({ where: { tenantId, revokedAt: null } }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: keys,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }

  async revokeApiKey(tenantId: string, keyId: string): Promise<ApiKey> {
    return this.db.apiKey.update({
      where: { id: keyId, tenantId },
      data: { revokedAt: new Date() },
    });
  }
}
