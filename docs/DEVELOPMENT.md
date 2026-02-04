# 开发者指南

本文档面向希望理解、修改或扩展 PhotoProcessor 的开发者。

## 目录

- [架构概述](#架构概述)
- [核心服务](#核心服务)
- [数据流](#数据流)
- [数据库设计](#数据库设计)
- [调试指南](#调试指南)
- [扩展开发](#扩展开发)

---

## 架构概述

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         客户端层                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Vue 3 SPA (Naive UI + TailwindCSS + Pinia)             │   │
│  │  - 任务管理界面                                          │   │
│  │  - 实时状态监控                                          │   │
│  │  - 下载历史查看                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         服务端层                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Hono Web Framework                                      │   │
│  │  ├── REST API (/api/*)                                  │   │
│  │  ├── WebSocket (/ws)                                    │   │
│  │  └── 认证中间件 (JWT)                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  核心服务                                                │   │
│  │  ├── TaskManager - 任务调度和生命周期管理                 │   │
│  │  ├── PhotoExtractor - Playwright 浏览器自动化            │   │
│  │  ├── PhotoDownloader - 图片下载和上传                    │   │
│  │  └── DropboxService - Dropbox SDK 封装                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  数据层                                                  │   │
│  │  └── SQLite (better-sqlite3)                            │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         外部服务                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────┐    │
│  │  PhotoPlus 网站   │  │  Dropbox API                     │    │
│  │  (目标数据源)     │  │  (云存储)                        │    │
│  └──────────────────┘  └──────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Monorepo 结构

```
photo-processor/
├── apps/
│   ├── server/                 # @photo-processor/server
│   │   ├── src/
│   │   │   ├── index.ts       # 入口文件
│   │   │   ├── routes/        # API 路由
│   │   │   │   ├── auth.ts    # 认证路由
│   │   │   │   ├── task.ts    # 任务路由
│   │   │   │   ├── photo.ts   # 照片路由
│   │   │   │   └── dropbox.ts # Dropbox OAuth 路由
│   │   │   ├── services/      # 业务服务
│   │   │   │   ├── task-manager.service.ts
│   │   │   │   ├── extractor.service.ts
│   │   │   │   ├── downloader.service.ts
│   │   │   │   ├── dropbox.service.ts
│   │   │   │   └── websocket.service.ts
│   │   │   ├── db/            # 数据库
│   │   │   │   ├── index.ts   # 数据库初始化
│   │   │   │   └── migrations.ts
│   │   │   └── middleware/    # 中间件
│   │   │       └── auth.ts    # JWT 认证
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   └── web/                    # @photo-processor/web
│       ├── src/
│       │   ├── main.ts        # Vue 入口
│       │   ├── App.vue
│       │   ├── pages/         # 页面组件
│       │   │   ├── Dashboard.vue
│       │   │   ├── Tasks.vue
│       │   │   ├── TaskDetail.vue
│       │   │   ├── Photos.vue
│       │   │   ├── Settings.vue
│       │   │   └── Login.vue
│       │   ├── components/    # 通用组件
│       │   ├── stores/        # Pinia 状态管理
│       │   │   ├── auth.ts
│       │   │   └── task.ts
│       │   ├── router/        # Vue Router
│       │   └── lib/           # 工具库
│       │       └── api.ts     # API 客户端
│       ├── package.json
│       └── Dockerfile
│
├── packages/
│   └── shared/                 # @photo-processor/shared
│       └── src/
│           ├── types/         # 共享类型定义
│           │   ├── task.ts
│           │   ├── photo.ts
│           │   ├── api.ts
│           │   └── index.ts
│           └── utils/         # 共享工具函数
│               ├── url.ts     # URL 处理
│               └── format.ts  # 格式化工具
│
├── nginx/                      # Nginx 配置
│   └── nginx.conf
├── docker-compose.yml
├── turbo.json                  # Turborepo 配置
└── package.json                # 根 package.json
```

---

## 核心服务

### 1. TaskManager (`task-manager.service.ts`)

任务管理器是系统的核心调度器，负责：

- 任务生命周期管理（启动/停止）
- 周期性检查调度
- 事件发布（WebSocket 通知）
- 下载记录持久化

```typescript
// 关键方法
class TaskManager {
  // 启动任务
  async startTask(taskId: number): Promise<void>

  // 停止任务
  async stopTask(taskId: number, reason?: string): Promise<void>

  // 获取任务状态
  getTaskStatus(taskId: number): TaskRuntimeStatus | null

  // 主循环（私有）
  private async runTaskLoop(task: RunningTask): Promise<void>
}
```

**任务循环流程：**

```
┌─────────────────┐
│   启动任务      │
└────────┬────────┘
         ▼
┌─────────────────┐
│   导航到目标URL │
└────────┬────────┘
         ▼
┌─────────────────┐◄──────────────────────┐
│   刷新页面      │                       │
└────────┬────────┘                       │
         ▼                                │
┌─────────────────┐                       │
│ 提取照片指纹    │                       │
└────────┬────────┘                       │
         ▼                                │
┌─────────────────┐                       │
│ 过滤已下载照片  │                       │
└────────┬────────┘                       │
         ▼                                │
    ┌────┴────┐                           │
    │有新照片？│                           │
    └────┬────┘                           │
    Yes  │  No                            │
         ▼                                │
┌─────────────────┐                       │
│ 点击提取原图URL │                       │
└────────┬────────┘                       │
         ▼                                │
┌─────────────────┐                       │
│ 下载并上传Dropbox│                      │
└────────┬────────┘                       │
         ▼                                │
┌─────────────────┐                       │
│ 等待检查间隔    │───────────────────────┘
└─────────────────┘
```

### 2. PhotoExtractor (`extractor.service.ts`)

基于 Playwright 的浏览器自动化服务：

```typescript
class PhotoExtractor {
  // 初始化浏览器
  async initialize(): Promise<void>

  // 导航到 URL
  async navigateTo(url: string): Promise<void>

  // 刷新页面
  async refresh(): Promise<void>

  // 快速扫描所有照片指纹（不点击）
  async extractFingerprints(): Promise<PhotoInfo[]>

  // 点击提取原图 URL
  async extractPhotoUrls(targetFingerprints: string[]): Promise<PhotoWithUrl[]>

  // 关闭浏览器
  async close(): Promise<void>
}
```

**DOM 选择器配置：**

```typescript
const DEFAULT_SELECTORS = {
  photoItem: 'div.photo-content.container li.photo-item',  // 照片列表项
  photoClick: 'span',                                       // 点击元素
  viewOriginal: 'div.operate-buttons li.row-all-center a', // 原图链接
};
```

### 3. PhotoDownloader (`downloader.service.ts`)

负责下载图片并上传到 Dropbox：

```typescript
class PhotoDownloader {
  constructor(dropboxPath: string, events?: DownloaderEvents)

  // 下载单张照片
  async downloadPhoto(photo: PhotoWithUrl): Promise<DownloadResult>

  // 批量下载
  async downloadPhotos(photos: PhotoWithUrl[]): Promise<BatchResult>
}
```

**重试机制：**
- 最大重试次数：5 次
- 重试延迟：2000ms（指数退避）

### 4. DropboxService (`dropbox.service.ts`)

Dropbox SDK 封装，支持自动令牌刷新：

```typescript
class DropboxService {
  // 检查连接状态
  isConnected(): boolean

  // 上传文件
  async uploadFile(path: string, data: Buffer): Promise<UploadResult>

  // 确保文件夹存在
  async ensureFolder(path: string): Promise<boolean>

  // 列出文件夹内容
  async listFolder(path: string): Promise<Set<string>>

  // 获取账户信息
  async getAccountInfo(): Promise<AccountInfo | null>
}
```

### 5. WebSocket Service (`websocket.service.ts`)

实时事件推送：

```typescript
// 事件类型
type WebSocketEvent =
  | { type: 'task:started'; taskId: number }
  | { type: 'task:stopped'; taskId: number; reason: string }
  | { type: 'scan:started'; taskId: number }
  | { type: 'scan:completed'; taskId: number; newPhotos: number; totalPhotos: number }
  | { type: 'download:started'; taskId: number; fingerprint: string }
  | { type: 'download:completed'; taskId: number; fingerprint: string; filename: string }
  | { type: 'download:failed'; taskId: number; fingerprint: string; error: string }
  | { type: 'task:error'; taskId: number; error: string }
```

---

## 数据流

### 照片提取流程

```
PhotoPlus 网站
      │
      │ 1. Playwright 访问页面
      ▼
┌─────────────────┐
│  滚动加载照片    │ ← scrollToLoadAll()
└────────┬────────┘
         │ 2. 获取缩略图 URL
         ▼
┌─────────────────┐
│  提取指纹       │ ← extractFingerprintFromUrl()
│  (从缩略图URL)  │    去除 CDN 后缀，提取唯一标识
└────────┬────────┘
         │ 3. 对比数据库
         ▼
┌─────────────────┐
│  过滤已下载     │ ← isDownloaded()
└────────┬────────┘
         │ 4. 点击新照片
         ▼
┌─────────────────┐
│  获取原图 URL   │ ← extractPhotoUrls()
│  (点击照片详情)  │    从 href 属性获取
└────────┬────────┘
         │ 5. 下载图片
         ▼
┌─────────────────┐
│  HTTP GET 下载  │ ← fetch()
│  到内存 Buffer  │
└────────┬────────┘
         │ 6. 上传 Dropbox
         ▼
┌─────────────────┐
│  Dropbox SDK    │ ← filesUpload()
│  上传文件       │
└────────┬────────┘
         │ 7. 记录数据库
         ▼
┌─────────────────┐
│  SQLite 保存    │ ← saveDownloadRecord()
│  下载历史       │
└─────────────────┘
```

### 指纹提取算法

```typescript
// 输入: //pb.plusx.cn/plus/immediate/35272685/2025111623814917/1060536x354blur2.jpg~tplv-xxx
// 输出: 1060536x354blur2.jpg

function extractFingerprintFromUrl(url: string): string {
  // 1. 规范化 URL (// → https://)
  // 2. 移除查询参数 (?)
  // 3. 移除 CDN 后缀 (~tplv-xxx)
  // 4. 提取最后一段路径作为指纹
}
```

---

## 数据库设计

### 表结构

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

-- 索引
CREATE INDEX idx_download_history_task_id ON download_history(task_id);
CREATE INDEX idx_download_history_fingerprint ON download_history(fingerprint);
```

---

## 调试指南

### 1. 查看后端日志

```bash
# 开发模式
yarn dev:server

# 日志格式
[2026-02-04T12:00:00.000Z] [Extractor] Scrolling to load all photos...
[2026-02-04T12:00:02.000Z] [Extractor] ✓ Scroll complete: 4x, 10 photos total
[2026-02-04T12:00:02.000Z] [Downloader] [1/3] Downloading: photo1.jpg
```

### 2. 非无头模式调试

修改任务的 `browserHeadless` 为 `false`，可以看到浏览器实际操作：

```bash
# 通过 API 更新
curl -X PUT http://localhost:3000/api/tasks/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"browserHeadless": false}'
```

### 3. 数据库调试

```bash
# 连接数据库
sqlite3 apps/server/data/app.db

# 查看任务
SELECT * FROM task_configs;

# 查看下载历史
SELECT * FROM download_history ORDER BY id DESC LIMIT 10;

# 清除任务下载历史（重新下载）
DELETE FROM download_history WHERE task_id = 1;
```

### 4. WebSocket 调试

使用浏览器开发者工具：

```javascript
// 在控制台连接 WebSocket
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### 5. 常见问题排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 照片不下载 | 已存在于数据库 | 清除 download_history |
| 上传失败 400 | 文件名含非法字符 | 检查 sanitizeFilename |
| Playwright 超时 | 网络慢/选择器变化 | 增加 timeout/更新选择器 |
| Dropbox 401 | Token 过期 | 重新连接 Dropbox |

---

## 扩展开发

### 添加新的存储后端

1. 创建新的 service：

```typescript
// apps/server/src/services/s3.service.ts
export class S3Service {
  async uploadFile(path: string, data: Buffer): Promise<UploadResult> {
    // 实现 S3 上传
  }
}
```

2. 修改 `downloader.service.ts` 使用新服务

### 支持新的网站

1. 分析目标网站 DOM 结构
2. 确定选择器：
   - 照片列表选择器
   - 点击元素选择器
   - 原图链接选择器
3. 创建任务时使用自定义选择器

### 添加新的 API 端点

```typescript
// apps/server/src/routes/new-feature.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

export const newFeatureRoutes = new Hono();

newFeatureRoutes.get('/endpoint', authMiddleware, async (c) => {
  // 实现逻辑
  return c.json({ success: true, data: {} });
});
```

在 `index.ts` 中注册：

```typescript
import { newFeatureRoutes } from './routes/new-feature.js';
app.route('/api/new-feature', newFeatureRoutes);
```

---

## 代码规范

### TypeScript

- 使用严格模式
- 所有函数必须有类型注解
- 使用 `interface` 定义数据结构
- 共享类型放在 `packages/shared`

### 命名规范

- 文件名：`kebab-case.ts`
- 类名：`PascalCase`
- 函数/变量：`camelCase`
- 常量：`UPPER_SNAKE_CASE`

### 错误处理

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Operation failed:', message);
  throw new Error(`具体的错误描述: ${message}`);
}
```

---

## 相关文档

- [API 文档](./API.md)
- [部署指南](./DEPLOYMENT.md)
