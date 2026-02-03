# PhotoProcessor

PhotoPlus 直播照片自动下载工具 - 全栈版本

## 技术栈

- **Monorepo**: Yarn Workspaces + Turborepo
- **后端**: Hono + Node.js + Playwright
- **前端**: Vue 3 + Vite + TailwindCSS + Naive UI
- **数据库**: SQLite (better-sqlite3)
- **存储**: Dropbox (PKCE OAuth)

## 项目结构

```
photo-processor/
├── apps/
│   ├── server/          # 后端 API + Playwright
│   └── web/             # Vue 3 前端
├── packages/
│   └── shared/          # 共享类型和工具
├── docker-compose.yml
└── package.json
```

## 开发

```bash
# 安装依赖
yarn install

# 启动开发服务器
yarn dev

# 仅启动后端
yarn dev:server

# 仅启动前端
yarn dev:web
```

## 构建

```bash
# 构建所有
yarn build

# 构建后端
yarn build:server

# 构建前端
yarn build:web
```

## 部署

```bash
# 使用 Docker Compose
docker compose up -d
```
