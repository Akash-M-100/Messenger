import { DbClient, MessageChannel, Template } from "@ums/db";
import {
  CreateTemplateInput,
  UpdateTemplateInput,
  SubmitTemplateInput,
} from "../schemas/templates.js";
import { PaginatedResponse, PaginationParams } from "../schemas/pagination.js";

const VALID_MESSAGE_CHANNELS = ["SMS", "EMAIL", "WHATSAPP", "VOICE"] as const satisfies readonly MessageChannel[];

function isMessageChannel(channel: string): channel is MessageChannel {
  return (VALID_MESSAGE_CHANNELS as readonly string[]).includes(channel);
}

function assertMessageChannel(channel: string): asserts channel is MessageChannel {
  if (!isMessageChannel(channel)) {
    throw new Error(`Unsupported template channel: ${channel}`);
  }
}

export class TemplateService {
  constructor(private db: DbClient) {}

  async createTemplate(tenantId: string, input: CreateTemplateInput): Promise<Template> {
    assertMessageChannel(input.channel);

    return this.db.template.create({
      data: {
        tenantId,
        name: input.name,
        channel: input.channel,
        type: input.type,
        body: input.content,
        content: input.content,
        variables: input.variables,
        metadata: input.metadata ?? {},
        status: "DRAFT",
      },
    });
  }

  async getTemplates(
    tenantId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResponse<Template>> {
    const [templates, total] = await Promise.all([
      this.db.template.findMany({
        where: { tenantId },
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: {
          [pagination.sortBy]: pagination.sortOrder,
        },
      }),
      this.db.template.count({ where: { tenantId } }),
    ]);

    const pages = Math.ceil(total / pagination.limit);

    return {
      data: templates,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages,
      },
    };
  }

  async getTemplateById(tenantId: string, id: string): Promise<Template | null> {
    return this.db.template.findUnique({
      where: { id, tenantId },
    });
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    input: UpdateTemplateInput
  ): Promise<Template> {
    const updateData: Record<string, any> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.variables !== undefined) updateData.variables = input.variables;
    if (input.metadata !== undefined) updateData.metadata = input.metadata;

    return this.db.template.update({
      where: { id, tenantId },
      data: updateData,
    });
  }

  async deleteTemplate(tenantId: string, id: string): Promise<Template> {
    return this.db.template.update({
      where: { id, tenantId },
      data: { status: "ARCHIVED" },
    });
  }

  async submitTemplate(
    tenantId: string,
    id: string,
    input: SubmitTemplateInput
  ): Promise<Template> {
    const updateData: Record<string, any> = { status: "SUBMITTED" };
    if (input.dltEntityId !== undefined) updateData.dltEntityId = input.dltEntityId;

    return this.db.template.update({
      where: { id, tenantId },
      data: updateData,
    });
  }
}
