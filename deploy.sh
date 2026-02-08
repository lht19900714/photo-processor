#!/bin/bash
# =============================================================================
# Photo-Processor Production Deployment Script
# Domain: photo.wangdake.de
# =============================================================================
#
# [H-4 FIX] Added error handling and improved robustness
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Error handler
error_handler() {
    local line_no=$1
    local error_code=$2
    echo ""
    echo -e "${RED}==========================================${NC}"
    echo -e "${RED}  Deployment Failed!                     ${NC}"
    echo -e "${RED}==========================================${NC}"
    echo -e "${RED}Error occurred at line $line_no (exit code: $error_code)${NC}"
    echo ""
    echo -e "${YELLOW}Please check the error message above and try again.${NC}"
    exit 1
}

trap 'error_handler $LINENO $?' ERR

# Cleanup function
cleanup() {
    # Nothing to clean up for now, but useful for future extensions
    :
}

trap cleanup EXIT

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Photo-Processor Deployment Script     ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Deployment confirmation
echo -e "${YELLOW}⚠️  You are about to deploy to PRODUCTION${NC}"
echo ""
echo -e "Target: ${BLUE}photo.wangdake.de:22443${NC}"
echo -e "Directory: ${BLUE}$PROJECT_DIR${NC}"
echo ""
read -p "Continue with deployment? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled.${NC}"
    exit 0
fi
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${YELLOW}[1/6] Checking prerequisites...${NC}"

if ! command_exists docker; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    echo "Please install Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}✓ Docker and Docker Compose are installed${NC}"

# Check environment file
echo -e "${YELLOW}[2/6] Checking environment configuration...${NC}"

if [ ! -f ".env.prod" ]; then
    echo -e "${RED}Error: .env.prod file not found${NC}"
    echo "Creating from template..."
    cp .env.prod.example .env.prod
    chmod 600 .env.prod
    echo -e "${YELLOW}⚠ Please edit .env.prod and configure:${NC}"
    echo "  - JWT_SECRET (generate with: openssl rand -base64 32)"
    echo "  - ADMIN_PASSWORD (use a strong password)"
    echo "  - DROPBOX_APP_KEY (from Dropbox Developer Console)"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Validate required variables
source .env.prod
MISSING_VARS=""

# [C-2 FIX] Strict validation for JWT_SECRET
if [ -z "${JWT_SECRET:-}" ]; then
    MISSING_VARS="$MISSING_VARS JWT_SECRET"
elif [ ${#JWT_SECRET} -lt 32 ]; then
    echo -e "${RED}Error: JWT_SECRET is too short (minimum 32 characters)${NC}"
    echo "Generate a secure secret with: openssl rand -base64 32"
    exit 1
fi

if [ -z "${ADMIN_PASSWORD:-}" ]; then
    MISSING_VARS="$MISSING_VARS ADMIN_PASSWORD"
elif [ ${#ADMIN_PASSWORD} -lt 8 ]; then
    echo -e "${RED}Error: ADMIN_PASSWORD is too short (minimum 8 characters)${NC}"
    exit 1
fi

if [ -z "${DROPBOX_APP_KEY:-}" ]; then
    MISSING_VARS="$MISSING_VARS DROPBOX_APP_KEY"
fi

if [ -n "$MISSING_VARS" ]; then
    echo -e "${RED}Error: The following variables need to be configured in .env.prod:${NC}"
    echo "$MISSING_VARS"
    exit 1
fi

echo -e "${GREEN}✓ Environment configuration is valid${NC}"

# Create data directory
echo -e "${YELLOW}[3/6] Creating data directory...${NC}"
mkdir -p data
chmod 700 data
echo -e "${GREEN}✓ Data directory ready${NC}"

# Build images
echo -e "${YELLOW}[4/6] Building Docker images...${NC}"
echo "This may take several minutes on first build..."

if ! docker compose -f docker-compose.prod.yml build --no-cache; then
    echo -e "${RED}Error: Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker images built${NC}"

# Stop existing containers
echo -e "${YELLOW}[5/6] Stopping existing containers (if any)...${NC}"
docker compose -f docker-compose.prod.yml down 2>/dev/null || true
echo -e "${GREEN}✓ Existing containers stopped${NC}"

# Start services
echo -e "${YELLOW}[6/6] Starting services...${NC}"
if ! docker compose -f docker-compose.prod.yml --env-file .env.prod up -d; then
    echo -e "${RED}Error: Failed to start services${NC}"
    exit 1
fi

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}Waiting for services to start...${NC}"
sleep 10

# Health check
echo -e "${YELLOW}Performing health check...${NC}"
HEALTHY=false
for i in {1..10}; do
    if docker compose -f docker-compose.prod.yml ps | grep -q "(healthy)"; then
        HEALTHY=true
        break
    fi
    echo "  Attempt $i/10 - waiting..."
    sleep 5
done

# Check service status
echo ""
echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Deployment Status                     ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

docker compose -f docker-compose.prod.yml ps

echo ""
if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Deployment Complete!                  ${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}  Services Started (Health Check Pending)${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}Services are starting, please wait a moment and verify manually.${NC}"
fi
echo ""
echo -e "Access your application at:"
echo -e "  ${BLUE}https://photo.wangdake.de:22443${NC}"
echo ""
echo -e "HTTP will automatically redirect to HTTPS:"
echo -e "  ${BLUE}http://photo.wangdake.de:22080${NC}"
echo ""
echo -e "Admin login:"
echo -e "  Username: ${ADMIN_USERNAME:-admin}"
echo -e "  Password: (as configured in .env.prod)"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo -e "  1. Make sure ports 22080 and 22443 are open in firewall"
echo -e "  2. DNS must point photo.wangdake.de to this server"
echo -e "  3. Let's Encrypt will auto-issue SSL certificate on first request"
echo ""
echo -e "Useful commands:"
echo -e "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
echo -e "  Restart:       docker compose -f docker-compose.prod.yml restart"
echo -e "  Stop:          docker compose -f docker-compose.prod.yml down"
echo -e "  Update:        git pull && ./deploy.sh"
echo ""
