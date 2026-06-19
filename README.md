# 📨 Unified Messaging Service (UMS)

A production-ready, scalable messaging platform for sending emails, SMS, voice, and WhatsApp messages at scale. Built with TypeScript, Node.js, and a microservices architecture.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Local Development](#local-development)
- [Project Structure](#project-structure)
- [AWS EC2 Deployment](#aws-ec2-deployment)
- [Technology Stack](#technology-stack)
- [Contributing](#contributing)
- [Team](#team)
- [License](#license)

---

## 🎯 Overview

The **Unified Messaging Service** is a comprehensive messaging platform that enables applications to send transactional and marketing messages across multiple channels (Email, SMS, Voice, WhatsApp) through a single, unified API.

**Key Capabilities:**
- 📧 Email messaging (via Resend)
- 💬 SMS messaging (via Twilio)
- 🎙️ Voice calls (via Twilio)
- 📱 WhatsApp messaging (via Twilio)
- 🏢 Multi-tenant architecture with API key authentication
- 📊 Message tracking and audit logs
- 🔄 Retry logic and dead-letter queues
- 📈 Built-in metrics and monitoring

---

## ✨ Features

### Core Features
- ✅ **Multi-channel Messaging** - Send messages via Email, SMS, Voice, WhatsApp from a single API
- ✅ **API Key Authentication** - Secure per-tenant API key management
- ✅ **Message Templates** - Create reusable message templates with variables
- ✅ **Message Queuing** - BullMQ-based job queue for reliable message processing
- ✅ **Message Status Tracking** - Real-time message status updates (QUEUED → DISPATCHED → DELIVERED/FAILED)
- ✅ **Webhook Support** - Send delivery callbacks to your application
- ✅ **Audit Logging** - Complete audit trail of all operations
- ✅ **Provider Integration** - Support for multiple providers per channel
- ✅ **DLT Compliance** - SMS DLT compliance for Indian numbers
- ✅ **24-Hour Window Validation** - WhatsApp 24-hour session window enforcement

### Platform Features
- ✅ **Monorepo Structure** - Organized with pnpm workspaces and Turbo
- ✅ **TypeScript** - Full type safety across the codebase
- ✅ **Fastify** - High-performance HTTP framework
- ✅ **Prisma** - Type-safe database ORM
- ✅ **Redis** - Distributed caching and job queue
- ✅ **PostgreSQL** - Reliable relational database
- ✅ **Docker** - Containerized deployment ready
- ✅ **Metrics** - Prometheus metrics for monitoring

---

## 🏗️ Architecture

### System Architecture Diagram

```
                        ┌──────────────────────────────────────┐
                        │     External Providers               │
                        │  ┌──────────────────────────────┐    │
                        │  │ Twilio (SMS/Voice/WhatsApp) │    │
                        │  │ Resend (Email)              │    │
                        │  └──────────────────────────────┘    │
                        └──────────┬───────────────────────────┘
                                   ▲
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
        ┌─────────────────────┐      ┌─────────────────────┐
        │   Worker Services   │      │   Worker Services   │
        │  ┌───────────────┐  │      │  ┌───────────────┐  │
        │  │ Email Worker  │  │      │  │ SMS Worker    │  │
        │  └───────────────┘  │      │  └───────────────┘  │
        │  ┌───────────────┐  │      │  ┌───────────────┐  │
        │  │ Voice Worker  │  │      │  │ WhatsApp      │  │
        │  │               │  │      │  │ Worker        │  │
        │  └───────────────┘  │      │  └───────────────┘  │
        └─────────────────────┘      └─────────────────────┘
                    ▲                             ▲
                    │                             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Job Queue (Redis)  │
                    │  BullMQ             │
                    │  ├─ email:queue     │
                    │  ├─ sms:queue       │
                    │  ├─ voice:queue     │
                    │  └─ whatsapp:queue  │
                    └──────────┬──────────┘
                               ▲
                    ┌──────────┴──────────────┐
                    │                         │
        ┌──────────▼────────────┐  ┌─────────▼──────────┐
        │   API Gateway         │  │   Webhook Receiver │
        │  (Fastify, 3000)      │  │  (Fastify, 3002)   │
        │  ├─ /health           │  │  ├─ /health        │
        │  ├─ /v1/messages      │  │  └─ /webhooks      │
        │  └─ /metrics          │  └────────────────────┘
        └──────────┬────────────┘
                   │
        ┌──────────┴──────────────┐
        │                         │
   ┌────▼──────┐           ┌─────▼────────┐
   │  Clients  │           │  Admin API   │
   │  (SDK/API)│           │  (Fastify,   │
   │           │           │   3001)      │
   └───────────┘           └──────────────┘
        │                         │
        │                         │
        └──────────┬──────────────┘
                   │
        ┌──────────▼──────────────┐
        │   PostgreSQL Database   │
        │  ├─ Tenants             │
        │  ├─ API Keys            │
        │  ├─ Messages            │
        │  ├─ Templates           │
        │  ├─ Audit Logs          │
        │  └─ Webhooks            │
        └─────────────────────────┘
```

### Service Overview

| Service | Purpose | Port | Technology |
|---------|---------|------|-----------|
| **API Gateway** | Client-facing REST API for sending messages | 3000 | Fastify, Node.js |
| **Admin API** | Admin operations (tenants, keys, audit logs) | 3001 | Fastify, Node.js |
| **Webhook Receiver** | Receives and handles provider webhooks | 3002 | Fastify, Node.js |
| **Worker: Email** | Processes email messages | Queue | Node.js, BullMQ |
| **Worker: SMS** | Processes SMS messages with DLT compliance | Queue | Node.js, BullMQ |
| **Worker: Voice** | Processes voice calls | Queue | Node.js, BullMQ |
| **Worker: WhatsApp** | Processes WhatsApp messages with 24h window | Queue | Node.js, BullMQ |
| **PostgreSQL** | Primary database | 5432 | PostgreSQL 16 |
| **Redis** | Job queue & caching | 6379 | Redis 7 |

### Data Flow

```
1. Client sends message via API
   POST /v1/messages
   │
2. API Gateway validates request
   ├─ Verify API key
   ├─ Validate message schema
   ├─ Check rate limits
   │
3. Message stored in database
   INSERT INTO messages
   status = QUEUED
   │
4. Message enqueued
   → Redis Queue (BullMQ)
   │
5. Worker processes message
   ├─ Load message from DB
   ├─ Send via provider
   ├─ Update status
   │
6. Webhook callback (optional)
   → Webhook Receiver
   → Client application
   │
7. Delivery/failure recorded
   UPDATE messages
   status = DELIVERED/FAILED
```

---

## 📦 Prerequisites

### System Requirements
- **Node.js**: v20.0 or higher
- **pnpm**: v9.15.4 or higher
- **PostgreSQL**: v14 or higher
- **Redis**: v7 or higher
- **Docker**: v20.10+ (for containerized deployment)
- **Git**: Latest version

### Development Dependencies
```bash
# Verify installations
node --version      # v20.0+
pnpm --version      # v9.15.4+
psql --version      # 14.0+
redis-cli --version # 7.0+
docker --version    # 20.10+
```

### Required Environment Variables (Local Development)
```bash
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/messaging_service"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=""

# API
HOST=0.0.0.0
PORT=3000
LOG_LEVEL=debug

# Providers (optional for development)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_FROM_NUMBER=""
RESEND_API_KEY=""
```

---

## 💻 Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-org/messenger.git
cd messenger
```

### Step 2: Install Dependencies
```bash
# Install pnpm if not already installed
npm install -g pnpm@9.15.4

# Install project dependencies
pnpm install

# Verify installation
pnpm --version
```

### Step 3: Setup Database
```bash
# Create .env file from template
cp .env.example .env

# Update DATABASE_URL in .env
nano .env  # Edit with your database credentials

# Run Prisma migrations
pnpm --filter @ums/db exec prisma db push
```

### Step 4: Build the Project
```bash
# Build all packages
pnpm build

# Type check
pnpm typecheck
```

### Step 5: Start Development Server
```bash
# Start API Gateway
pnpm dev

# Or watch all packages
pnpm dev:watch
```

---

## 🔧 Environment Variables

### Database Configuration

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/messaging_service` |

### Redis Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_HOST` | Redis server hostname | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password | `` (empty) |
| `REDIS_DB` | Redis database number | `0` |

### Application Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server binding address | `0.0.0.0` |
| `PORT` | Server listening port | `3000` |
| `LOG_LEVEL` | Logging level (fatal, error, warn, info, debug, trace, silent) | `info` |
| `NODE_ENV` | Environment (development, production) | `development` |

### Provider Configuration

#### Twilio (SMS, Voice, WhatsApp)
```bash
TWILIO_ACCOUNT_SID=your_account_sid          # Twilio account ID
TWILIO_AUTH_TOKEN=your_auth_token            # Twilio auth token
TWILIO_FROM_NUMBER=+1234567890               # SMS/Voice sender number
TWILIO_WHATSAPP_FROM=whatsapp:+1234567890    # WhatsApp sender ID
```

#### Resend (Email)
```bash
RESEND_API_KEY=your_resend_api_key           # Resend API key for email delivery
```

### Production Configuration

For production deployment, see [AWS EC2 Deployment](#aws-ec2-deployment) section.

Complete production environment template: [.env.prod](.env.prod)

---

## 🔌 API Endpoints

### Base URL
```
http://localhost:3000
```

### Authentication
All API endpoints (except `/health`) require authentication via API key:

```bash
# Header-based authentication
curl -H "X-API-Key: your_api_key" \
  http://localhost:3000/v1/messages

# Bearer token authentication
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/v1/messages
```

### Core Endpoints

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

### Messages API

#### Create Message
```http
POST /v1/messages
X-API-Key: your_api_key
Content-Type: application/json
Idempotency-Key: unique-request-id (optional)

{
  "channel": "SMS",
  "toAddress": "+1234567890",
  "subject": "Message Subject",
  "body": "Message body content",
  "fromAddress": "sender@example.com",
  "metadata": {
    "custom_field": "custom_value"
  }
}
```

**Response (202 Accepted):**
```json
{
  "data": {
    "id": "msg_1234567890",
    "channel": "SMS",
    "toAddress": "+1234567890",
    "status": "QUEUED",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**Request Schema:**
- `channel` (required) - `SMS`, `EMAIL`, `WHATSAPP`, or `VOICE`
- `toAddress` (required) - Recipient phone number or email
- `body` (required) - Message body content
- `subject` (optional) - Message subject (for email)
- `fromAddress` (optional) - Sender address
- `metadata` (optional) - Custom metadata object
- `scheduledAt` (optional) - ISO 8601 timestamp for scheduled delivery

---

#### List Messages
```http
GET /v1/messages
X-API-Key: your_api_key
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "msg_1234567890",
      "channel": "SMS",
      "toAddress": "+1234567890",
      "status": "DELIVERED",
      "createdAt": "2024-01-15T10:30:00Z",
      "deliveredAt": "2024-01-15T10:31:00Z"
    }
  ]
}
```

---

#### Get Message Details
```http
GET /v1/messages/{messageId}
X-API-Key: your_api_key
```

**Response (200 OK):**
```json
{
  "data": {
    "id": "msg_1234567890",
    "channel": "SMS",
    "toAddress": "+1234567890",
    "status": "DELIVERED",
    "externalId": "twilio_message_id",
    "sentAt": "2024-01-15T10:30:30Z",
    "deliveredAt": "2024-01-15T10:31:00Z",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

#### Cancel Message
```http
DELETE /v1/messages/{messageId}
X-API-Key: your_api_key
```

**Response (204 No Content)**

---

### Error Responses

**400 Bad Request**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid message request",
  "details": [
    {
      "code": "too_small",
      "path": ["body"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

**401 Unauthorized**
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Missing API key"
}
```

**403 Forbidden**
```json
{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "Invalid or revoked API key"
}
```

**429 Too Many Requests**
```json
{
  "statusCode": 429,
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```

---

## 🚀 Local Development

### Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd messenger
pnpm install

# 2. Setup environment
cp .env.example .env
nano .env  # Configure database credentials

# 3. Setup database
pnpm --filter @ums/db exec prisma db push

# 4. Start development server
pnpm dev

# 5. Test API
curl -X POST http://localhost:3000/v1/messages \
  -H "X-API-Key: test-key" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "SMS",
    "toAddress": "+1234567890",
    "body": "Hello World"
  }'
```

### Development Commands

```bash
# Build all packages
pnpm build

# Type checking
pnpm typecheck

# Development with watch mode
pnpm dev:watch

# Start specific service
pnpm --filter @ums/api-gateway dev

# Run tests
pnpm test
pnpm test:integration

# Clean all build artifacts
pnpm clean

# View help
pnpm --help
```

### Database Management

```bash
# Push schema changes
pnpm --filter @ums/db exec prisma db push

# Generate client
pnpm --filter @ums/db exec prisma generate

# Open Prisma Studio
pnpm --filter @ums/db exec prisma studio

# Create migration
pnpm --filter @ums/db exec prisma migrate dev --name migration_name

# Reset database (WARNING: deletes data)
pnpm --filter @ums/db exec prisma db push --skip-generate --force-skip
```

### Debugging

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm dev

# Attach Node debugger
node --inspect-brk ./apps/api-gateway/dist/index.js

# View service logs
docker-compose logs -f api-gateway
```

---

## 📁 Project Structure

```
messenger/
├── apps/                          # Application services
│   ├── api-gateway/              # Main API server (port 3000)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── schemas/
│   │   │   ├── server/
│   │   │   ├── services/
│   │   │   └── utils/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── admin-api/                # Admin operations (port 3001)
│   │   └── [similar structure]
│   │
│   ├── webhook-receiver/         # Provider webhooks (port 3002)
│   │   └── [similar structure]
│   │
│   ├── worker-email/             # Email processing worker
│   │   └── [similar structure]
│   │
│   ├── worker-sms/               # SMS processing worker
│   │   └── [similar structure]
│   │
│   ├── worker-voice/             # Voice call worker
│   │   └── [similar structure]
│   │
│   └── worker-whatsapp/          # WhatsApp processing worker
│       └── [similar structure]
│
├── packages/                      # Shared packages
│   ├── core/                     # Core interfaces & utilities
│   │   ├── src/
│   │   │   ├── errors/
│   │   │   ├── interfaces/
│   │   │   └── utils/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                       # Database & Prisma
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── queue/                    # Job queue & Redis
│       ├── src/
│       │   ├── consumer.ts
│       │   ├── producer.ts
│       │   ├── queues.ts
│       │   ├── redis.ts
│       │   └── types.ts
│       ├── package.json
│       └── tsconfig.json
│
├── docker-compose.yml            # Development compose
├── docker-compose.prod.yml       # Production compose
├── package.json                  # Root package
├── pnpm-lock.yaml               # Dependency lock file
├── pnpm-workspace.yaml          # Workspace configuration
├── tsconfig.json                # TypeScript config
├── turbo.json                   # Turbo build config
├── .env.example                 # Environment template
├── .env.prod                    # Production template
├── .gitignore
├── .dockerignore
├── README.md                    # This file
├── DEPLOYMENT_GUIDE.md          # Production deployment
├── DOCKER_COMPOSE_README.md     # Docker Compose docs
├── QUICK_REFERENCE.md           # Operations quick ref
└── LICENSE
```

---

## 🐳 AWS EC2 Deployment

### Overview
The project includes complete Docker Compose configuration for production deployment on AWS EC2.

### Quick Deployment

```bash
# 1. SSH into EC2 instance
ssh -i your-key.pem ec2-user@your-ec2-ip

# 2. Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 3. Clone repository
cd /opt && git clone <your-repo> messenger && cd messenger

# 4. Configure environment
chmod +x setup.sh
./setup.sh  # Interactive configuration

# 5. Deploy
chmod +x deploy.sh
./deploy.sh start

# 6. Verify deployment
./deploy.sh health
```

### Deployment Requirements

- **EC2 Instance Type**: t3.medium or larger (recommended: t3.large)
- **Storage**: 50GB+ EBS volume
- **Network**: 
  - Inbound: Ports 22 (SSH), 80 (HTTP), 443 (HTTPS)
  - Outbound: Internet access for provider APIs
- **Security Group**: Configured to allow above ports

### Services Deployed

- PostgreSQL 16 (database)
- Redis 7 (cache/queue)
- API Gateway (port 3000)
- Admin API (port 3001)
- Webhook Receiver (port 3002)
- Worker Email (2 replicas)
- Worker SMS (2 replicas)
- Worker Voice (1 replica)
- Worker WhatsApp (2 replicas)

### Configuration

1. **Create .env file** from `.env.prod` template
2. **Set required variables**:
   - `DB_PASSWORD` - PostgreSQL password
   - `REDIS_PASSWORD` - Redis password
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, etc.
   - `RESEND_API_KEY`
3. **Run setup script** for interactive configuration
4. **Deploy with deploy.sh script**

### Scaling

Scale workers by updating `.env`:
```bash
EMAIL_WORKER_REPLICAS=5
SMS_WORKER_REPLICAS=5
VOICE_WORKER_REPLICAS=3
WHATSAPP_WORKER_REPLICAS=5
```

Then restart: `./deploy.sh restart`

### Management

```bash
./deploy.sh start       # Start all services
./deploy.sh stop        # Stop all services
./deploy.sh restart     # Restart all services
./deploy.sh logs        # View logs
./deploy.sh health      # Check health
./deploy.sh backup      # Backup database
./deploy.sh status      # Show status
```

### SSL/HTTPS Setup

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate from Let's Encrypt
sudo certbot certonly --nginx -d your-domain.com

# Update Nginx config with SSL paths
# See DEPLOYMENT_GUIDE.md for full Nginx setup
```

### Monitoring & Support

- **Logs**: `./deploy.sh logs [service]`
- **Health**: `./deploy.sh health`
- **Database**: `./deploy.sh backup`
- **Docs**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **Quick Ref**: See [QUICK_REFERENCE.md](QUICK_REFERENCE.md)

---

## 🔨 Technology Stack

### Languages & Runtime
- **TypeScript** (5.7+) - Type-safe programming language
- **Node.js** (20+) - JavaScript runtime

### Frameworks & Libraries
- **Fastify** (5.3+) - High-performance web framework
- **Prisma** (5.0+) - Type-safe database ORM
- **BullMQ** (5.14+) - Job queue system
- **Zod** (3.25+) - Schema validation library

### Databases & Caching
- **PostgreSQL** (16) - Relational database
- **Redis** (7) - In-memory cache and job queue

### DevOps & Deployment
- **Docker** (20.10+) - Container runtime
- **Docker Compose** (2.0+) - Container orchestration
- **pnpm** (9.15.4) - Package manager
- **Turbo** (2.3+) - Build system

### Monitoring & Logging
- **Prometheus** (via prom-client) - Metrics collection
- **JSON logging** - Structured logging

### External Providers
- **Twilio** - SMS, Voice, WhatsApp
- **Resend** - Email delivery

---

## 👥 Contributing

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and type checking
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation
- Run `pnpm typecheck` before committing
- Use conventional commits

### Code Style
- Configured with Prettier and ESLint
- Run `pnpm format` to auto-format
- Run `pnpm lint` to check styles

---

## 👨‍💼 Team

### Core Team
- **Manideep** - Lead Developer & Architect

### Contributors
- [Add team members here]

### Support
- 📧 Email: [support email]
- 💬 Discord: [Discord server]
- 📝 Issues: [GitHub Issues](https://github.com/your-org/messenger/issues)

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🔗 Additional Resources

### Documentation
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Comprehensive deployment instructions
- [Docker Compose Guide](DOCKER_COMPOSE_README.md) - Docker Compose reference
- [Quick Reference](QUICK_REFERENCE.md) - Common commands and operations
- [File Index](FILE_INDEX.md) - Complete file structure index

### External Links
- [Fastify Documentation](https://www.fastify.io/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Twilio API Reference](https://www.twilio.com/docs/)
- [Resend Documentation](https://resend.com/docs)
- [Docker Documentation](https://docs.docker.com/)

### Tools
- [Postman Collection](./postman-collection.json) - API testing collection
- [Docker Compose](docker-compose.yml) - Local development setup
- [Docker Compose Production](docker-compose.prod.yml) - Production setup

---

## 🎯 Roadmap

### Current Version (v0.1.0)
- [x] Multi-channel messaging
- [x] API key authentication
- [x] Message tracking
- [x] Worker services
- [x] Docker deployment

### Planned Features
- [ ] Message templates with variables
- [ ] Advanced webhook filtering
- [ ] Rate limiting per API key
- [ ] Custom provider support
- [ ] Analytics dashboard
- [ ] Web UI for management
- [ ] GraphQL API
- [ ] Batch message API

---

## 📞 Support & Issues

### Getting Help
1. Check [QUICK_REFERENCE.md](QUICK_REFERENCE.md) for common operations
2. Review [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for deployment issues
3. Search existing [GitHub Issues](https://github.com/your-org/messenger/issues)
4. Ask on [Discord](https://discord.gg/your-server) or email

### Reporting Issues
- Create a [GitHub Issue](https://github.com/your-org/messenger/issues/new)
- Include error logs and environment details
- Provide steps to reproduce

---

## 🙏 Acknowledgments

- [Twilio](https://www.twilio.com/) - SMS, Voice, WhatsApp provider
- [Resend](https://resend.com) - Email delivery provider
- [Fastify](https://www.fastify.io/) - Web framework
- [Prisma](https://www.prisma.io/) - Database ORM
- [BullMQ](https://docs.bullmq.io/) - Job queue

---

**Made with ❤️ by the UMS Team**

Last Updated: 2024 | Version: 0.1.0 | [License: MIT](LICENSE)
