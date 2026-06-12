# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY apps/worker-whatsapp ./apps/worker-whatsapp
COPY packages ./packages

RUN npm install -g pnpm@9.15.4
RUN pnpm install --frozen-lockfile

RUN pnpm --filter @ums/worker-whatsapp build
RUN pnpm --filter @ums/db exec prisma generate

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app ./

CMD ["node", "apps/worker-whatsapp/dist/index.js"]
