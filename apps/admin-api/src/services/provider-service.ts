import { DbClient, ProviderConfig } from "@ums/db";
import {
  CreateProviderConfigInput,
  UpdateProviderConfigInput,
} from "../schemas/providers.js";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

export class ProviderService {
  constructor(private db: DbClient) {}

  async createProviderConfig(
    tenantId: string,
    input: CreateProviderConfigInput
  ): Promise<ProviderConfig> {
    const existing = await this.db.providerConfig.findFirst({
      where: {
        tenantId,
        type: input.type,
        name: input.name,
      },
    });

    if (existing) {
      throw new Error("Provider config with this name and type already exists");
    }

    return this.db.providerConfig.create({
      data: {
        tenantId,
        type: input.type,
        name: input.name,
        config: input.config,
        metadata: input.metadata ?? {},
        isActive: true,
      },
    });
  }

  async getProviderConfigs(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<ProviderConfig>> {
    const [configs, total] = await Promise.all([
      this.db.providerConfig.findMany({
        where: { tenantId },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.providerConfig.count({ where: { tenantId } }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: configs,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }

  async getProviderConfigById(tenantId: string, id: string): Promise<ProviderConfig | null> {
    return this.db.providerConfig.findUnique({
      where: { id, tenantId },
    });
  }

  async updateProviderConfig(
    tenantId: string,
    id: string,
    input: UpdateProviderConfigInput
  ): Promise<ProviderConfig> {
    const updateData: Record<string, any> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.config !== undefined) updateData.config = input.config;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    return this.db.providerConfig.update({
      where: { id, tenantId },
      data: updateData,
    });
  }

  async deleteProviderConfig(tenantId: string, id: string): Promise<ProviderConfig> {
    return this.db.providerConfig.delete({
      where: { id, tenantId },
    });
  }
}
