# Production Deployment Guide - AWS EC2

## Overview
This guide provides step-by-step instructions for deploying the Unified Messaging Service to AWS EC2 using Docker Compose.

## Prerequisites

### AWS EC2 Instance Requirements
- **Instance Type**: t3.medium or larger (recommended: t3.large for production)
- **Storage**: 50 GB+ EBS volume
- **Network**: Security group allowing:
  - Port 22 (SSH)
  - Port 80 (HTTP)
  - Port 443 (HTTPS)
  - Port 3000-3002 (Application ports)
  - Outbound to external providers (Twilio, Resend, etc.)

### Prerequisites on EC2 Instance
```bash
# Update system
sudo yum update -y
# or
sudo apt-get update -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add ec2-user to docker group (optional, for easier management)
sudo usermod -aG docker ec2-user

# Verify installation
docker --version
docker-compose --version
```

## Deployment Steps

### 1. Clone Repository
```bash
cd /opt
sudo git clone <your-repo-url> messenger
sudo chown -R ec2-user:ec2-user messenger
cd messenger
```

### 2. Configure Environment
```bash
# Copy the production environment template
cp .env.prod .env

# Edit with your actual values
nano .env
```

**Critical Environment Variables:**
```bash
# Database
DB_PASSWORD=<generate-secure-password>

# Redis
REDIS_PASSWORD=<generate-secure-password>

# Third-party APIs
RESEND_API_KEY=<your-resend-key>
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-token>
TWILIO_FROM_NUMBER=<your-twilio-number>
```

### 3. Build Docker Images
```bash
# Build all images
docker-compose -f docker-compose.prod.yml build

# Or build specific services
docker-compose -f docker-compose.prod.yml build api-gateway
```

### 4. Start Services
```bash
# Start all services in the background
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker-compose -f docker-compose.prod.yml logs -f api-gateway
```

### 5. Initialize Database
```bash
# Run Prisma migrations
docker-compose -f docker-compose.prod.yml exec api-gateway \
  npx prisma db push

# Verify database connection
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -d messaging_service -c "SELECT version();"
```

### 6. Health Checks
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# Check API Gateway
curl http://localhost:3000/health

# Check Admin API
curl http://localhost:3001/health

# Check Webhook Receiver
curl http://localhost:3002/health

# Check Redis
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a $REDIS_PASSWORD ping
```

## Monitoring & Management

### View Service Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service (last 100 lines)
docker-compose -f docker-compose.prod.yml logs --tail=100 api-gateway

# Follow logs in real-time
docker-compose -f docker-compose.prod.yml logs -f worker-email
```

### Scale Workers
```bash
# Edit docker-compose.prod.yml and change worker replicas
nano docker-compose.prod.yml

# Restart services
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

### Backup Database
```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres messaging_service > backup_$(date +%Y%m%d_%H%M%S).sql

# Store in S3
aws s3 cp backup_*.sql s3://your-bucket/backups/
```

### Stop Services
```bash
# Graceful shutdown
docker-compose -f docker-compose.prod.yml down

# Stop without removing volumes
docker-compose -f docker-compose.prod.yml stop

# Remove everything (⚠️ includes data)
docker-compose -f docker-compose.prod.yml down -v
```

## SSL/HTTPS with Nginx Reverse Proxy

### Install Nginx
```bash
sudo yum install -y nginx
# or
sudo apt-get install -y nginx
```

### Configure Nginx
```bash
sudo tee /etc/nginx/conf.d/messenger.conf > /dev/null <<EOF
upstream api_gateway {
    server localhost:3000;
}

upstream admin_api {
    server localhost:3001;
}

upstream webhook_receiver {
    server localhost:3002;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://api_gateway;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /admin {
        proxy_pass http://admin_api;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /webhooks {
        proxy_pass http://webhook_receiver;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
```

### Enable SSL with Let's Encrypt
```bash
sudo yum install -y certbot python3-certbot-nginx
# or
sudo apt-get install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --nginx -d your-domain.com

# Restart Nginx
sudo systemctl restart nginx
```

## Troubleshooting

### Services Not Starting
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs

# Verify configuration
docker-compose -f docker-compose.prod.yml config

# Check volume mounts
docker volume ls
docker volume inspect ums-postgres_data
```

### Database Connection Issues
```bash
# Test connection
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -h postgres -d messaging_service -c "SELECT 1;"

# Check environment variables
docker-compose -f docker-compose.prod.yml exec api-gateway env | grep DATABASE
```

### Redis Connection Issues
```bash
# Test Redis
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a your_password ping

# Check Redis memory
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a your_password info memory
```

### Memory/Resource Issues
```bash
# Monitor resource usage
docker stats

# Adjust resource limits in docker-compose.prod.yml
# Under deploy.resources.limits
```

## Production Best Practices

✅ **Do:**
- Use strong passwords (generate with `openssl rand -base64 32`)
- Enable automatic backups
- Use a dedicated subnet for database
- Set up monitoring (CloudWatch, Datadog, etc.)
- Use AWS RDS for database instead of Docker container for production
- Use AWS ElastiCache for Redis
- Enable application logs aggregation (CloudWatch Logs, ELK, etc.)
- Set up auto-scaling based on metrics
- Use separate EC2 instances for different service types
- Implement rate limiting and DDoS protection

❌ **Don't:**
- Hardcode secrets in docker-compose file
- Use default passwords
- Expose database to the internet
- Run both database and workers on same instance with limited resources
- Forget to set `restart: always` on critical services
- Skip health checks
- Run as root user in containers

## Scaling Considerations

### Horizontal Scaling (Multiple EC2 Instances)
1. Use load balancer (AWS ALB/NLB)
2. Deploy API services on separate instances
3. Deploy workers on dedicated instances
4. Use managed RDS and ElastiCache

### Vertical Scaling (Larger Instance)
1. Increase EC2 instance type
2. Increase volume sizes
3. Adjust container resource limits

### Worker Scaling
```bash
# In .env file, adjust worker replicas
EMAIL_WORKER_REPLICAS=5
SMS_WORKER_REPLICAS=5
VOICE_WORKER_REPLICAS=3
WHATSAPP_WORKER_REPLICAS=5
```

## Security Hardening

### Enable EC2 Security Group Rules
```bash
# Allow SSH from your IP only
# Allow HTTP/HTTPS from ALB
# Deny direct database access
# Allow outbound to provider APIs
```

### Rotate Secrets Regularly
```bash
# Update .env
nano .env

# Restart services
docker-compose -f docker-compose.prod.yml restart
```

### Monitor Logs
```bash
# Ship logs to CloudWatch
docker-compose -f docker-compose.prod.yml logs | \
  aws logs put-log-events --log-group-name /ums/production
```

## Next Steps
- Set up auto-scaling groups
- Configure CloudWatch alarms
- Set up backup strategy
- Implement CI/CD pipeline
- Configure monitoring and alerting
- Plan disaster recovery procedures
