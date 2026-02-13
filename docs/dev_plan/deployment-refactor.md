# Photo-Processor 部署方案重构计划

## Context

经过多次部署失败后，对整个部署管线进行了全面代码审查，发现了 **7 个严重 Bug**，其中 3 个是致命的（直接导致部署必定失败）。当前部署方案存在根本性的架构问题，需要系统性重构才能成功部署到 2 核 6GB Ubuntu 服务器。

---

## 发现的严重问题

### 致命 Bug（必定导致部署失败）

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| **B1** | 原生模块跨平台编译不兼容 | `apps/server/Dockerfile.prod` | Builder 用 Alpine (musl)，Production 用 Ubuntu (glibc)。`better-sqlite3` 的 C++ 原生二进制在 glibc 上无法加载，服务端启动即崩溃 |
| **B2** | GitHub Actions 健康检查逻辑错误 | `.github/workflows/deploy.yml` | 工作流设计为"仅拉取镜像"，但健康检查步骤期望容器已运行，逻辑矛盾 |
| **B3** | Let's Encrypt 证书无法颁发 | `caddy/Caddyfile` | 使用非标准端口 22080/22443，但 ACME HTTP-01 挑战要求 CA 访问端口 80，证书颁发失败，HTTPS 不可用 |

### 高优先级 Bug

| # | 问题 | 文件 | 说明 |
|---|------|------|------|
| **B4** | 本地 deploy.sh 构建失败 | `deploy.sh` | 对使用 `image:` 的 compose 文件执行 `docker compose build`，无 build context |
| **B5** | Web 容器健康检查失败 | `apps/web/Dockerfile.caddy` + `caddy/Caddyfile` | HTTP 端口只做重定向，`/health` 仅在 HTTPS 块中定义，wget 到 HTTP 端口得不到 200 |
| **B6** | Node.js 版本冲突 | `apps/server/Dockerfile.prod` | Playwright 镜像自带 Node 18，又在上面安装 Node 22，native module ABI 不兼容 |
| **B7** | Playwright npm 包跨平台 | `apps/server/Dockerfile.prod` | Playwright 在 Alpine 安装的 driver 二进制在 Ubuntu 不可用 |

---

## 实施方案

### 阶段 1：修复 Server Dockerfile（解决 B1 + B6 + B7）

**文件：** `apps/server/Dockerfile.prod`

**核心变更：** 使用 Playwright 镜像同时作为 builder 和 production 基础，确保原生模块二进制精确匹配。

- Builder 阶段从 `node:22.13.1-alpine` 改为 `mcr.microsoft.com/playwright:v1.49.0-jammy`
- 删除 Node.js 22 安装步骤（使用 Playwright 镜像自带的 Node 18）
- 添加 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`（builder 阶段跳过浏览器下载）
- 添加 `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`（production 使用预装浏览器）
- 添加 `python3 make g++` 构建工具（编译 better-sqlite3）

> Node 18 兼容性确认：项目使用 ES2022 target + ESM modules，所有依赖（Hono、jose、ws、better-sqlite3）均兼容 Node 18。

### 阶段 2：切换到标准端口（解决 B3）

**文件：** `caddy/Caddyfile`、`docker-compose.prod.yml`、`.env.prod.example`

**核心变更：** 从非标准端口 22080/22443 切换到标准端口 80/443。

- Caddyfile 移除 `http_port 22080` 和 `https_port 22443`
- `docker-compose.prod.yml` 端口映射改为 `80:80` 和 `443:443`
- 所有 URL 引用移除 `:22443` 后缀（环境变量、Dropbox 回调地址等）

> 如果服务器上端口 80/443 已被占用，需要先停止占用服务，或改用反向代理方案。

### 阶段 3：修复 Web 健康检查（解决 B5）

**文件：** `caddy/Caddyfile`、`apps/web/Dockerfile.caddy`

**核心变更：**

- Caddyfile 在 HTTP 块中添加 `/health` 端点（在重定向之前处理）
- Dockerfile.caddy 健康检查改为 `http://localhost:80/health`
- EXPOSE 端口改为 `80 443`

### 阶段 4：修复 GitHub Actions 工作流（解决 B2）

**文件：** `.github/workflows/deploy.yml`

**核心变更（保持手动启动策略）：**

- GitHub Actions 职责：构建镜像 → 推送 GHCR → SSH 拉取镜像（**不启动容器**）
- 移除或修改健康检查步骤：改为仅验证镜像拉取成功，不检查容器运行状态
- 部署摘要中明确提示"请 SSH 到服务器手动执行 `./start.sh` 启动服务"
- 更新所有 URL 引用（移除端口后缀）

### 阶段 5：修复本地部署脚本（解决 B4）

**文件：** `deploy.sh`

**核心变更：**

- 将 `docker compose build` 改为显式 `docker build` 命令
- 使用 `SERVER_IMAGE=local` 和 `WEB_IMAGE=local` 环境变量传递给 compose

### 阶段 6：更新所有 URL 引用

**文件：** `.env.prod.example`、`scripts/server-setup.sh`、`scripts/start.sh`

- 移除所有 `:22080` 和 `:22443` 端口后缀
- 防火墙规则从 `22080/22443` 改为 `80/443`

### 阶段 7：调整资源限制

**文件：** `docker-compose.prod.yml`

- Server 容器：CPU 1.5 / Memory 4GB（Playwright + Chromium 需要足够内存）
- Web 容器：CPU 0.5 / Memory 256MB
- 留约 1.7GB 给系统和 Docker daemon

---

## 修改文件清单

| 文件 | 变更类型 | 解决 Bug |
|------|---------|----------|
| `apps/server/Dockerfile.prod` | 重写 | B1, B6, B7 |
| `caddy/Caddyfile` | 重写 | B3, B5 |
| `docker-compose.prod.yml` | 大幅修改 | B3, 资源限制 |
| `.github/workflows/deploy.yml` | 修改 | B2, URL 更新 |
| `deploy.sh` | 修改 | B4 |
| `apps/web/Dockerfile.caddy` | 修改 | B5 |
| `.env.prod.example` | 修改 | URL 更新 |
| `scripts/server-setup.sh` | 修改 | URL 更新, 端口 |
| `scripts/start.sh` | 小修改 | URL 更新 |

---

## 验证方案

### 本地验证
1. 在本地执行 `docker build -f apps/server/Dockerfile.prod -t test-server .` 验证构建成功
2. `docker run --rm test-server node -e "require('better-sqlite3')"` 验证原生模块加载
3. `docker run --rm test-server node dist/index.js` 验证服务启动（会因缺少环境变量退出，但不应有模块加载错误）

### 服务器验证
1. 确认端口 80/443 可用：`ssh server "ss -tlnp | grep ':80\|:443'"`
2. 确认 DNS 已指向服务器：`dig photo.wangdake.de`
3. 推送代码后手动触发 GitHub Actions workflow
4. 检查 Actions 日志确认 build + push + pull 全部成功
5. SSH 到服务器，手动执行 `./start.sh` 启动容器
6. 访问 `https://photo.wangdake.de` 验证 HTTPS 证书和页面加载
7. 登录管理后台，创建测试任务验证 Playwright 功能

### 健康检查验证
```bash
ssh server "docker compose -f docker-compose.prod.yml ps"
# 两个容器都应显示 (healthy)
ssh server "curl -s http://localhost:22000/health"
# 应返回 {"status":"ok","timestamp":"..."}
```
