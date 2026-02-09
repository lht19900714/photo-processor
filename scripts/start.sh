#!/bin/bash
# =============================================================================
# Start Photo-Processor Services
# Run this script AFTER server-deploy.sh has pulled the images
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  Starting Photo-Processor Services     ${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

# Check for required files
if [ ! -f ".env.images" ]; then
    echo -e "${RED}Error: .env.images not found${NC}"
    echo "Please run server-deploy.sh first (or trigger GitHub Actions deployment)"
    exit 1
fi

if [ ! -f ".env.prod" ]; then
    echo -e "${RED}Error: .env.prod not found${NC}"
    echo ""
    echo "Please create .env.prod with your configuration:"
    echo "  cp .env.prod.example .env.prod"
    echo "  vim .env.prod"
    echo ""
    echo "Required variables:"
    echo "  - JWT_SECRET (generate with: openssl rand -base64 32)"
    echo "  - ADMIN_PASSWORD"
    echo "  - DROPBOX_APP_KEY"
    exit 1
fi

if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${RED}Error: docker-compose.prod.yml not found${NC}"
    exit 1
fi

# Load image tags
source .env.images
export SERVER_IMAGE
export WEB_IMAGE

echo "Server image: $SERVER_IMAGE"
echo "Web image:    $WEB_IMAGE"
echo ""

echo -e "${YELLOW}[1/4] Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true

echo -e "${YELLOW}[2/4] Creating data directory...${NC}"
mkdir -p data
chmod 700 data

echo -e "${YELLOW}[3/4] Starting containers...${NC}"
if ! docker compose -f docker-compose.prod.yml --env-file .env.prod up -d; then
    echo -e "${RED}Error: Failed to start containers${NC}"
    exit 1
fi

echo -e "${YELLOW}[4/4] Waiting for services to become healthy...${NC}"

# Health check loop
HEALTHY=false
for i in {1..20}; do
    sleep 5
    if docker compose -f docker-compose.prod.yml ps | grep -q "(healthy)"; then
        HEALTHY=true
        break
    fi
    echo "  Waiting for health check... ($i/20)"
done

# Final status
echo ""
docker compose -f docker-compose.prod.yml ps

echo ""
if [ "$HEALTHY" = true ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}  Services Started Successfully!        ${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo -e "${YELLOW}=========================================${NC}"
    echo -e "${YELLOW}  Services Started (Verifying...)       ${NC}"
    echo -e "${YELLOW}=========================================${NC}"
    echo ""
    echo -e "${YELLOW}Health check pending. Services may still be initializing.${NC}"
fi
echo ""
echo "Server: $SERVER_IMAGE"
echo "Web:    $WEB_IMAGE"
echo ""
echo -e "${CYAN}Access URL:${NC} https://photo.wangdake.de:22443"
echo ""
echo -e "${CYAN}Useful commands:${NC}"
echo "  View logs:     docker compose -f docker-compose.prod.yml logs -f"
echo "  View server:   docker compose -f docker-compose.prod.yml logs -f server"
echo "  Stop services: ./stop.sh"
echo "  Restart:       docker compose -f docker-compose.prod.yml restart"
echo ""
