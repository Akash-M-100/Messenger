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
echo curl -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -H "X-API-Key: key_a11d2ebc33189b80f9d093e4c7752e67059da69cfa60487f" -d "{\"channel\":\"SMS\",\"to\":\"+918328239315\",\"body\":\"Hello from Messenger!\"}"
echo.
echo To send Email:
echo curl -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -H "X-API-Key: key_a11d2ebc33189b80f9d093e4c7752e67059da69cfa60487f" -d "{\"channel\":\"EMAIL\",\"to\":\"kohith25@gmail.com\",\"body\":\"Hello from Messenger!\",\"subject\":\"Test Email\"}"
echo.
echo To send WhatsApp:
echo curl -X POST http://localhost:3000/v1/messages -H "Content-Type: application/json" -H "X-API-Key: key_a11d2ebc33189b80f9d093e4c7752e67059da69cfa60487f" -d "{\"channel\":\"WHATSAPP\",\"to\":\"+918328239315\",\"body\":\"Hello from Messenger via WhatsApp!\"}"
echo.
pause
