# API 文档

PhotoProcessor REST API 完整文档。

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json`

## 认证

除了登录接口外，所有 API 都需要在请求头中携带 JWT Token：

```
Authorization: Bearer <token>
```

---

## 响应格式

所有 API 返回统一的响应格式：

### 成功响应

```json
{
  "success": true,
  "data": { ... }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "错误描述"
}
```

### 分页响应

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

---

## 认证 API

### POST /api/auth/login

用户登录，获取 JWT Token。

**请求体：**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "username": "admin",
      "createdAt": "2026-02-04 01:48:34"
    },
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "expiresAt": "2026-02-11T01:50:06.836Z"
  }
}
```

### GET /api/auth/me

获取当前登录用户信息。

**响应：**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "createdAt": "2026-02-04 01:48:34"
  }
}
```

### POST /api/auth/logout

用户登出（客户端清除 Token）。

**响应：**

```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

---

## 任务 API

### GET /api/tasks

获取所有任务列表。

**响应：**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "婚礼照片下载",
      "targetUrl": "https://live.photoplus.cn/live/pc/12345/#/live",
      "checkInterval": 60,
      "selectors": {
        "photoItem": "div.photo-content.container li.photo-item",
        "photoClick": "span",
        "viewOriginal": "div.operate-buttons li.row-all-center a"
      },
      "browserHeadless": true,
      "browserTimeout": 30000,
      "dropboxPath": "/PhotoPlus/wedding",
      "isActive": true,
      "createdAt": "2026-02-04 10:00:00",
      "updatedAt": "2026-02-04 10:00:00"
    }
  ]
}
```

### GET /api/tasks/:id

获取单个任务详情。

**响应：**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "婚礼照片下载",
    "targetUrl": "https://live.photoplus.cn/live/pc/12345/#/live",
    "checkInterval": 60,
    "selectors": {
      "photoItem": "div.photo-content.container li.photo-item",
      "photoClick": "span",
      "viewOriginal": "div.operate-buttons li.row-all-center a"
    },
    "browserHeadless": true,
    "browserTimeout": 30000,
    "dropboxPath": "/PhotoPlus/wedding",
    "isActive": false,
    "createdAt": "2026-02-04 10:00:00",
    "updatedAt": "2026-02-04 10:00:00"
  }
}
```

### POST /api/tasks

创建新任务。

**请求体：**

```json
{
  "name": "婚礼照片下载",
  "targetUrl": "https://live.photoplus.cn/live/pc/12345/#/live",
  "dropboxPath": "/PhotoPlus/wedding",
  "checkInterval": 60,
  "selectors": {
    "photoItem": "div.photo-content.container li.photo-item",
    "photoClick": "span",
    "viewOriginal": "div.operate-buttons li.row-all-center a"
  },
  "browserHeadless": true,
  "browserTimeout": 30000
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| name | string | ✅ | - | 任务名称 |
| targetUrl | string | ✅ | - | 目标页面 URL |
| dropboxPath | string | ✅ | - | Dropbox 保存路径 |
| checkInterval | number | ❌ | 60 | 检查间隔（秒） |
| selectors | object | ❌ | 默认选择器 | DOM 选择器 |
| browserHeadless | boolean | ❌ | true | 无头模式 |
| browserTimeout | number | ❌ | 30000 | 超时时间（毫秒） |

**响应：**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "婚礼照片下载",
    ...
  }
}
```

### PUT /api/tasks/:id

更新任务配置。

**请求体：**

```json
{
  "name": "新名称",
  "checkInterval": 120
}
```

**响应：**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "新名称",
    "checkInterval": 120,
    ...
  }
}
```

### DELETE /api/tasks/:id

删除任务。

**响应：**

```json
{
  "success": true,
  "data": { "message": "Task deleted" }
}
```

### POST /api/tasks/:id/start

启动任务。

**前置条件：**
- Dropbox 已连接

**响应：**

```json
{
  "success": true,
  "data": { "message": "Task started" }
}
```

**错误响应：**

```json
{
  "success": false,
  "error": "Dropbox not connected"
}
```

### POST /api/tasks/:id/stop

停止任务。

**响应：**

```json
{
  "success": true,
  "data": { "message": "Task stopped" }
}
```

### GET /api/tasks/:id/status

获取任务运行时状态。

**响应：**

```json
{
  "success": true,
  "data": {
    "taskId": 1,
    "status": "running",
    "currentCycle": 5,
    "lastCheckAt": "2026-02-04T12:00:00.000Z",
    "nextCheckAt": "2026-02-04T12:01:00.000Z",
    "error": null,
    "stats": {
      "totalPhotos": 0,
      "downloadedPhotos": 25,
      "failedPhotos": 0,
      "lastDownloadAt": "2026-02-04T11:55:00.000Z"
    }
  }
}
```

| status 值 | 说明 |
|-----------|------|
| idle | 空闲（未运行） |
| running | 运行中 |
| error | 错误状态 |

---

## 照片 API

### GET /api/photos

获取下载历史（分页）。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| taskId | number | - | 按任务过滤 |
| page | number | 1 | 页码 |
| pageSize | number | 20 | 每页数量 |

**请求示例：**

```
GET /api/photos?taskId=1&page=1&pageSize=20
```

**响应：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": 1,
        "taskId": 1,
        "fingerprint": "1060536x354blur2.jpg",
        "originalFilename": "photo1.jpg",
        "thumbnailUrl": "https://...",
        "dropboxPath": "/PhotoPlus/wedding/photo1.jpg",
        "fileSize": 35333,
        "downloadedAt": "2026-02-04 10:30:00"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
```

### GET /api/photos/stats

获取全局下载统计。

**响应：**

```json
{
  "success": true,
  "data": {
    "totalDownloaded": 150,
    "todayDownloaded": 25,
    "totalSize": 52428800,
    "lastDownloadAt": "2026-02-04 12:00:00"
  }
}
```

---

## Dropbox API

### GET /api/dropbox/status

获取 Dropbox 连接状态。

**响应：**

```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "accountName": "John Doe",
    "accountEmail": "john@example.com",
    "connectedAt": "2026-02-04 09:00:00"
  }
}
```

### GET /api/dropbox/auth-url

获取 Dropbox OAuth 授权 URL。

**响应：**

```json
{
  "success": true,
  "data": {
    "url": "https://www.dropbox.com/oauth2/authorize?client_id=xxx&...",
    "state": "abc123"
  }
}
```

### GET /api/dropbox/callback

OAuth 回调处理（由 Dropbox 调用）。

**查询参数：**
- `code`: 授权码
- `state`: 状态标识

**响应：**

成功后重定向到前端 `/settings/dropbox?success=true`

### POST /api/dropbox/disconnect

断开 Dropbox 连接。

**响应：**

```json
{
  "success": true,
  "data": { "message": "Dropbox disconnected" }
}
```

---

## WebSocket API

### 连接

```
ws://localhost:3000/ws
```

### 事件类型

#### task:started

任务启动。

```json
{
  "type": "task:started",
  "taskId": 1,
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### task:stopped

任务停止。

```json
{
  "type": "task:stopped",
  "taskId": 1,
  "reason": "User requested",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### scan:started

开始扫描照片。

```json
{
  "type": "scan:started",
  "taskId": 1,
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### scan:completed

扫描完成。

```json
{
  "type": "scan:completed",
  "taskId": 1,
  "newPhotos": 3,
  "totalPhotos": 50,
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### download:started

开始下载照片。

```json
{
  "type": "download:started",
  "taskId": 1,
  "fingerprint": "photo123.jpg",
  "filename": "photo123.jpg",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### download:completed

下载完成。

```json
{
  "type": "download:completed",
  "taskId": 1,
  "fingerprint": "photo123.jpg",
  "filename": "photo123.jpg",
  "dropboxPath": "/PhotoPlus/photo123.jpg",
  "fileSize": 35333,
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### download:failed

下载失败。

```json
{
  "type": "download:failed",
  "taskId": 1,
  "fingerprint": "photo123.jpg",
  "error": "HTTP 404: Not Found",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

#### task:error

任务错误。

```json
{
  "type": "task:error",
  "taskId": 1,
  "error": "Browser crashed",
  "timestamp": "2026-02-04T12:00:00.000Z"
}
```

---

## 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## cURL 示例

### 登录

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

### 创建任务

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Task",
    "targetUrl": "https://live.photoplus.cn/live/pc/12345/#/live",
    "dropboxPath": "/PhotoPlus/test",
    "checkInterval": 60
  }'
```

### 启动任务

```bash
curl -X POST http://localhost:3000/api/tasks/1/start \
  -H "Authorization: Bearer $TOKEN"
```

### 获取任务状态

```bash
curl http://localhost:3000/api/tasks/1/status \
  -H "Authorization: Bearer $TOKEN"
```
