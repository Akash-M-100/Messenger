@echo off
echo Starting Unified Messaging Service...

echo Starting Docker...
docker-compose up -d

echo Waiting for Docker to be ready...
timeout /t 10 /noisy

echo Running database migration...
call pnpm --filter @ums/db exec prisma db push

echo Starting all services...
start "API Gateway" cmd /k "pnpm --filter @ums/api-gateway dev"
start "Admin API" cmd /k "pnpm --filter @ums/admin-api dev"
start "Webhook Receiver" cmd /k "pnpm --filter @ums/webhook-receiver dev"
start "Worker SMS" cmd /k "pnpm --filter @ums/worker-sms dev"
start "Worker Email" cmd /k "pnpm --filter @ums/worker-email dev"
start "Worker WhatsApp" cmd /k "pnpm --filter @ums/worker-whatsapp dev"
start "Worker Voice" cmd /k "pnpm --filter @ums/worker-voice dev"

echo All services started!
echo.
echo API Gateway:      http://localhost:3000
echo Admin API:        http://localhost:3001
echo Webhook Receiver: http://localhost:3002
echo Health Check:     http://localhost:3000/healthz
echo Metrics:          http://localhost:3000/metrics
echo.
echo Waiting for services to be ready...
timeout /t 15 /noisy

echo.
echo ========================================
echo  UNIFIED MESSAGING SERVICE IS READY!
echo ========================================
echo.
echo To send SMS:
echo curl -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" -d "{\"channel\":\"SMS\",\"to\":\"+91XXXXXXXXXX\",\"body\":\"Hello!\"}"
echo.
echo To send Email:
echo curl -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -H "X-API-Key: YOUR_KEY" -d "{\"channel\":\"EMAIL\",\"to\":\"your@email.com\",\"body\":\"Hello!\",\"subject\":\"Test\"}"
echo.
pause