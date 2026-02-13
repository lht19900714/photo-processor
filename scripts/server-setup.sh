#!/bin/bash
# =============================================================================
# First-time Server Setup Script
# Run this ONCE on a new server before first deployment
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}  Photo-Processor Server Setup          ${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if running as root or with sudo
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}Warning: Running as root is not recommended.${NC}"
    echo "Consider creating a dedicated deploy user."
    echo ""
fi

# Get deployment directory
read -p "Deployment directory [/opt/photo-processor]: " DEPLOY_DIR
DEPLOY_DIR=${DEPLOY_DIR:-/opt/photo-processor}

echo ""
echo -e "${YELLOW}[1/7] Creating deployment directory...${NC}"
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/data"
chmod 700 "$DEPLOY_DIR/data"
cd "$DEPLOY_DIR"
echo -e "${GREEN}✓ Created $DEPLOY_DIR${NC}"

echo ""
echo -e "${YELLOW}[2/7] Checking Docker installation...${NC}"
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker is installed${NC}"
    docker --version
else
    echo -e "${RED}✗ Docker not found${NC}"
    echo "Please install Docker first:"
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
    echo -e "${GREEN}✓ Docker Compose is available${NC}"
else
    echo -e "${RED}✗ Docker Compose not found${NC}"
    echo "Please install Docker Compose plugin"
    exit 1
fi

echo ""
echo -e "${YELLOW}[3/7] Creating environment configuration...${NC}"

if [ -f ".env.prod" ]; then
    echo -e "${YELLOW}⚠ .env.prod already exists, skipping...${NC}"
else
    # [C-2 FIX] Generate secure JWT secret automatically
    JWT_SECRET=$(openssl rand -base64 32)

    cat > .env.prod << EOF
# =============================================================================
# Photo-Processor Production Environment Variables
# Generated on $(date)
# =============================================================================

# JWT Authentication (auto-generated - DO NOT SHARE)
JWT_SECRET=$JWT_SECRET

# Admin Account - CHANGE THE PASSWORD!
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_ME_TO_STRONG_PASSWORD

# Dropbox OAuth (REQUIRED - get from https://www.dropbox.com/developers/apps)
DROPBOX_APP_KEY=

# URLs (pre-configured for photo.wangdake.de)
DROPBOX_REDIRECT_URI=https://photo.wangdake.de/api/dropbox/callback
FRONTEND_URL=https://photo.wangdake.de
CORS_ORIGIN=https://photo.wangdake.de
EOF

    chmod 600 .env.prod
    echo -e "${GREEN}✓ Created .env.prod with auto-generated JWT_SECRET${NC}"
    echo -e "${RED}  ⚠ IMPORTANT: Edit .env.prod and set:${NC}"
    echo -e "${RED}    - ADMIN_PASSWORD (use a strong password, min 8 chars)${NC}"
    echo -e "${RED}    - DROPBOX_APP_KEY (from Dropbox Developer Console)${NC}"
fi

echo ""
echo -e "${YELLOW}[4/7] Setting up firewall rules...${NC}"

if command -v ufw &> /dev/null; then
    echo "Detected UFW firewall"
    read -p "Open ports 80 and 443? [y/N]: " OPEN_PORTS
    if [ "$OPEN_PORTS" = "y" ] || [ "$OPEN_PORTS" = "Y" ]; then
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        echo -e "${GREEN}✓ Firewall rules added${NC}"
    fi
elif command -v firewall-cmd &> /dev/null; then
    echo "Detected firewalld"
    read -p "Open ports 80 and 443? [y/N]: " OPEN_PORTS
    if [ "$OPEN_PORTS" = "y" ] || [ "$OPEN_PORTS" = "Y" ]; then
        sudo firewall-cmd --permanent --add-port=80/tcp
        sudo firewall-cmd --permanent --add-port=443/tcp
        sudo firewall-cmd --reload
        echo -e "${GREEN}✓ Firewall rules added${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No firewall detected. Make sure ports 80 and 443 are accessible.${NC}"
fi

echo ""
echo -e "${YELLOW}[5/7] Creating SSH deploy key...${NC}"

SSH_KEY_PATH="$HOME/.ssh/github_deploy"
if [ -f "$SSH_KEY_PATH" ]; then
    echo -e "${YELLOW}⚠ SSH key already exists at $SSH_KEY_PATH${NC}"
else
    read -p "Generate new SSH key for GitHub Actions? [y/N]: " GEN_KEY
    if [ "$GEN_KEY" = "y" ] || [ "$GEN_KEY" = "Y" ]; then
        ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$SSH_KEY_PATH" -N ""
        echo -e "${GREEN}✓ SSH key generated${NC}"
        echo ""
        echo -e "${BLUE}Public key (add to server's ~/.ssh/authorized_keys):${NC}"
        cat "${SSH_KEY_PATH}.pub"
        echo ""
        echo -e "${BLUE}Private key (add to GitHub Secrets as SSH_PRIVATE_KEY):${NC}"
        echo -e "${YELLOW}Run: cat $SSH_KEY_PATH${NC}"
    fi
fi

echo ""
echo -e "${YELLOW}[6/7] Setting script permissions...${NC}"
if [ -f "$DEPLOY_DIR/deploy.sh" ]; then
    chmod +x "$DEPLOY_DIR/deploy.sh"
fi
if [ -d "$DEPLOY_DIR/scripts" ]; then
    chmod +x "$DEPLOY_DIR/scripts/"*.sh 2>/dev/null || true
fi
echo -e "${GREEN}✓ Script permissions set${NC}"

echo ""
echo -e "${YELLOW}[7/7] Setup complete!${NC}"
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  Next Steps                            ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "1. Edit .env.prod and configure:"
echo "   - ADMIN_PASSWORD (use a strong password, minimum 8 characters)"
echo "   - DROPBOX_APP_KEY (from Dropbox Developer Console)"
echo ""
echo "2. Add SSH public key to ~/.ssh/authorized_keys:"
echo "   cat ${SSH_KEY_PATH}.pub >> ~/.ssh/authorized_keys"
echo ""
echo "3. Configure GitHub Secrets in your repository:"
echo "   - SSH_PRIVATE_KEY: content of $SSH_KEY_PATH"
echo "   - SERVER_HOST: your server's IP or hostname"
echo "   - SERVER_USER: $(whoami)"
echo "   - DEPLOY_PATH: $DEPLOY_DIR"
echo ""
echo "4. Configure Dropbox App:"
echo "   - Go to https://www.dropbox.com/developers/apps"
echo "   - Create new app with 'Scoped access' and 'Full Dropbox'"
echo "   - Add redirect URI: https://photo.wangdake.de/api/dropbox/callback"
echo "   - Copy App key to .env.prod DROPBOX_APP_KEY"
echo ""
echo "5. Trigger deployment from GitHub Actions!"
echo ""
