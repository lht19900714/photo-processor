#!/bin/bash
# =============================================================================
# Server-side Deployment Script (Pull Only)
# This script runs ON the server, triggered by GitHub Actions
# Only pulls images and prepares for deployment - does NOT start containers
#
# [M-6 FIX] Added backup and rollback mechanism
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(pwd)"

# Backup directory
BACKUP_DIR="${SCRIPT_DIR}/.backup"

# Error handler with rollback
error_handler() {
    local line_no=$1
    echo ""
    echo -e "${RED}Error occurred at line $line_no${NC}"
    echo -e "${RED}Attempting rollback...${NC}"

    if [ -f "${BACKUP_DIR}/.env.images.bak" ]; then
        echo "Restoring previous image configuration..."
        cp "${BACKUP_DIR}/.env.images.bak" .env.images
        echo -e "${YELLOW}Rollback complete. Previous images restored.${NC}"
        echo "You can restart with: ./start.sh"
    else
        echo -e "${YELLOW}No backup available for rollback.${NC}"
    fi

    exit 1
}

trap 'error_handler $LINENO' ERR

echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}  Photo-Processor Server Deployment     ${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

echo -e "${YELLOW}[1/4] Loading configuration...${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup current image configuration
if [ -f ".env.images" ]; then
    cp .env.images "${BACKUP_DIR}/.env.images.bak"
    echo "Backed up current image configuration"
fi

# Load image tags from GitHub Actions
if [ -f ".env.images" ]; then
    source .env.images
    echo "Server image: ${SERVER_IMAGE:-not set}"
    echo "Web image: ${WEB_IMAGE:-not set}"
else
    echo -e "${RED}Error: .env.images not found${NC}"
    exit 1
fi

# Check for .env.prod (runtime secrets)
if [ ! -f ".env.prod" ]; then
    echo -e "${YELLOW}Warning: .env.prod not found${NC}"
    echo "Please create .env.prod with your runtime configuration before starting."
    echo "Copy from .env.prod.example and fill in your values."
    echo ""
fi

echo -e "${YELLOW}[2/4] Logging into GHCR...${NC}"

# Login to GHCR (for public images, this may not be required)
if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-github}" --password-stdin
else
    echo "No GHCR_TOKEN found, attempting anonymous pull (public images only)"
fi

echo -e "${YELLOW}[3/4] Pulling latest images...${NC}"

# Pull with retry logic
pull_with_retry() {
    local image=$1
    local max_attempts=3
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        echo "  Pulling $image (attempt $attempt/$max_attempts)..."
        if docker pull "$image"; then
            return 0
        fi
        echo "  Pull failed, retrying..."
        attempt=$((attempt + 1))
        sleep 5
    done

    echo -e "${RED}  Failed to pull $image after $max_attempts attempts${NC}"
    return 1
}

if ! pull_with_retry "$SERVER_IMAGE"; then
    exit 1
fi

if ! pull_with_retry "$WEB_IMAGE"; then
    exit 1
fi

echo -e "${YELLOW}[4/4] Verifying images...${NC}"

# Verify images exist locally
if ! docker image inspect "$SERVER_IMAGE" >/dev/null 2>&1; then
    echo -e "${RED}Error: Server image not found locally${NC}"
    exit 1
fi

if ! docker image inspect "$WEB_IMAGE" >/dev/null 2>&1; then
    echo -e "${RED}Error: Web image not found locally${NC}"
    exit 1
fi

# Clean up old backup (keep only latest)
find "$BACKUP_DIR" -name "*.bak" -mtime +7 -delete 2>/dev/null || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Images Pulled Successfully!           ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${CYAN}Pulled images:${NC}"
echo "  Server: $SERVER_IMAGE"
echo "  Web:    $WEB_IMAGE"
echo ""
echo -e "${CYAN}Next steps to start the application:${NC}"
echo ""
echo "  1. Ensure .env.prod exists and is configured:"
echo "     cp .env.prod.example .env.prod"
echo "     vim .env.prod"
echo ""
echo "  2. Start the containers:"
echo "     ./start.sh"
echo ""
echo "  Or manually:"
echo "     export SERVER_IMAGE=\"$SERVER_IMAGE\""
echo "     export WEB_IMAGE=\"$WEB_IMAGE\""
echo "     docker compose -f docker-compose.prod.yml --env-file .env.prod up -d"
echo ""
echo -e "${CYAN}Rollback (if needed):${NC}"
echo "  If something goes wrong, restore previous version:"
echo "     cp ${BACKUP_DIR}/.env.images.bak .env.images"
echo "     ./start.sh"
echo ""
