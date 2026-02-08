# Photo-Processor 代码地图

> 此文件为 AI 助手提供项目上下文，帮助快速理解代码结构和开发规范。

## 项目概述

PhotoPlus 直播照片自动下载工具 - 使用 Playwright 浏览器自动化技术监控并下载 PhotoPlus 直播网站的照片，自动上传到 Dropbox 云盘。

### 技术栈

| 类别 | 技术 |
|------|------|
| **Monorepo** | Yarn 4 Workspaces + Turborepo |
| **后端框架** | Hono (轻量级 Web 框架) |
| **浏览器自动化** | Playwright |
| **前端框架** | Vue 3 + Vite |
| **UI 组件库** | Naive UI |
| **样式** | TailwindCSS |
| **状态管理** | Pinia |
| **数据库** | SQLite (better-sqlite3) |
| **认证** | JWT (jose) |
| **云存储** | Dropbox SDK |
| **容器化** | Docker + Docker Compose |
| **反向代理** | Caddy (自动 HTTPS) |
| **CI/CD** | GitHub Actions + GHCR |

---

## 目录结构

```
photo-processor/
├── apps/
│   ├── server/                 # @photo-processor/server - 后端服务
│   │   ├── src/
│   │   │   ├── index.ts       # 入口文件，Hono 应用初始化
│   │   │   ├── routes/        # API 路由
│   │   │   │   ├── auth.ts    # 认证路由 (登录/登出/用户信息)
│   │   │   │   ├── task.ts    # 任务管理路由 (CRUD/启动/停止)
│   │   │   │   ├── photo.ts   # 照片/下载历史路由
│   │   │   │   └── dropbox.ts # Dropbox OAuth 路由
│   │   │   ├── services/      # 业务服务
│   │   │   │   ├── task-manager.service.ts  # 任务调度核心
│   │   │   │   ├── extractor.service.ts     # Playwright 提取器
│   │   │   │   ├── downloader.service.ts    # 图片下载上传
│   │   │   │   └── dropbox.service.ts       # Dropbox SDK 封装
│   │   │   ├── ws/            # WebSocket
│   │   │   │   └── handler.ts # 实时事件推送
│   │   │   ├── db/            # 数据库
│   │   │   │   └── index.ts   # SQLite 初始化和查询
│   │   │   ├── middleware/    # 中间件
│   │   │   │   └── auth.ts    # JWT 认证中间件
│   │   │   └── utils/         # 工具函数
│   │   │       └── retry.ts   # 重试逻辑
│   │   ├── Dockerfile         # 开发环境 Docker
│   │   ├── Dockerfile.prod    # 生产环境 Docker (含 Playwright)
│   │   └── package.json
│   │
│   └── web/                    # @photo-processor/web - 前端应用
│       ├── src/
│       │   ├── main.ts        # Vue 入口
│       │   ├── App.vue
│       │   ├── pages/         # 页面组件
│       │   │   ├── Dashboard.vue   # 仪表盘
│       │   │   ├── Tasks.vue       # 任务列表
│       │   │   ├── TaskDetail.vue  # 任务详情
│       │   │   ├── TaskLogs.vue    # 任务日志
│       │   │   ├── Photos.vue      # 下载历史
│       │   │   ├── Settings.vue    # 设置页面
│       │   │   ├── DropboxSettings.vue # Dropbox 配置
│       │   │   └── Login.vue       # 登录页面
│       │   ├── components/    # 通用组件
│       │   │   └── layout/
│       │   │       └── MainLayout.vue
│       │   ├── stores/        # Pinia 状态管理
│       │   │   ├── auth.ts    # 认证状态
│       │   │   └── task.ts    # 任务状态
│       │   ├── hooks/         # 组合式函数
│       │   │   └── useWebSocket.ts # WebSocket 连接
│       │   ├── router/        # Vue Router
│       │   │   └── index.ts
│       │   └── lib/           # 工具库
│       │       └── api.ts     # API 客户端
│       ├── Dockerfile.caddy   # 生产环境 Docker (含 Caddy)
│       └── package.json
│
├── packages/
│   └── shared/                 # @photo-processor/shared - 共享代码
│       └── src/
│           ├── types/         # 共享类型定义
│           │   ├── task.ts    # 任务类型
│           │   ├── photo.ts   # 照片类型
│           │   └── api.ts     # API 响应类型
│           └── utils/         # 共享工具函数
│               ├── url.ts     # URL 处理、指纹提取
│               └── format.ts  # 格式化工具
│
├── caddy/                      # Caddy 反向代理配置
│   └── Caddyfile              # 生产环境配置
│
├── scripts/                    # 部署脚本
│   ├── server-setup.sh        # 服务器首次设置
│   ├── server-deploy.sh       # 拉取镜像脚本
│   ├── start.sh               # 启动服务
│   └── stop.sh                # 停止服务
│
├── docs/                       # 文档
│   ├── DEPLOYMENT.md          # 部署指南
│   ├── DEVELOPMENT.md         # 开发者指南
│   └── API.md                 # API 文档
│
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions 部署工作流
│
├── docker-compose.yml         # 开发环境
├── docker-compose.prod.yml    # 生产环境
├── deploy.sh                  # 本地部署脚本
├── .dockerignore              # Docker 构建忽略
├── .env.prod.example          # 生产环境变量模板
├── turbo.json                 # Turborepo 配置
├── tsconfig.base.json         # TypeScript 基础配置
└── package.json               # 根 package.json
```

---

## 核心服务说明

### 1. TaskManager (`apps/server/src/services/task-manager.service.ts`)

任务管理器是系统的核心调度器：

- **职责**：任务生命周期管理、周期性检查调度、事件发布
- **关键方法**：
  - `startTask(taskId)` - 启动任务
  - `stopTask(taskId, reason?)` - 停止任务
  - `getTaskStatus(taskId)` - 获取运行时状态

### 2. PhotoExtractor (`apps/server/src/services/extractor.service.ts`)

基于 Playwright 的浏览器自动化：

- **职责**：页面导航、照片指纹提取、原图 URL 获取
- **关键方法**：
  - `extractFingerprints()` - 快速扫描所有照片指纹
  - `extractPhotoUrls(fingerprints)` - 点击获取原图 URL

### 3. PhotoDownloader (`apps/server/src/services/downloader.service.ts`)

图片下载和上传：

- **职责**：HTTP 下载图片、上传到 Dropbox
- **重试机制**：最大 5 次，指数退避

### 4. DropboxService (`apps/server/src/services/dropbox.service.ts`)

Dropbox SDK 封装：

- **职责**：OAuth 认证、文件上传、令牌刷新
- **自动刷新**：Access token 过期时自动刷新

---

## 数据库表结构

```sql
-- 用户表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 任务配置表
CREATE TABLE task_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  check_interval INTEGER DEFAULT 60,
  selectors TEXT,                    -- JSON: {photoItem, photoClick, viewOriginal}
  browser_headless INTEGER DEFAULT 1,
  browser_timeout INTEGER DEFAULT 30000,
  dropbox_path TEXT NOT NULL,
  is_active INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Dropbox 凭据表
CREATE TABLE dropbox_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  refresh_token TEXT NOT NULL,
  account_id TEXT,
  account_name TEXT,
  account_email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 下载历史表
CREATE TABLE download_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  thumbnail_url TEXT,
  dropbox_path TEXT,
  file_size INTEGER,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES task_configs(id),
  UNIQUE(task_id, fingerprint)
);
```

---

## API 端点

### 认证
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户
- `POST /api/auth/logout` - 用户登出

### 任务管理
- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/:id` - 获取单个任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务
- `POST /api/tasks/:id/start` - 启动任务
- `POST /api/tasks/:id/stop` - 停止任务
- `GET /api/tasks/:id/status` - 获取运行状态

### 照片
- `GET /api/photos` - 获取下载历史（分页）
- `GET /api/photos/stats` - 获取统计信息

### Dropbox
- `GET /api/dropbox/status` - 获取连接状态
- `GET /api/dropbox/auth-url` - 获取授权 URL
- `GET /api/dropbox/callback` - OAuth 回调
- `POST /api/dropbox/disconnect` - 断开连接

### WebSocket
- `ws://host/ws` - 实时事件推送

---

## 部署配置

### 生产环境端口
- **22080** - HTTP (自动重定向到 HTTPS)
- **22443** - HTTPS (Caddy 自动证书)
- **22000** - 内部 API 端口 (不暴露)

### 环境变量
| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥 (必须 ≥32 字符) |
| `ADMIN_USERNAME` | 管理员用户名 |
| `ADMIN_PASSWORD` | 管理员密码 (必须 ≥8 字符) |
| `DROPBOX_APP_KEY` | Dropbox 应用 Key |
| `DROPBOX_REDIRECT_URI` | OAuth 回调地址 |
| `FRONTEND_URL` | 前端 URL |
| `CORS_ORIGIN` | CORS 允许的源 |

### Docker 镜像
- `ghcr.io/{owner}/photo-processor-server:latest` - 后端 (含 Playwright)
- `ghcr.io/{owner}/photo-processor-web:latest` - 前端 (含 Caddy)

---

## 开发命令

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn dev              # 所有服务
yarn dev:server       # 仅后端
yarn dev:web          # 仅前端

# 构建
yarn build            # 所有包
yarn build:server     # 仅后端
yarn build:web        # 仅前端

# 类型检查
yarn type-check

# Docker 开发
docker compose up -d
docker compose logs -f
```

---

## 注意事项

### 安全
- `.env.prod` 文件必须权限 600，不进 Git
- JWT_SECRET 必须随机生成，至少 32 字符
- 所有密钥通过环境变量注入，不硬编码

### 数据库
- SQLite 数据存储在 `data/app.db`
- 生产环境通过 Docker volume 持久化
- 下载历史使用 (task_id, fingerprint) 唯一索引去重

### Playwright
- 生产镜像使用 `mcr.microsoft.com/playwright:v1.49.0-jammy`
- 默认使用 Chromium headless 模式
- 可通过任务配置切换到有头模式调试

### WebSocket
- 连接地址：`wss://domain:22443/ws`
- 事件类型：`task:started`, `task:stopped`, `scan:*`, `download:*`, `task:error`
- 前端通过 `useWebSocket` hook 管理连接

---

## 最近更新 (2026-02-08)

### 代码审查修复
- ✅ [C-1] SSH 密钥处理改用 ssh-agent action
- ✅ [C-2] .env.prod.example 移除默认值，强制用户设置
- ✅ [C-3] 数据目录挂载改为整个目录
- ✅ [H-2] 添加容器资源限制 (CPU/Memory)
- ✅ [H-3] GitHub Actions 添加部署后健康检查
- ✅ [H-4] 脚本添加错误处理和确认步骤
- ✅ [M-1] Dockerfile 使用固定版本号
- ✅ [M-6] 部署脚本添加备份和回滚机制
- ✅ [M-7] 创建 .dockerignore 优化构建
- ✅ [M-8] Caddyfile 启用 Let's Encrypt 生产证书

### 文档更新
- ✅ 更新部署指南，添加调试章节
- ✅ 添加"更新代码后重新部署"说明
- ✅ 添加回滚操作指南
- ✅ 更新安全清单
