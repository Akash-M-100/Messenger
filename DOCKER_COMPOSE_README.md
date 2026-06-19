# Docker Compose Production Setup

This directory contains production-ready Docker Compose configuration for the Unified Messaging Service on AWS EC2.

## 📋 Files Overview

### Core Files
- **`docker-compose.prod.yml`** - Production Docker Compose configuration
- **`.env.prod`** - Production environment template (copy to `.env`)
- **`deploy.sh`** - Automation script for common deployment tasks
- **`DEPLOYMENT_GUIDE.md`** - Comprehensive step-by-step deployment guide

### Dockerfiles
- **`apps/api-gateway/Dockerfile`** - API Gateway service container
- **`apps/admin-api/Dockerfile`** - Admin API service container
- **`apps/webhook-receiver/Dockerfile`** - Webhook Receiver service container
- **`apps/worker-email/Dockerfile`** - Email Worker service container
- **`apps/worker-sms/Dockerfile`** - SMS Worker service container
- **`apps/worker-voice/Dockerfile`** - Voice Worker service container
- **`apps/worker-whatsapp/Dockerfile`** - WhatsApp Worker service container

## 🏗️ Architecture Overview

```
                    ┌─────────────────────────────────┐
                    │       AWS EC2 Instance          │
                    │                                 │
    ┌───────────────┼─────────────────────────────────┼──────────────┐
    │               │                                 │              │
    ▼               ▼                                 ▼              ▼
 Clients        Database              Services                   Storage
                (PostgreSQL)      ┌──────────────────┐           (EBS)
                                  │   API Gateway    │
                                  │   (port 3000)    │
                                  └──────────────────┘
                                  ┌──────────────────┐
                    ┌─────────────►│   Admin API      │
                    │              │   (port 3001)    │
                    │              └──────────────────┘
                    │              ┌──────────────────┐
                    │              │Webhook Receiver  │
                    │              │   (port 3002)    │
                    │              └──────────────────┘
                    │
                  Redis        ┌──────────────────────────────────┐
                (Message Queue)│      Worker Services             │
                    │          │  ┌────────────────────────────┐  │
                    │          │  │ • worker-email (2 replicas)│  │
                    │          │  │ • worker-sms (2 replicas)  │  │
                    │          │  │ • worker-voice (1 replica) │  │
                    └─────────►│  │ • worker-whatsapp (2 reps) │  │
                               │  └────────────────────────────┘  │
                               └──────────────────────────────────┘
                                           │
                                           ▼
                                  Provider APIs
                                  • Twilio
                                  • Resend
```

## 🚀 Quick Start

### 1. Prerequisites Check
```bash
docker --version         # v20.10+
docker-compose --version # v2.0+
```

### 2. Prepare Environment
```bash
cp .env.prod .env
nano .env  # Edit with your values
```

### 3. Start Services
```bash
chmod +x deploy.sh
./deploy.sh start
```

### 4. Verify Health
```bash
./deploy.sh health
```

## 🐳 Docker Compose Services

### Database
**Service:** `postgres:16-alpine`
- **Container:** `ums-postgres`
- **Port:** 5432
- **Volume:** `postgres_data`
- **Health Check:** pg_isready
- **Restart:** always

### Cache & Queue
**Service:** `redis:7-alpine`
- **Container:** `ums-redis`
- **Port:** 6379
- **Volume:** `redis_data`
- **Health Check:** redis-cli ping
- **Restart:** always
- **Config:** Requirepass auth, 512MB max memory

### API Gateway
**Service:** Node.js + Fastify
- **Container:** `ums-api-gateway`
- **Port:** 3000 (customizable)
- **Health Check:** HTTP /health endpoint
- **Restart:** always
- **Resources:** 1 CPU, 512MB RAM
- **Dependencies:** postgres, redis

### Admin API
**Service:** Node.js + Fastify
- **Container:** `ums-admin-api`
- **Port:** 3001 (customizable)
- **Health Check:** HTTP /health endpoint
- **Restart:** always
- **Resources:** 0.5 CPU, 256MB RAM
- **Dependencies:** postgres, redis

### Webhook Receiver
**Service:** Node.js + Fastify
- **Container:** `ums-webhook-receiver`
- **Port:** 3002 (customizable)
- **Health Check:** HTTP /health endpoint
- **Restart:** always
- **Resources:** 0.5 CPU, 256MB RAM
- **Dependencies:** postgres, redis

### Workers
**Services:** worker-email, worker-sms, worker-voice, worker-whatsapp
- **Base Image:** Node.js Alpine
- **Resources:** 0.5 CPU, 256MB RAM (each)
- **Restart:** always
- **Dependencies:** postgres, redis
- **Scaling:** Configurable replicas via .env

## 🔐 Environment Variables

### Database
```bash
DB_USER=postgres              # PostgreSQL user
DB_PASSWORD=secure_password   # PostgreSQL password
DB_NAME=messaging_service     # Database name
DB_PORT=5432                  # PostgreSQL port
```

### Cache
```bash
REDIS_PASSWORD=secure_password # Redis auth password
REDIS_PORT=6379              # Redis port
```

### Services
```bash
API_GATEWAY_PORT=3000         # API Gateway HTTP port
ADMIN_API_PORT=3001           # Admin API HTTP port
WEBHOOK_PORT=3002             # Webhook Receiver port
LOG_LEVEL=info               # Application log level
```

### Providers
```bash
TWILIO_ACCOUNT_SID=xxx       # Twilio account ID
TWILIO_AUTH_TOKEN=xxx        # Twilio auth token
TWILIO_FROM_NUMBER=+1xxx     # SMS/Voice from number
TWILIO_WHATSAPP_FROM=xxx     # WhatsApp sender ID
RESEND_API_KEY=xxx           # Resend email API key
```

### Worker Scaling
```bash
EMAIL_WORKER_REPLICAS=2      # Email worker count
SMS_WORKER_REPLICAS=2        # SMS worker count
VOICE_WORKER_REPLICAS=1      # Voice worker count
WHATSAPP_WORKER_REPLICAS=2   # WhatsApp worker count
```

## 📊 Network Configuration

**Network Name:** `ums-network`
**Type:** Bridge network
**Driver:** bridge

Service communication (internal):
- `api-gateway:3000`
- `admin-api:3001`
- `webhook-receiver:3002`
- `postgres:5432`
- `redis:6379`

## 🏥 Health Checks

All services include health checks with:
- **Interval:** 10-15s
- **Timeout:** 5s
- **Retries:** 3-5
- **Start Period:** 30-45s

Health check status visible via:
```bash
./deploy.sh health
docker-compose -f docker-compose.prod.yml ps
```

## 📈 Logging

All services configured with:
- **Driver:** JSON-file
- **Max Size:** 10MB per file
- **Max Files:** 3 files (30MB total)

View logs:
```bash
./deploy.sh logs              # All services
./deploy.sh logs api-gateway  # Specific service
```

## 🔄 Restart Policies

All services use `restart: always`
- Service automatically restarts if it crashes
- Respects stop commands from docker-compose
- Doesn't restart on exit code 0

## 💾 Data Persistence

**Volumes:**
- `postgres_data` - PostgreSQL database files
- `redis_data` - Redis data persistence

**Backup:**
```bash
./deploy.sh backup  # Creates timestamped SQL dump
```

## 🎯 Performance Tuning

### Resource Limits
```yaml
deploy:
  resources:
    limits:
      cpus: "1"        # CPU cores
      memory: 512M     # RAM limit
```

### Database Optimization
- Shared buffers: 256MB
- Max connections: 200

### Redis Optimization
- Max memory: 512MB
- Eviction policy: allkeys-lru

## 🔧 Common Commands

```bash
# Start all services
./deploy.sh start

# Stop all services (graceful)
./deploy.sh stop

# Restart services
./deploy.sh restart

# Check service health
./deploy.sh health

# View logs
./deploy.sh logs
./deploy.sh logs api-gateway

# Show service status
./deploy.sh status

# Database backup
./deploy.sh backup

# View configuration
./deploy.sh config

# Complete cleanup (WARNING!)
./deploy.sh clean
```

## 🚨 Troubleshooting

### Services won't start
```bash
# Check logs
./deploy.sh logs

# Verify environment
./deploy.sh config

# Validate docker-compose
docker-compose -f docker-compose.prod.yml config
```

### Database connection failed
```bash
# Check database health
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -h postgres -c "SELECT 1;"
```

### Redis connection failed
```bash
# Check Redis health
docker-compose -f docker-compose.prod.yml logs redis

# Test connection
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli ping
```

### Out of disk space
```bash
# Check disk usage
df -h

# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune
```

## 🔐 Security Best Practices

✅ **Required:**
1. Generate strong passwords: `openssl rand -base64 32`
2. Never commit `.env` file to git
3. Store secrets in AWS Secrets Manager
4. Use VPC security groups to restrict access
5. Enable CloudTrail for audit logging

❌ **Avoid:**
1. Default or weak passwords
2. Exposing database to internet
3. Running services as root
4. Storing secrets in code
5. Disabling health checks

## 📚 Additional Resources

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Step-by-step guide
- [Docker Docs](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [AWS EC2 Best Practices](https://docs.aws.amazon.com/ec2/index.html)

## 💡 Next Steps

1. Copy `.env.prod` to `.env`
2. Fill in all required credentials
3. Run `./deploy.sh start`
4. Verify with `./deploy.sh health`
5. Set up monitoring and backups
6. Configure SSL/HTTPS reverse proxy
