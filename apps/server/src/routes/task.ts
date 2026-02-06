import { Hono } from 'hono';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { getTaskManager } from '../services/task-manager.service.js';
import type {
  ApiResponse,
  TaskConfig,
  CreateTaskInput,
  UpdateTaskInput,
  TaskRuntimeStatus,
} from '@photo-processor/shared';

export const taskRoutes = new Hono();

// Apply auth middleware to all routes
taskRoutes.use('*', authMiddleware);

// Get all tasks
taskRoutes.get('/', (c) => {
  try {
    const db = getDatabase();
    const tasks = db.prepare('SELECT * FROM task_configs ORDER BY created_at DESC').all() as any[];

    const formattedTasks: TaskConfig[] = tasks.map((task) => ({
      id: task.id,
      name: task.name,
      targetUrl: task.target_url,
      checkInterval: task.check_interval,
      selectors: JSON.parse(task.selectors_json),
      browserHeadless: Boolean(task.browser_headless),
      browserTimeout: task.browser_timeout,
      dropboxPath: task.dropbox_path,
      isActive: Boolean(task.is_active),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }));

    return c.json<ApiResponse<TaskConfig[]>>({
      success: true,
      data: formattedTasks,
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get tasks' }, 500);
  }
});

// Get single task
taskRoutes.get('/:id', (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const db = getDatabase();
    const task = db.prepare('SELECT * FROM task_configs WHERE id = ?').get(id) as any;

    if (!task) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    const formattedTask: TaskConfig = {
      id: task.id,
      name: task.name,
      targetUrl: task.target_url,
      checkInterval: task.check_interval,
      selectors: JSON.parse(task.selectors_json),
      browserHeadless: Boolean(task.browser_headless),
      browserTimeout: task.browser_timeout,
      dropboxPath: task.dropbox_path,
      isActive: Boolean(task.is_active),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    };

    return c.json<ApiResponse<TaskConfig>>({
      success: true,
      data: formattedTask,
    });
  } catch (error) {
    console.error('Get task error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get task' }, 500);
  }
});

// Create task
taskRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json<CreateTaskInput>();

    if (!body.name || !body.targetUrl || !body.dropboxPath) {
      return c.json<ApiResponse>(
        { success: false, error: 'Name, targetUrl, and dropboxPath are required' },
        400
      );
    }

    const db = getDatabase();
    const selectors = {
      photoItem: body.selectors?.photoItem || 'div.photo-content.container li.photo-item',
      photoClick: body.selectors?.photoClick || 'span',
      viewOriginal: body.selectors?.viewOriginal || 'div.operate-buttons li.row-all-center a',
    };

    const result = db
      .prepare(
        `INSERT INTO task_configs
        (name, target_url, check_interval, selectors_json, browser_headless, browser_timeout, dropbox_path)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        body.name,
        body.targetUrl,
        body.checkInterval || 60,
        JSON.stringify(selectors),
        body.browserHeadless !== false ? 1 : 0,
        body.browserTimeout || 30000,
        body.dropboxPath
      );

    const newTask = db.prepare('SELECT * FROM task_configs WHERE id = ?').get(result.lastInsertRowid) as any;

    return c.json<ApiResponse<TaskConfig>>(
      {
        success: true,
        data: {
          id: newTask.id,
          name: newTask.name,
          targetUrl: newTask.target_url,
          checkInterval: newTask.check_interval,
          selectors: JSON.parse(newTask.selectors_json),
          browserHeadless: Boolean(newTask.browser_headless),
          browserTimeout: newTask.browser_timeout,
          dropboxPath: newTask.dropbox_path,
          isActive: Boolean(newTask.is_active),
          createdAt: newTask.created_at,
          updatedAt: newTask.updated_at,
        },
      },
      201
    );
  } catch (error) {
    console.error('Create task error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to create task' }, 500);
  }
});

// Update task
taskRoutes.put('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const body = await c.req.json<UpdateTaskInput>();
    const db = getDatabase();

    const existingTask = db.prepare('SELECT * FROM task_configs WHERE id = ?').get(id) as any;
    if (!existingTask) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    const currentSelectors = JSON.parse(existingTask.selectors_json);
    const newSelectors = body.selectors
      ? { ...currentSelectors, ...body.selectors }
      : currentSelectors;

    db.prepare(
      `UPDATE task_configs SET
        name = ?,
        target_url = ?,
        check_interval = ?,
        selectors_json = ?,
        browser_headless = ?,
        browser_timeout = ?,
        dropbox_path = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(
      body.name ?? existingTask.name,
      body.targetUrl ?? existingTask.target_url,
      body.checkInterval ?? existingTask.check_interval,
      JSON.stringify(newSelectors),
      body.browserHeadless !== undefined ? (body.browserHeadless ? 1 : 0) : existingTask.browser_headless,
      body.browserTimeout ?? existingTask.browser_timeout,
      body.dropboxPath ?? existingTask.dropbox_path,
      id
    );

    const updatedTask = db.prepare('SELECT * FROM task_configs WHERE id = ?').get(id) as any;

    return c.json<ApiResponse<TaskConfig>>({
      success: true,
      data: {
        id: updatedTask.id,
        name: updatedTask.name,
        targetUrl: updatedTask.target_url,
        checkInterval: updatedTask.check_interval,
        selectors: JSON.parse(updatedTask.selectors_json),
        browserHeadless: Boolean(updatedTask.browser_headless),
        browserTimeout: updatedTask.browser_timeout,
        dropboxPath: updatedTask.dropbox_path,
        isActive: Boolean(updatedTask.is_active),
        createdAt: updatedTask.created_at,
        updatedAt: updatedTask.updated_at,
      },
    });
  } catch (error) {
    console.error('Update task error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to update task' }, 500);
  }
});

// Delete task
taskRoutes.delete('/:id', (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const db = getDatabase();

    const task = db.prepare('SELECT id FROM task_configs WHERE id = ?').get(id);
    if (!task) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    // TODO: Stop task if running

    db.prepare('DELETE FROM task_configs WHERE id = ?').run(id);

    return c.json<ApiResponse>({
      success: true,
      message: 'Task deleted successfully',
    });
  } catch (error) {
    console.error('Delete task error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to delete task' }, 500);
  }
});

// Start task
taskRoutes.post('/:id/start', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const db = getDatabase();

    const task = db.prepare('SELECT id FROM task_configs WHERE id = ?').get(id);
    if (!task) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    const taskManager = getTaskManager();
    await taskManager.startTask(id);

    return c.json<ApiResponse>({
      success: true,
      message: 'Task started',
    });
  } catch (error: any) {
    console.error('Start task error:', error);
    return c.json<ApiResponse>({ success: false, error: error.message || 'Failed to start task' }, 500);
  }
});

// Stop task
taskRoutes.post('/:id/stop', async (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const db = getDatabase();

    const task = db.prepare('SELECT id FROM task_configs WHERE id = ?').get(id);
    if (!task) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    const taskManager = getTaskManager();
    await taskManager.stopTask(id);

    return c.json<ApiResponse>({
      success: true,
      message: 'Task stopped',
    });
  } catch (error: any) {
    console.error('Stop task error:', error);
    return c.json<ApiResponse>({ success: false, error: error.message || 'Failed to stop task' }, 500);
  }
});

// Get task status
taskRoutes.get('/:id/status', (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);

    const taskManager = getTaskManager();
    const status = taskManager.getTaskStatus(id);

    if (!status) {
      return c.json<ApiResponse>({ success: false, error: 'Task not found' }, 404);
    }

    return c.json<ApiResponse<TaskRuntimeStatus>>({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Get task status error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get task status' }, 500);
  }
});

// Get task logs
taskRoutes.get('/:id/logs', (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const limit = parseInt(c.req.query('limit') || '100', 10);
    const db = getDatabase();

    const logs = db
      .prepare(
        `SELECT * FROM task_logs
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT ?`
      )
      .all(id, limit);

    return c.json<ApiResponse>({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('Get task logs error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get task logs' }, 500);
  }
});

// Get task failed downloads
taskRoutes.get('/:id/errors', (c) => {
  try {
    const id = parseInt(c.req.param('id'), 10);
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const db = getDatabase();

    const errors = db
      .prepare(
        `SELECT id, fingerprint, original_filename, error_message, downloaded_at
        FROM download_history
        WHERE task_id = ? AND status = 'failed'
        ORDER BY downloaded_at DESC
        LIMIT ?`
      )
      .all(id, limit) as any[];

    const formattedErrors = errors.map((err) => ({
      id: err.id,
      fingerprint: err.fingerprint,
      filename: err.original_filename,
      errorMessage: err.error_message,
      failedAt: err.downloaded_at,
    }));

    return c.json<ApiResponse>({
      success: true,
      data: formattedErrors,
    });
  } catch (error) {
    console.error('Get task errors error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get task errors' }, 500);
  }
});
