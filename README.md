# PhotoProcessor

PhotoPlus 直播照片自动下载工具 - 使用 Playwright 浏览器自动化技术监控并下载 PhotoPlus 直播网站的照片，自动上传到 Dropbox 云盘。

## 功能特性

- **自动监控**: 定时检查目标直播页面，自动发现新照片
- **智能去重**: 基于指纹算法，避免重复下载
- **云端存储**: 自动上传到 Dropbox，支持多设备访问
- **Web 管理**: 现代化 Web 界面，实时监控下载状态
- **多任务支持**: 同时监控多个直播页面
- **Docker 部署**: 一键部署，无需安装任何依赖

## 快速开始

### 环境要求

- Node.js 22+
- Yarn 4+
- 或 Docker + Docker Compose

### 本地开发

```bash
# 1. 克隆项目
git clone <your-repo-url> photo-processor
cd photo-processor

# 2. 安装依赖
yarn install

# 3. 安装 Playwright 浏览器
cd apps/server && npx playwright install chromium && cd ../..

# 4. 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env 文件，填入配置

# 5. 启动开发服务器
yarn dev
```

访问 http://localhost:5173 打开 Web 界面。

### Docker 部署

```bash
# 1. 配置环境变量
cat > .env << 'EOF'
JWT_SECRET=your-super-secret-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
DROPBOX_APP_KEY=your-dropbox-app-key
DROPBOX_APP_SECRET=your-dropbox-app-secret
EOF

# 2. 启动服务
docker compose up -d

# 3. 查看日志
docker compose logs -f
```

访问 http://localhost 打开 Web 界面。

## 使用指南

### 1. 登录系统

使用配置的管理员账号登录：
- 默认用户名: `admin`
- 默认密码: `admin123`（请在生产环境中修改）

### 2. 连接 Dropbox

1. 进入 **设置** → **Dropbox 设置**
2. 点击 **连接 Dropbox**
3. 在 Dropbox 授权页面点击 **允许**
4. 授权成功后返回应用

> **注意**: 首次使用需要在 [Dropbox Developer Console](https://www.dropbox.com/developers/apps) 创建应用并添加 Redirect URI。

### 3. 创建下载任务

1. 进入 **任务管理**
2. 点击 **新建任务**
3. 填写任务信息：
   - **任务名称**: 自定义名称
   - **目标 URL**: PhotoPlus 直播页面地址
   - **Dropbox 路径**: 照片保存位置（如 `/PhotoPlus/婚礼`）
   - **检查间隔**: 多久检查一次新照片（秒）
4. 点击 **创建**

### 4. 启动任务

1. 在任务列表中点击 **启动**
2. 系统将自动：
   - 打开浏览器访问目标页面
   - 扫描所有照片
   - 下载新照片并上传到 Dropbox
   - 按设定间隔重复检查

### 5. 查看下载历史

在 **照片** 页面可以查看所有已下载的照片记录。

## 项目结构

```
photo-processor/
├── apps/
│   ├── server/              # 后端服务
│   │   ├── src/
│   │   │   ├── routes/      # API 路由
│   │   │   ├── services/    # 业务服务
│   │   │   ├── db/          # 数据库
│   │   │   └── middleware/  # 中间件
│   │   └── Dockerfile
│   └── web/                 # 前端应用
│       ├── src/
│       │   ├── pages/       # 页面组件
│       │   ├── components/  # 通用组件
│       │   ├── stores/      # Pinia 状态
│       │   └── lib/         # 工具库
│       └── Dockerfile
├── packages/
│   └── shared/              # 共享代码
│       └── src/
│           ├── types/       # TypeScript 类型
│           └── utils/       # 工具函数
├── nginx/                   # Nginx 配置
├── docs/                    # 文档
├── docker-compose.yml       # Docker 编排
└── turbo.json              # Turborepo 配置
```

## 技术栈

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
| **反向代理** | Nginx |

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 后端端口 | `3000` |
| `JWT_SECRET` | JWT 签名密钥 | - |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `changeme` |
| `DROPBOX_APP_KEY` | Dropbox App Key | - |
| `DROPBOX_APP_SECRET` | Dropbox App Secret | - |
| `DROPBOX_REDIRECT_URI` | OAuth 回调地址 | `http://localhost:3000/api/dropbox/callback` |
| `DATABASE_PATH` | SQLite 数据库路径 | `./data/app.db` |

### Dropbox 应用配置

1. 访问 [Dropbox Developer Console](https://www.dropbox.com/developers/apps)
2. 创建新应用，选择 "Scoped access" 和 "Full Dropbox"
3. 在 Permissions 中启用:
   - `files.metadata.read`
   - `files.content.write`
   - `files.content.read`
4. 在 Settings 中添加 Redirect URI:
   - 开发环境: `http://localhost:3000/api/dropbox/callback`
   - 生产环境: `https://yourdomain.com/api/dropbox/callback`

## 常用命令

```bash
# 开发
yarn dev              # 启动所有开发服务器
yarn dev:server       # 仅启动后端
yarn dev:web          # 仅启动前端

# 构建
yarn build            # 构建所有包
yarn build:server     # 仅构建后端
yarn build:web        # 仅构建前端

# Docker
docker compose up -d          # 启动服务
docker compose down           # 停止服务
docker compose logs -f        # 查看日志
docker compose build --no-cache  # 重新构建镜像
```

## 常见问题

### Q: 照片提取失败怎么办？

1. 检查目标 URL 是否正确
2. 网站 DOM 结构可能已变化，需要更新选择器
3. 增加等待时间配置

### Q: Dropbox 上传失败？

1. 检查 Dropbox 连接状态
2. 确认 App 权限已正确配置
3. 检查 Dropbox 存储空间

### Q: 如何重新下载所有照片？

删除对应任务的下载历史记录，或创建新任务。

### Q: Docker 部署后无法访问？

1. 检查端口是否被占用
2. 检查防火墙设置
3. 查看容器日志: `docker compose logs`

## 更多文档

- [开发者指南](./docs/DEVELOPMENT.md) - 架构详解、API 文档、调试指南
- [部署指南](./docs/DEPLOYMENT.md) - 生产环境部署详细步骤
- [API 文档](./docs/API.md) - 完整的 API 接口文档

## 许可证

MIT License
