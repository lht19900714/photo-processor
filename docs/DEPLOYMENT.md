# 部署指南

本文档详细介绍如何在生产环境部署 PhotoProcessor。

## 目录

- [部署方式](#部署方式)
- [Docker 部署（推荐）](#docker-部署推荐)
- [手动部署](#手动部署)
- [Nginx 配置](#nginx-配置)
- [HTTPS 配置](#https-配置)
- [监控与日志](#监控与日志)
- [备份与恢复](#备份与恢复)
- [故障排除](#故障排除)

---

## 部署方式

| 方式 | 适用场景 | 复杂度 |
|------|----------|--------|
| Docker Compose | 推荐，适合大多数场景 | ⭐ |
| 手动部署 | 需要精细控制 | ⭐⭐⭐ |
| Kubernetes | 大规模、高可用 | ⭐⭐⭐⭐ |

---

## Docker 部署（推荐）

### 系统要求

- Docker Engine 20.10+
- Docker Compose v2+
- 至少 2GB RAM（Chromium 需要）
- 至少 10GB 磁盘空间

### 步骤 1：准备服务器

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y docker.io docker-compose-plugin

# 启动 Docker
sudo systemctl enable docker
sudo systemctl start docker

# 添加当前用户到 docker 组（可选，避免每次 sudo）
sudo usermod -aG docker $USER
```

### 步骤 2：克隆代码

```bash
git clone <your-repo-url> /opt/photo-processor
cd /opt/photo-processor
```

### 步骤 3：配置环境变量

```bash
# 创建 .env 文件
cat > .env << 'EOF'
# 安全配置（必须修改）
JWT_SECRET=<生成一个随机字符串，至少32位>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<强密码>

# Dropbox 配置
DROPBOX_APP_KEY=<你的 App Key>
DROPBOX_APP_SECRET=<你的 App Secret>
DROPBOX_REDIRECT_URI=https://yourdomain.com/api/dropbox/callback

# 前端配置
FRONTEND_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
EOF
```

生成随机 JWT_SECRET：

```bash
openssl rand -base64 32
```

### 步骤 4：配置 Nginx（可选，使用自定义域名）

编辑 `nginx/nginx.conf`：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    # SSL 证书
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # 前端静态文件
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 步骤 5：放置 SSL 证书

```bash
mkdir -p nginx/certs
cp /path/to/fullchain.pem nginx/certs/
cp /path/to/privkey.pem nginx/certs/
```

### 步骤 6：启动服务

```bash
# 构建并启动
docker compose up -d --build

# 查看状态
docker compose ps

# 查看日志
docker compose logs -f
```

### 步骤 7：验证部署

```bash
# 检查后端健康
curl http://localhost:3000/health

# 检查容器状态
docker compose ps
```

### 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并部署
docker compose build --no-cache
docker compose up -d
```

---

## 手动部署

如果不使用 Docker，可以手动部署。

### 系统要求

- Node.js 22+
- Yarn 4+
- 系统依赖（用于 Playwright）

### 步骤 1：安装系统依赖

```bash
# Ubuntu/Debian - Playwright 依赖
sudo apt install -y \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2
```

### 步骤 2：安装 Node.js

```bash
# 使用 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22

# 启用 Corepack
corepack enable
```

### 步骤 3：构建项目

```bash
cd /opt/photo-processor

# 安装依赖
yarn install

# 安装 Playwright 浏览器
cd apps/server && npx playwright install chromium && cd ../..

# 构建
yarn build
```

### 步骤 4：配置环境变量

```bash
cp apps/server/.env.example apps/server/.env
# 编辑 .env 填入配置
```

### 步骤 5：使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 创建 ecosystem 配置
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'photo-processor-server',
    cwd: './apps/server',
    script: 'dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# 启动
pm2 start ecosystem.config.js

# 保存配置（开机自启）
pm2 save
pm2 startup
```

### 步骤 6：配置 Nginx

```bash
sudo apt install -y nginx

# 创建配置
sudo cat > /etc/nginx/sites-available/photo-processor << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    # 前端静态文件
    root /opt/photo-processor/apps/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/photo-processor /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## HTTPS 配置

### 使用 Let's Encrypt

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 自动续期（已自动配置）
sudo certbot renew --dry-run
```

### 使用自签名证书（测试用）

```bash
mkdir -p nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout nginx/certs/privkey.pem \
    -out nginx/certs/fullchain.pem \
    -subj "/CN=localhost"
```

---

## 监控与日志

### 查看日志

```bash
# Docker 方式
docker compose logs -f server
docker compose logs -f web

# 手动部署
pm2 logs photo-processor-server
```

### 健康检查

```bash
# 后端健康检查
curl http://localhost:3000/health

# 检查容器状态
docker compose ps
```

### 设置日志轮转

Docker 日志自动轮转配置（`/etc/docker/daemon.json`）：

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

---

## 备份与恢复

### 备份数据

```bash
# 创建备份目录
mkdir -p /backup/photo-processor

# 备份数据库
cp /opt/photo-processor/data/app.db /backup/photo-processor/app.db.$(date +%Y%m%d)

# 备份环境配置
cp /opt/photo-processor/.env /backup/photo-processor/.env.$(date +%Y%m%d)
```

### 自动备份脚本

```bash
#!/bin/bash
# /opt/scripts/backup-photo-processor.sh

BACKUP_DIR="/backup/photo-processor"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份数据库
docker compose exec -T server cat /app/data/app.db > $BACKUP_DIR/app.db.$DATE

# 保留最近 7 天的备份
find $BACKUP_DIR -name "app.db.*" -mtime +7 -delete

echo "Backup completed: $BACKUP_DIR/app.db.$DATE"
```

添加到 crontab：

```bash
# 每天凌晨 2 点备份
0 2 * * * /opt/scripts/backup-photo-processor.sh
```

### 恢复数据

```bash
# 停止服务
docker compose down

# 恢复数据库
cp /backup/photo-processor/app.db.20260204 data/app.db

# 启动服务
docker compose up -d
```

---

## 故障排除

### 容器启动失败

```bash
# 查看详细日志
docker compose logs server

# 检查端口占用
sudo lsof -i :3000
sudo lsof -i :80
```

### Playwright 浏览器问题

```bash
# 进入容器检查
docker compose exec server bash

# 测试浏览器
node -e "require('playwright').chromium.launch().then(b => { console.log('OK'); b.close(); })"
```

### 数据库锁定

```bash
# 检查数据库文件权限
ls -la data/app.db

# 修复权限
chmod 644 data/app.db
```

### 内存不足

Chromium 需要较多内存，建议至少 2GB：

```bash
# 查看内存使用
docker stats

# 限制容器内存（docker-compose.yml）
services:
  server:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Dropbox 连接问题

1. 检查 Redirect URI 是否正确配置
2. 确认 App 权限已启用
3. 检查网络是否可以访问 Dropbox API

```bash
# 测试 Dropbox API 连通性
curl -I https://api.dropboxapi.com
```

---

## 生产环境清单

部署前检查：

- [ ] JWT_SECRET 已设置为强随机字符串
- [ ] ADMIN_PASSWORD 已修改为强密码
- [ ] Dropbox Redirect URI 已配置正确域名
- [ ] HTTPS 已启用
- [ ] 防火墙已配置（仅开放 80/443）
- [ ] 日志轮转已配置
- [ ] 备份策略已实施
- [ ] 监控告警已配置

---

## 相关文档

- [API 文档](./API.md)
- [开发者指南](./DEVELOPMENT.md)
