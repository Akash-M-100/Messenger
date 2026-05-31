-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('ACCEPTED', 'SCHEDULED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('TEXT', 'PROMOTIONAL', 'TRANSACTIONAL', 'OTP');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_FAILED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('SMS', 'EMAIL', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'SUBMIT');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key_prefix" VARCHAR(16) NOT NULL,
    "key_hash" VARCHAR(128) NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "idempotency_key" VARCHAR(160),
    "external_id" VARCHAR(160),
    "channel" "MessageChannel" NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'ACCEPTED',
    "from_address" VARCHAR(320),
    "to_address" VARCHAR(320) NOT NULL,
    "subject" VARCHAR(998),
    "body" TEXT,
    "payload" JSONB,
    "metadata" JSONB,
    "error_code" VARCHAR(80),
    "error_message" TEXT,
    "scheduled_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "type" "TemplateType" NOT NULL DEFAULT 'TEXT',
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "content" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dlt_entity_id" VARCHAR(80),
    "dlt_template_id" VARCHAR(80),
    "approval_status" VARCHAR(80),
    "approval_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_events" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_type" "WebhookEventType" NOT NULL,
    "previous_status" "MessageStatus",
    "new_status" "MessageStatus" NOT NULL,
    "external_id" VARCHAR(160),
    "provider_name" VARCHAR(80) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "config" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "url" VARCHAR(1024) NOT NULL,
    "events" TEXT[] DEFAULT ARRAY['MESSAGE_SENT', 'MESSAGE_DELIVERED', 'MESSAGE_FAILED']::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secret" VARCHAR(256) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "action_type" "AuditActionType" NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(160) NOT NULL,
    "changes" JSONB,
    "metadata" JSONB,
    "admin_id" VARCHAR(160),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_created_at_idx" ON "tenants"("status", "created_at");

-- CreateIndex
CREATE INDEX "tenants_deleted_at_idx" ON "tenants"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_status_idx" ON "api_keys"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_created_at_idx" ON "api_keys"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_tenant_id_key_prefix_key" ON "api_keys"("tenant_id", "key_prefix");

-- CreateIndex
CREATE INDEX "messages_tenant_id_status_created_at_idx" ON "messages"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "messages_tenant_id_channel_status_idx" ON "messages"("tenant_id", "channel", "status");

-- CreateIndex
CREATE INDEX "messages_tenant_id_direction_created_at_idx" ON "messages"("tenant_id", "direction", "created_at");

-- CreateIndex
CREATE INDEX "messages_tenant_id_to_address_idx" ON "messages"("tenant_id", "to_address");

-- CreateIndex
CREATE INDEX "messages_scheduled_at_idx" ON "messages"("scheduled_at");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenant_id_idempotency_key_key" ON "messages"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenant_id_external_id_key" ON "messages"("tenant_id", "external_id");

-- CreateIndex
CREATE INDEX "templates_tenant_id_status_idx" ON "templates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "templates_tenant_id_channel_idx" ON "templates"("tenant_id", "channel");

-- CreateIndex
CREATE INDEX "templates_tenant_id_created_at_idx" ON "templates"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "templates_status_created_at_idx" ON "templates"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "templates_tenant_id_name_channel_key" ON "templates"("tenant_id", "name", "channel");

-- CreateIndex
CREATE INDEX "message_events_tenant_id_created_at_idx" ON "message_events"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "message_events_message_id_created_at_idx" ON "message_events"("message_id", "created_at");

-- CreateIndex
CREATE INDEX "message_events_event_type_created_at_idx" ON "message_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "provider_configs_tenant_id_type_idx" ON "provider_configs"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "provider_configs_tenant_id_is_active_idx" ON "provider_configs"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configs_tenant_id_type_name_key" ON "provider_configs"("tenant_id", "type", "name");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_tenant_id_active_idx" ON "webhook_subscriptions"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "webhook_subscriptions_created_at_idx" ON "webhook_subscriptions"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_type_created_at_idx" ON "audit_logs"("action_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_created_at_idx" ON "audit_logs"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_events" ADD CONSTRAINT "message_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
