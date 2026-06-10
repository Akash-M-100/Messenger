# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./

# Copy app source
COPY apps/admin-api ./apps/admin-api
COPY packages ./packages

# Install dependencies
RUN npm install -g pnpm@9.15.4
RUN pnpm install --frozen-lockfile

# Build the application
RUN pnpm --filter @ums/admin-api build
RUN pnpm --filter @ums/db exec prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
RUN npm install -g pnpm@9.15.4

# Copy built app from builder
COPY --from=builder /app/apps/admin-api/dist ./dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:${PORT:-3001}/health || exit 1

EXPOSE ${PORT:-3001}

CMD ["node", "--env-file=../.env", "dist/index.js"]
