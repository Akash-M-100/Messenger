#!/bin/bash

##############################################################################
# Pre-Deployment Checklist and Setup Helper
# Usage: ./setup.sh
##############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

##############################################################################
# Main Setup
##############################################################################

main() {
    clear
    
    echo -e "${BLUE}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║   Unified Messaging Service - AWS EC2 Setup Helper           ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    print_header "Pre-Deployment Checklist"
    
    checklist_items=(
        "AWS EC2 instance running (t3.medium or larger)"
        "Security group configured (ports 22, 80, 443, 3000-3002)"
        "Docker installed and running"
        "Docker Compose installed (v2.0+)"
        "50GB+ disk space available"
        "Network connectivity to provider APIs"
    )
    
    for item in "${checklist_items[@]}"; do
        echo "  ☐ $item"
    done
    
    read -p "Have all prerequisites been met? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        print_error "Please complete all prerequisites before continuing"
        exit 1
    fi
    
    print_header "Configuration Setup"
    
    # Check if .env exists
    if [ -f ".env" ]; then
        print_warning ".env file already exists"
        read -p "Do you want to reconfigure? (yes/no): " reconfigure
        if [ "$reconfigure" != "yes" ]; then
            print_info "Using existing .env configuration"
            exit 0
        fi
    fi
    
    # Create .env from template
    if [ ! -f ".env.prod" ]; then
        print_error ".env.prod template not found"
        exit 1
    fi
    
    cp .env.prod .env
    print_success ".env file created"
    
    print_header "Environment Configuration"
    
    # Generate secure passwords
    print_info "Generating secure passwords..."
    DB_PASS=$(generate_password)
    REDIS_PASS=$(generate_password)
    print_success "Passwords generated"
    
    # Update .env with generated passwords
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASS/" .env
        sed -i '' "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASS/" .env
    else
        # Linux
        sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=$DB_PASS/" .env
        sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=$REDIS_PASS/" .env
    fi
    
    print_success "Database password configured"
    print_success "Redis password configured"
    
    print_header "Third-Party Provider Configuration"
    
    echo -e "\n${YELLOW}Please enter your provider credentials:${NC}"
    
    read -p "Twilio Account SID: " TWILIO_SID
    if [ -n "$TWILIO_SID" ]; then
        sed -i "s/TWILIO_ACCOUNT_SID=.*/TWILIO_ACCOUNT_SID=$TWILIO_SID/" .env
        print_success "Twilio Account SID configured"
    fi
    
    read -p "Twilio Auth Token: " TWILIO_TOKEN
    if [ -n "$TWILIO_TOKEN" ]; then
        sed -i "s/TWILIO_AUTH_TOKEN=.*/TWILIO_AUTH_TOKEN=$TWILIO_TOKEN/" .env
        print_success "Twilio Auth Token configured"
    fi
    
    read -p "Twilio SMS From Number (e.g., +1234567890): " TWILIO_NUMBER
    if [ -n "$TWILIO_NUMBER" ]; then
        sed -i "s|TWILIO_FROM_NUMBER=.*|TWILIO_FROM_NUMBER=$TWILIO_NUMBER|" .env
        print_success "Twilio SMS Number configured"
    fi
    
    read -p "Twilio WhatsApp From (e.g., whatsapp:+1234567890): " WHATSAPP_FROM
    if [ -n "$WHATSAPP_FROM" ]; then
        sed -i "s|TWILIO_WHATSAPP_FROM=.*|TWILIO_WHATSAPP_FROM=$WHATSAPP_FROM|" .env
        print_success "Twilio WhatsApp configured"
    fi
    
    read -p "Resend API Key: " RESEND_KEY
    if [ -n "$RESEND_KEY" ]; then
        sed -i "s/RESEND_API_KEY=.*/RESEND_API_KEY=$RESEND_KEY/" .env
        print_success "Resend API Key configured"
    fi
    
    print_header "Advanced Configuration"
    
    read -p "Email Worker Replicas (default 2): " EMAIL_REPS
    EMAIL_REPS=${EMAIL_REPS:-2}
    sed -i "s/EMAIL_WORKER_REPLICAS=.*/EMAIL_WORKER_REPLICAS=$EMAIL_REPS/" .env
    
    read -p "SMS Worker Replicas (default 2): " SMS_REPS
    SMS_REPS=${SMS_REPS:-2}
    sed -i "s/SMS_WORKER_REPLICAS=.*/SMS_WORKER_REPLICAS=$SMS_REPS/" .env
    
    read -p "Voice Worker Replicas (default 1): " VOICE_REPS
    VOICE_REPS=${VOICE_REPS:-1}
    sed -i "s/VOICE_WORKER_REPLICAS=.*/VOICE_WORKER_REPLICAS=$VOICE_REPS/" .env
    
    read -p "WhatsApp Worker Replicas (default 2): " WHATSAPP_REPS
    WHATSAPP_REPS=${WHATSAPP_REPS:-2}
    sed -i "s/WHATSAPP_WORKER_REPLICAS=.*/WHATSAPP_WORKER_REPLICAS=$WHATSAPP_REPS/" .env
    
    print_success "Worker replicas configured"
    
    print_header "Configuration Summary"
    
    echo -e "\n${YELLOW}Your configuration:${NC}"
    echo "  Database: PostgreSQL (port 5432)"
    echo "  Redis: (port 6379)"
    echo "  API Gateway: http://localhost:3000"
    echo "  Admin API: http://localhost:3001"
    echo "  Webhook Receiver: http://localhost:3002"
    echo "  Email Workers: $EMAIL_REPS replicas"
    echo "  SMS Workers: $SMS_REPS replicas"
    echo "  Voice Workers: $VOICE_REPS replicas"
    echo "  WhatsApp Workers: $WHATSAPP_REPS replicas"
    
    print_header "Next Steps"
    
    echo -e "\n${GREEN}Setup complete! Follow these steps:${NC}"
    echo "  1. Review configuration: nano .env"
    echo "  2. Start services: ./deploy.sh start"
    echo "  3. Check health: ./deploy.sh health"
    echo "  4. View logs: ./deploy.sh logs"
    echo "  5. Set up SSL: See DEPLOYMENT_GUIDE.md"
    
    print_warning "IMPORTANT: Always keep .env file secure and never commit to git"
    
    echo ""
}

main "$@"
