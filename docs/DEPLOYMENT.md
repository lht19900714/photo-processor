# 部署指南

## 概述

本项目使用 GitHub Actions + GHCR (GitHub Container Registry) 进行自动化部署。

### 关于 GHCR

GHCR 是 GitHub 免费提供的容器镜像存储服务：

| 项目 | 说明 |
|------|------|
| **申请流程** | ❌ 不需要，任何 GitHub 账户自动可用 |
| **费用** | 公共仓库完全免费 |
| **认证** | GitHub Actions 自动提供 `GITHUB_TOKEN`，无需手动配置 |
| **拉取公共镜像** | 不需要认证，直接 `docker pull` |

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub (公开仓库)                             │
│                                                                  │
│  ┌─────────────────┐              ┌─────────────────────────┐   │
│  │ 代码 (公开)      │              │ Secrets (加密)          │   │
│  │ ✓ Dockerfile    │              │ 🔒 SSH_PRIVATE_KEY     │   │
│  │ ✓ Caddyfile     │              │ 🔒 SERVER_HOST         │   │
│  │ ✓ .env.example  │              │ 🔒 SERVER_USER         │   │
│  │ ✗ 无任何密钥     │              │ 🔒 DEPLOY_PATH         │   │
│  └─────────────────┘              └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ GitHub Actions 构建镜像
┌─────────────────────────────────────────────────────────────────┐
│                    GHCR (镜像存储)                               │
│  ghcr.io/your-username/photo-processor-server:latest           │
│  ghcr.io/your-username/photo-processor-web:latest              │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ SSH 部署
┌─────────────────────────────────────────────────────────────────┐
│                    生产服务器                                    │
│  ┌─────────────────┐                                            │
│  │ .env.prod (私密) │ ← 只存在服务器，不进 Git                    │
│  │ JWT_SECRET      │                                            │
│  │ ADMIN_PASSWORD  │                                            │
│  │ DROPBOX_APP_KEY │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速开始

### 1. 服务器首次设置

在服务器上运行：

```bash
# 下载设置脚本
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/photo-processor/main/scripts/server-setup.sh
chmod +x server-setup.sh
./server-setup.sh
```

或手动设置：

```bash
# 创建部署目录
mkdir -p /opt/photo-processor/data
chmod 700 /opt/photo-processor/data
cd /opt/photo-processor

# 生成 JWT 密钥
JWT_SECRET=$(openssl rand -base64 32)

# 创建环境变量文件
cat > .env.prod << EOF
JWT_SECRET=$JWT_SECRET
ADMIN_USERNAME=admin
ADMIN_PASSWORD=你的强密码（至少8位）
DROPBOX_APP_KEY=你的Dropbox应用Key
DROPBOX_REDIRECT_URI=https://photo.wangdake.de:22443/api/dropbox/callback
FRONTEND_URL=https://photo.wangdake.de:22443
CORS_ORIGIN=https://photo.wangdake.de:22443
EOF

# 设置权限（重要！）
chmod 600 .env.prod
```

### 2. 生成部署 SSH 密钥

```bash
# 在服务器上生成密钥
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy -N ""

# 添加公钥到 authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# 查看私钥（需要添加到 GitHub Secrets）
cat ~/.ssh/github_deploy
```

### 3. 配置 GitHub Secrets

在 GitHub 仓库设置中添加以下 Secrets：

| Secret 名称 | 值 | 说明 |
|------------|-----|------|
| `SSH_PRIVATE_KEY` | SSH 私钥内容 | `cat ~/.ssh/github_deploy` 的输出 |
| `SERVER_HOST` | 服务器 IP 或域名 | 如 `123.45.67.89` |
| `SERVER_USER` | SSH 用户名 | 如 `root` 或 `deploy` |
| `DEPLOY_PATH` | 部署目录 | `/opt/photo-processor` |

**配置步骤：**
1. 打开 GitHub 仓库页面
2. 点击 **Settings** → **Secrets and variables** → **Actions**
3. 点击 **New repository secret**
4. 依次添加上述 4 个 Secrets

### 4. 配置 Dropbox 应用

1. 访问 [Dropbox Developer Console](https://www.dropbox.com/developers/apps)
2. 创建新应用：
   - 选择 "Scoped access"
   - 选择 "Full Dropbox"
   - 输入应用名称
3. 在应用设置中：
   - 复制 **App key**（添加到服务器 `.env.prod`）
   - 添加 **OAuth2 redirect URI**：`https://photo.wangdake.de:22443/api/dropbox/callback`
4. 在 Permissions 中启用：
   - `files.metadata.read`
   - `files.content.write`
   - `files.content.read`

### 5. 配置防火墙

```bash
# UFW
ufw allow 22080/tcp
ufw allow 22443/tcp

# 或 firewalld
firewall-cmd --permanent --add-port=22080/tcp
firewall-cmd --permanent --add-port=22443/tcp
firewall-cmd --reload
```

### 6. 触发部署

1. 打开 GitHub 仓库的 **Actions** 页面
2. 选择 **Deploy to Production** 工作流
3. 点击 **Run workflow**
4. 确认参数后点击绿色按钮
5. 等待镜像构建完成
6. **SSH 到服务器执行 `./start.sh` 启动服务**

---

## 域名和 HTTPS 配置

### 需要修改的文件

如果需要更换域名，需要修改以下文件：

#### 1. `caddy/Caddyfile` - Web 服务器配置

```caddyfile
# 全局配置
{
    http_port 22080
    https_port 22443

    # 生产环境启用 Let's Encrypt 正式证书
    acme_ca https://acme-v02.api.letsencrypt.org/directory

    # 证书过期通知邮箱
    email your-email@example.com
}

# ⚠️ 修改这里的域名
your-domain.com:22443 {
    # ... 其他配置保持不变
}

# ⚠️ HTTP 重定向也要修改
http://your-domain.com:22080 {
    redir https://your-domain.com:22443{uri} permanent
}
```

#### 2. `.env.prod` (服务器上)

```bash
# ⚠️ 修改所有 URL 中的域名
DROPBOX_REDIRECT_URI=https://your-domain.com:22443/api/dropbox/callback
FRONTEND_URL=https://your-domain.com:22443
CORS_ORIGIN=https://your-domain.com:22443
```

#### 3. Dropbox 开发者后台

更新 **OAuth2 redirect URI** 为新域名的回调地址。

### HTTPS 证书

Caddy 会自动从 Let's Encrypt 获取免费 SSL 证书，前提是：
- 域名 DNS 已正确解析到服务器 IP
- 服务器端口 22080/22443 可从公网访问
- 首次启动时需要几分钟获取证书

---

## 部署工作流程

```
手动触发
    │
    ▼
构建 Docker 镜像 (GitHub Actions 云端)
    │
    ├── photo-processor-server (含 Playwright)
    └── photo-processor-web (含 Caddy)
    │
    ▼
推送到 GHCR
    │
    ▼
SSH 连接服务器
    │
    ▼
拉取最新镜像 (自动)
    │
    ▼
健康检查
    │
    ▼
完成 ✅

    ⚠️ 手动步骤（如需要）
    │
    ▼
SSH 登录服务器
    │
    ▼
执行 ./start.sh
    │
    ▼
服务启动 🚀
```

---

## 文件说明

| 文件 | 用途 | 包含密钥？ |
|------|------|----------|
| `.env.prod.example` | 环境变量模板 | ❌ 示例值 |
| `.env.prod` | 运行时配置 | ✅ **不进 Git** |
| `.env.images` | 镜像标签 | ❌ Actions 生成 |
| `docker-compose.prod.yml` | 容器编排 | ❌ 使用变量 |
| `caddy/Caddyfile` | Caddy 配置 | ❌ |
| `scripts/server-deploy.sh` | 服务器部署脚本（仅拉取镜像） | ❌ |
| `scripts/start.sh` | 手动启动脚本 | ❌ |
| `scripts/stop.sh` | 手动停止脚本 | ❌ |
| `scripts/server-setup.sh` | 首次设置脚本 | ❌ |

---

## 常用命令

### 在服务器上

```bash
cd /opt/photo-processor

# 启动服务（推荐方式）
./start.sh

# 停止服务
./stop.sh

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f server  # 仅后端
docker compose -f docker-compose.prod.yml logs -f web     # 仅前端

# 重启服务
docker compose -f docker-compose.prod.yml restart

# 手动拉取最新镜像
docker pull ghcr.io/YOUR_USERNAME/photo-processor-server:latest
docker pull ghcr.io/YOUR_USERNAME/photo-processor-web:latest
```

### 备份数据

```bash
# 备份数据库
cp /opt/photo-processor/data/app.db /opt/photo-processor/data/app.db.backup.$(date +%Y%m%d)
```

---

## 更新代码后重新部署

### 方法 1：通过 GitHub Actions（推荐）

1. 将代码更改推送到 GitHub
2. 进入 GitHub Actions 页面
3. 手动触发 **Deploy to Production** 工作流
4. 等待构建完成
5. 如果服务没有自动重启，SSH 到服务器执行：
   ```bash
   cd /opt/photo-processor
   ./start.sh
   ```

### 方法 2：手动更新

```bash
# SSH 到服务器
ssh user@your-server

# 进入部署目录
cd /opt/photo-processor

# 拉取最新镜像
docker pull ghcr.io/YOUR_USERNAME/photo-processor-server:latest
docker pull ghcr.io/YOUR_USERNAME/photo-processor-web:latest

# 更新 .env.images
cat > .env.images << EOF
SERVER_IMAGE=ghcr.io/YOUR_USERNAME/photo-processor-server:latest
WEB_IMAGE=ghcr.io/YOUR_USERNAME/photo-processor-web:latest
EOF

# 重启服务
./start.sh
```

---

## 调试指南

### 1. 查看容器日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 仅查看后端日志
docker compose -f docker-compose.prod.yml logs -f server

# 仅查看前端/Caddy 日志
docker compose -f docker-compose.prod.yml logs -f web

# 查看最近 100 行
docker compose -f docker-compose.prod.yml logs --tail=100 server
```

### 2. 进入容器调试

```bash
# 进入后端容器
docker compose -f docker-compose.prod.yml exec server sh

# 在容器内检查
cat /app/data/app.db  # 检查数据库是否存在
env | grep -E "JWT|ADMIN|DROPBOX"  # 检查环境变量

# 进入 Caddy 容器
docker compose -f docker-compose.prod.yml exec web sh
```

### 3. 检查健康状态

```bash
# 检查容器健康状态
docker compose -f docker-compose.prod.yml ps

# 详细健康检查信息
docker inspect photo-processor-server | jq '.[0].State.Health'

# 手动测试健康端点
curl http://localhost:22000/health  # 从服务器内部
curl https://photo.wangdake.de:22443/health  # 从外部
```

### 4. 常见问题排查

#### 服务无法启动

```bash
# 检查 Docker 状态
docker compose -f docker-compose.prod.yml ps

# 检查详细错误日志
docker compose -f docker-compose.prod.yml logs server 2>&1 | tail -50

# 常见原因：
# - .env.prod 缺少必要变量
# - 端口被占用
# - 数据目录权限问题
```

#### SSL 证书问题

```bash
# 查看 Caddy 日志
docker compose -f docker-compose.prod.yml logs web

# 常见原因：
# - 域名 DNS 未指向服务器
# - 端口 22080/22443 被防火墙阻止
# - Let's Encrypt 速率限制（测试时使用 staging）

# 测试时使用 staging 证书（编辑 Caddyfile）：
# acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
```

#### Dropbox 连接问题

```bash
# 检查 Dropbox 相关日志
docker compose -f docker-compose.prod.yml logs server | grep -i dropbox

# 常见原因：
# - DROPBOX_APP_KEY 未设置或错误
# - Redirect URI 配置不匹配
# - 需要重新授权
```

#### 数据库问题

```bash
# 检查数据库文件
ls -la /opt/photo-processor/data/

# 检查数据库内容
sqlite3 /opt/photo-processor/data/app.db ".tables"
sqlite3 /opt/photo-processor/data/app.db "SELECT * FROM users;"

# 重置数据库（慎用！会丢失所有数据）
rm /opt/photo-processor/data/app.db*
./start.sh
```

### 5. 性能监控

```bash
# 查看容器资源使用
docker stats photo-processor-server photo-processor-web

# 查看磁盘使用
du -sh /opt/photo-processor/data/

# 清理未使用的 Docker 资源
docker system prune -a --volumes
```

---

## 回滚

如需回滚到之前的版本：

```bash
cd /opt/photo-processor

# 查看可用版本
docker images | grep photo-processor

# 方法 1：使用备份的配置
cp .backup/.env.images.bak .env.images
./start.sh

# 方法 2：手动指定版本
cat > .env.images << EOF
SERVER_IMAGE=ghcr.io/YOUR_USERNAME/photo-processor-server:20240101-120000-abc1234
WEB_IMAGE=ghcr.io/YOUR_USERNAME/photo-processor-web:20240101-120000-abc1234
EOF

./start.sh
```

---

## 故障排除

### 1. 构建失败

检查 GitHub Actions 日志，常见问题：
- 依赖安装失败：检查 `package.json` 和 `yarn.lock`
- Dockerfile 错误：检查 Dockerfile 语法

### 2. 部署失败

SSH 连接问题：
```bash
# 在本地测试 SSH
ssh -i /path/to/key user@server "echo 'SSH works'"
```

### 3. 服务无法启动

```bash
# 查看详细日志
docker compose -f docker-compose.prod.yml logs

# 检查健康状态
docker inspect photo-processor-server | grep -A 10 Health
```

### 4. SSL 证书问题

Caddy 自动获取 Let's Encrypt 证书，如果失败：
```bash
# 查看 Caddy 日志
docker compose -f docker-compose.prod.yml logs web

# 常见原因：
# - 域名 DNS 未指向服务器
# - 端口 22080/22443 被防火墙阻止
# - Let's Encrypt 速率限制（测试时使用 staging）
```

---

## 安全清单

部署前请确认：

- [ ] `.env.prod` 已添加到 `.gitignore`
- [ ] `.env.prod` 文件权限为 600
- [ ] JWT_SECRET 是随机生成的强密钥（至少 32 字符）
- [ ] ADMIN_PASSWORD 是强密码（至少 8 字符）
- [ ] SSH 私钥只存在 GitHub Secrets
- [ ] 服务器防火墙只开放必要端口（22080, 22443）
- [ ] 代码中无硬编码的密钥
- [ ] 数据目录权限为 700
