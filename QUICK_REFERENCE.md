# AWS EC2 Deployment Quick Reference

## 🚀 Initial Deployment (First Time)

```bash
# 1. SSH into EC2
ssh -i your-key.pem ec2-user@your-ec2-ip

# 2. Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo usermod -aG docker ec2-user

# 3. Clone & Setup
cd /opt && git clone <repo> messenger && cd messenger
chmod +x setup.sh deploy.sh
./setup.sh  # Interactive configuration

# 4. Deploy & Verify
./deploy.sh start
./deploy.sh health
```

---

## 📊 Daily Operations

### Start Services
```bash
./deploy.sh start
```

### Stop Services (Graceful)
```bash
./deploy.sh stop
```

### Restart Services
```bash
./deploy.sh restart
```

### Check Health
```bash
./deploy.sh health
```

### View Status
```bash
./deploy.sh status
docker stats  # Resource usage
```

### View Logs
```bash
./deploy.sh logs              # All services
./deploy.sh logs api-gateway  # Specific service
```

---

## 🔧 Maintenance

### Database Backup
```bash
./deploy.sh backup
aws s3 cp backups/backup_*.sql s3://your-bucket/
```

### Database Restore
```bash
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres -d messaging_service < backup_file.sql
```

### Scale Workers
```bash
# Edit .env
nano .env
# Change EMAIL_WORKER_REPLICAS=5, etc.

# Restart
./deploy.sh restart
```

### Update Configuration
```bash
nano .env
./deploy.sh restart
```

---

## 🚨 Troubleshooting

### Service Down
```bash
./deploy.sh logs <service-name>  # View error logs
./deploy.sh restart               # Restart services
docker ps -a                      # Check container status
```

### Database Issues
```bash
./deploy.sh logs postgres
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -h postgres -c "SELECT 1;"
```

### Redis Issues
```bash
./deploy.sh logs redis
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a $REDIS_PASSWORD ping
```

### Out of Disk Space
```bash
df -h                    # Check disk
docker system prune -a   # Clean up
docker volume prune      # Clean unused volumes
```

### Memory Issues
```bash
docker stats                                      # Monitor memory
# Reduce worker replicas in .env and restart
./deploy.sh restart
```

---

## 🔐 Security & Secrets

### Update Passwords
```bash
# Generate new password
openssl rand -base64 32

# Update in .env
nano .env

# Restart services
./deploy.sh restart
```

### View Configuration
```bash
./deploy.sh config
```

### Check Exposed Ports
```bash
sudo netstat -tuln | grep LISTEN
```

---

## 📈 Monitoring

### Real-time Metrics
```bash
docker stats
```

### Resource Limits
```bash
# View current limits
docker inspect <container-name> | grep -A 20 "Resources"

# Edit in docker-compose.prod.yml
nano docker-compose.prod.yml
# Update deploy.resources.limits
./deploy.sh restart
```

### API Health
```bash
curl http://localhost:3000/health        # API Gateway
curl http://localhost:3001/health        # Admin API
curl http://localhost:3002/health        # Webhook
```

### Database Health
```bash
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres -h postgres -c "\dt"  # List tables
```

---

## 🔄 Update Services

### Deploy New Version
```bash
git pull
docker-compose -f docker-compose.prod.yml build
./deploy.sh restart
```

### Rollback
```bash
git checkout <previous-commit>
docker-compose -f docker-compose.prod.yml build
./deploy.sh restart
```

---

## 🌐 SSL/HTTPS Setup

### Using Let's Encrypt
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
sudo nano /etc/nginx/conf.d/messenger.conf  # Update SSL paths
sudo systemctl restart nginx
```

### Check Certificate
```bash
sudo ls -la /etc/letsencrypt/live/your-domain.com/
```

---

## 📊 Worker Job Monitoring

### Check Job Queue
```bash
docker-compose -f docker-compose.prod.yml exec redis \
  redis-cli -a $REDIS_PASSWORD LLEN "bull:email-queue:jobs"
```

### Monitor Worker Logs
```bash
./deploy.sh logs worker-email
./deploy.sh logs worker-sms
./deploy.sh logs worker-voice
./deploy.sh logs worker-whatsapp
```

---

## 🔐 Access Management

### SSH Key Setup
```bash
# Copy key to EC2
chmod 600 your-key.pem
ssh -i your-key.pem ec2-user@your-ec2-ip
```

### Add SSH User
```bash
sudo useradd -G docker,sudo deployment-user
sudo passwd deployment-user
```

---

## 📋 Environment Variables

### Database
```
DB_USER=postgres
DB_PASSWORD=<secure-password>
DB_NAME=messaging_service
DB_PORT=5432
```

### Redis
```
REDIS_PASSWORD=<secure-password>
REDIS_PORT=6379
```

### Services
```
API_GATEWAY_PORT=3000
ADMIN_API_PORT=3001
WEBHOOK_PORT=3002
LOG_LEVEL=info
```

### Providers
```
TWILIO_ACCOUNT_SID=<your-sid>
TWILIO_AUTH_TOKEN=<your-token>
TWILIO_FROM_NUMBER=+1234567890
RESEND_API_KEY=<your-key>
```

---

## 📱 Service URLs

| Service | URL | Health |
|---------|-----|--------|
| API Gateway | http://localhost:3000 | /health |
| Admin API | http://localhost:3001 | /health |
| Webhook | http://localhost:3002 | /health |
| Database | localhost:5432 | - |
| Redis | localhost:6379 | PING |

---

## 🗂️ Important Files

```
messenger/
├── docker-compose.prod.yml      # Main config
├── .env                          # Configuration (KEEP SECRET)
├── .env.prod                     # Template
├── deploy.sh                     # Deployment script
├── setup.sh                      # Setup script
├── DEPLOYMENT_GUIDE.md           # Full guide
├── DOCKER_COMPOSE_README.md      # Technical docs
└── apps/
    ├── api-gateway/Dockerfile
    ├── admin-api/Dockerfile
    ├── webhook-receiver/Dockerfile
    └── worker-*/Dockerfile
```

---

## 🆘 Emergency Commands

### Emergency Stop (Force)
```bash
docker-compose -f docker-compose.prod.yml kill
```

### Emergency Start
```bash
./deploy.sh stop
sleep 10
./deploy.sh start
```

### Emergency Cleanup
```bash
docker-compose -f docker-compose.prod.yml down -v
# WARNING: This deletes all data!
```

### View All Containers
```bash
docker ps -a
docker logs <container-id>
```

---

## 📞 Support

**For help:**
1. Check logs: `./deploy.sh logs`
2. View status: `./deploy.sh status`
3. Review guide: `DEPLOYMENT_GUIDE.md`
4. Check health: `./deploy.sh health`

---

**Last Updated:** 2024
**Version:** 1.0
