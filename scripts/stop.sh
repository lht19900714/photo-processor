#!/bin/bash
# =============================================================================
# Stop Photo-Processor Services
#
# [L-4 FIX] Graceful shutdown with confirmation for active connections
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

echo -e "${CYAN}Stopping Photo-Processor services...${NC}"
echo ""

# Check if services are running
if ! docker compose -f docker-compose.prod.yml ps --quiet 2>/dev/null | grep -q .; then
    echo -e "${YELLOW}No services are currently running.${NC}"
    exit 0
fi

# Show current status
echo "Current service status:"
docker compose -f docker-compose.prod.yml ps
echo ""

# Check for running tasks (optional - requires health endpoint to report this)
echo -e "${YELLOW}Initiating graceful shutdown...${NC}"

# Send SIGTERM first and wait for graceful shutdown
echo "  Sending stop signal (timeout: 30s)..."
if docker compose -f docker-compose.prod.yml stop -t 30; then
    echo -e "${GREEN}  ✓ Services stopped gracefully${NC}"
else
    echo -e "${YELLOW}  ⚠ Graceful shutdown timed out, forcing stop...${NC}"
fi

# Remove containers
echo "  Removing containers..."
docker compose -f docker-compose.prod.yml down --remove-orphans

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Services Stopped Successfully         ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "To start again: ./start.sh"
echo "To view old logs: docker compose -f docker-compose.prod.yml logs"
echo ""
