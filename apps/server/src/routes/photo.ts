import { Hono } from 'hono';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ApiResponse, Photo, PaginatedResponse, PhotoStats } from '@photo-processor/shared';

export const photoRoutes = new Hono();

// Apply auth middleware
photoRoutes.use('*', authMiddleware);

// Get download history with pagination
photoRoutes.get('/', (c) => {
  try {
    const page = parseInt(c.req.query('page') || '1', 10);
    const pageSize = parseInt(c.req.query('pageSize') || '20', 10);
    const taskId = c.req.query('taskId');
    const status = c.req.query('status'); // 'success' | 'failed' | undefined (all)

    const db = getDatabase();
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (taskId) {
      whereClauses.push('dh.task_id = ?');
      params.push(parseInt(taskId, 10));
    }

    if (status) {
      whereClauses.push('dh.status = ?');
      params.push(status);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countResult = db
      .prepare(`SELECT COUNT(*) as total FROM download_history dh ${whereClause}`)
      .get(...params) as { total: number };

    // Get items with task name
    const items = db
      .prepare(
        `SELECT dh.*, tc.name as task_name FROM download_history dh
        LEFT JOIN task_configs tc ON dh.task_id = tc.id
        ${whereClause}
        ORDER BY dh.downloaded_at DESC
        LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as any[];

    const photos: Photo[] = items.map((item) => ({
      id: item.id,
      taskId: item.task_id,
      taskName: item.task_name || '未知任务',
      fingerprint: item.fingerprint,
      originalFilename: item.original_filename,
      thumbnailUrl: item.thumbnail_url,
      dropboxPath: item.dropbox_path,
      fileSize: item.file_size,
      status: item.status || 'success',
      errorMessage: item.error_message,
      downloadedAt: item.downloaded_at,
    }));

    const response: PaginatedResponse<Photo> = {
      items: photos,
      total: countResult.total,
      page,
      pageSize,
      totalPages: Math.ceil(countResult.total / pageSize),
    };

    return c.json<ApiResponse<PaginatedResponse<Photo>>>({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Get photos error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get photos' }, 500);
  }
});

// Get photo stats
photoRoutes.get('/stats', (c) => {
  try {
    const db = getDatabase();

    // Total downloaded
    const totalResult = db
      .prepare('SELECT COUNT(*) as total, SUM(file_size) as totalSize FROM download_history')
      .get() as { total: number; totalSize: number | null };

    // Today downloaded
    const todayResult = db
      .prepare(
        `SELECT COUNT(*) as count FROM download_history
        WHERE DATE(downloaded_at) = DATE('now')`
      )
      .get() as { count: number };

    // Last download
    const lastResult = db
      .prepare('SELECT MAX(downloaded_at) as lastDownload FROM download_history')
      .get() as { lastDownload: string | null };

    const stats: PhotoStats = {
      totalDownloaded: totalResult.total,
      todayDownloaded: todayResult.count,
      totalSize: totalResult.totalSize || 0,
      lastDownloadAt: lastResult.lastDownload,
    };

    return c.json<ApiResponse<PhotoStats>>({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Get photo stats error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get photo stats' }, 500);
  }
});
