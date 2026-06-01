import { DbClient, Tenant } from "@ums/db";
import { CreateTenantInput, UpdateTenantInput } from "../schemas/tenants.js";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

export class TenantService {
  constructor(private db: DbClient) {}

  async createTenant(input: CreateTenantInput): Promise<Tenant> {
    const existingTenant = await this.db.tenant.findUnique({
      where: { slug: input.slug },
    });

    if (existingTenant) {
      throw new Error("Tenant with this slug already exists");
    }

    return this.db.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        metadata: input.metadata ?? {},
      },
    });
  }

  async getTenants(pagination: PaginationParams): Promise<PaginatedResponse<Tenant>> {
    const [tenants, total] = await Promise.all([
      this.db.tenant.findMany({
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.tenant.count(),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: tenants,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }

  async getTenantById(id: string): Promise<Tenant | null> {
    return this.db.tenant.findUnique({
      where: { id },
    });
  }

  async updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
    const updateData: Record<string, any> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    return this.db.tenant.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteTenant(id: string): Promise<Tenant> {
    return this.db.tenant.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
