#!/bin/bash

##############################################################################
# Unified Messaging Service - Production Deployment Script
# Usage: ./deploy.sh [start|stop|restart|logs|health|backup]
##############################################################################

set -e

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"
BACKUP_DIR="./backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

##############################################################################
# Helper Functions
##############################################################################

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
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

check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        exit 1
    fi
    print_success "Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed"
        exit 1
    fi
    print_success "Docker Compose found: $(docker-compose --version)"
    
    # Check .env file
    if [ ! -f "$ENV_FILE" ]; then
        print_error ".env file not found"
        print_warning "Please copy .env.prod to .env and configure it"
        exit 1
    fi
    print_success ".env file exists"
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running or you don't have permissions"
        exit 1
    fi
    print_success "Docker daemon is running"
}

##############################################################################
# Deployment Commands
##############################################################################

cmd_start() {
    print_header "Starting Services"
    check_prerequisites
    
    print_warning "Building Docker images (this may take several minutes)..."
    docker-compose -f $COMPOSE_FILE build
    
    print_warning "Starting containers..."
    docker-compose -f $COMPOSE_FILE up -d
    
    print_header "Waiting for services to be healthy"
    sleep 10
    
    # Check database
    print_warning "Initializing database..."
    if docker-compose -f $COMPOSE_FILE exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        docker-compose -f $COMPOSE_FILE exec -T api-gateway npx prisma db push --skip-generate
        print_success "Database initialized"
    else
        print_error "Database failed to start"
        docker-compose -f $COMPOSE_FILE logs postgres
        exit 1
    fi
    
    print_success "All services started successfully!"
    cmd_health
}

cmd_stop() {
    print_header "Stopping Services"
    docker-compose -f $COMPOSE_FILE down
    print_success "All services stopped"
}

cmd_restart() {
    print_header "Restarting Services"
    cmd_stop
    sleep 5
    cmd_start
}

cmd_logs() {
    print_header "Service Logs"
    
    if [ -z "$2" ]; then
        # Show all logs
        docker-compose -f $COMPOSE_FILE logs -f
    else
        # Show specific service logs
        docker-compose -f $COMPOSE_FILE logs -f "$2"
    fi
}

cmd_health() {
    print_header "Health Check"
    
    local failed=0
    
    # PostgreSQL
    echo -n "PostgreSQL: "
    if docker-compose -f $COMPOSE_FILE exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        print_success "OK"
    else
        print_error "FAILED"
        failed=$((failed + 1))
    fi
    
    # Redis
    echo -n "Redis: "
    if docker-compose -f $COMPOSE_FILE exec -T redis redis-cli ping > /dev/null 2>&1; then
        print_success "OK"
    else
        print_error "FAILED"
        failed=$((failed + 1))
    fi
    
    # API Gateway
    echo -n "API Gateway (port 3000): "
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "OK"
    else
        print_error "FAILED"
        failed=$((failed + 1))
    fi
    
    # Admin API
    echo -n "Admin API (port 3001): "
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        print_success "OK"
    else
        print_error "FAILED"
        failed=$((failed + 1))
    fi
    
    # Webhook Receiver
    echo -n "Webhook Receiver (port 3002): "
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        print_success "OK"
    else
        print_error "FAILED"
        failed=$((failed + 1))
    fi
    
    # Workers count
    echo -n "Worker Services: "
    local running=$(docker-compose -f $COMPOSE_FILE ps --services --filter "status=running" | grep worker | wc -l)
    if [ $running -ge 4 ]; then
        print_success "OK ($running running)"
    else
        print_error "FAILED ($running running, expected 4+)"
        failed=$((failed + 1))
    fi
    
    if [ $failed -eq 0 ]; then
        print_success "All services are healthy!"
        return 0
    else
        print_error "$failed service(s) failed health check"
        return 1
    fi
}

cmd_backup() {
    print_header "Database Backup"
    
    # Create backup directory if it doesn't exist
    mkdir -p $BACKUP_DIR
    
    local backup_file="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"
    
    print_warning "Backing up database to $backup_file..."
    docker-compose -f $COMPOSE_FILE exec -T postgres \
        pg_dump -U postgres -d messaging_service > "$backup_file"
    
    if [ $? -eq 0 ]; then
        print_success "Backup created: $backup_file"
        ls -lh "$backup_file"
    else
        print_error "Backup failed"
        exit 1
    fi
}

cmd_status() {
    print_header "Service Status"
    docker-compose -f $COMPOSE_FILE ps
}

cmd_config() {
    print_header "Configuration Check"
    
    echo "Environment Variables:"
    if [ -f "$ENV_FILE" ]; then
        grep -v "^#" "$ENV_FILE" | grep -v "^$" | sort
    else
        print_error ".env file not found"
        exit 1
    fi
}

cmd_clean() {
    print_header "Cleaning Up"
    print_warning "This will remove all containers and volumes (including data!)"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
        docker-compose -f $COMPOSE_FILE down -v
        print_success "Cleanup complete"
    else
        print_warning "Cleanup cancelled"
    fi
}

cmd_help() {
    cat << EOF
${BLUE}Unified Messaging Service - Deployment Script${NC}

Usage: $0 <command> [options]

Commands:
    start       Start all services
    stop        Stop all services
    restart     Restart all services
    logs        Show logs (optional: service name)
    health      Check health of all services
    status      Show service status
    backup      Create database backup
    config      Show configuration
    clean       Remove all containers and volumes (WARNING!)
    help        Show this help message

Examples:
    $0 start
    $0 logs api-gateway
    $0 health
    $0 backup

For more information, see DEPLOYMENT_GUIDE.md
EOF
}

##############################################################################
# Main
##############################################################################

main() {
    if [ $# -eq 0 ]; then
        cmd_help
        exit 1
    fi
    
    case "$1" in
        start)
            cmd_start
            ;;
        stop)
            cmd_stop
            ;;
        restart)
            cmd_restart
            ;;
        logs)
            cmd_logs "$@"
            ;;
        health)
            cmd_health
            ;;
        status)
            cmd_status
            ;;
        backup)
            cmd_backup
            ;;
        config)
            cmd_config
            ;;
        clean)
            cmd_clean
            ;;
        help)
            cmd_help
            ;;
        *)
            print_error "Unknown command: $1"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
