import { PhotoExtractor } from './extractor.service.js';
import { PhotoDownloader } from './downloader.service.js';
import { getDropboxService } from './dropbox.service.js';
import { getDatabase } from '../db/index.js';
import type {
  TaskConfig,
  TaskStatus,
  TaskRuntimeStatus,
  ServerWSEvent,
} from '@photo-processor/shared';

interface RunningTask {
  taskId: number;
  config: TaskConfig;
  status: TaskStatus;
  extractor: PhotoExtractor;
  abortController: AbortController;
  currentCycle: number;
  lastCheckAt: Date | null;
  nextCheckAt: Date | null;
  error: string | null;
}

type EventCallback = (event: ServerWSEvent) => void;

/**
 * TaskManager - Manages task lifecycle and scheduling
 */
export class TaskManager {
  private runningTasks: Map<number, RunningTask> = new Map();
  private eventCallbacks: Set<EventCallback> = new Set();

  /**
   * Subscribe to task events
   */
  subscribe(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emit event to all subscribers
   */
  private emit(event: ServerWSEvent): void {
    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('Event callback error:', error);
      }
    }
  }

  /**
   * Get task configuration from database
   */
  private getTaskConfig(taskId: number): TaskConfig | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM task_configs WHERE id = ?')
      .get(taskId) as any;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      targetUrl: row.target_url,
      checkInterval: row.check_interval,
      selectors: JSON.parse(row.selectors_json),
      browserHeadless: Boolean(row.browser_headless),
      browserTimeout: row.browser_timeout,
      dropboxPath: row.dropbox_path,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Check if fingerprint is already downloaded
   */
  private isDownloaded(taskId: number, fingerprint: string): boolean {
    const db = getDatabase();
    const row = db
      .prepare(
        'SELECT id FROM download_history WHERE task_id = ? AND fingerprint = ?'
      )
      .get(taskId, fingerprint);
    return !!row;
  }

  /**
   * Save download record (success or failure)
   */
  private saveDownloadRecord(
    taskId: number,
    fingerprint: string,
    originalFilename: string,
    thumbnailUrl: string,
    dropboxPath: string | null,
    fileSize: number | null,
    status: 'success' | 'failed' = 'success',
    errorMessage: string | null = null
  ): void {
    const db = getDatabase();
    db.prepare(
      `INSERT OR REPLACE INTO download_history
      (task_id, fingerprint, original_filename, thumbnail_url, dropbox_path, file_size, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(taskId, fingerprint, originalFilename, thumbnailUrl, dropboxPath, fileSize, status, errorMessage);
  }

  /**
   * Log task event
   */
  private logTaskEvent(
    taskId: number,
    level: 'info' | 'warn' | 'error',
    message: string,
    metadata?: object
  ): void {
    const db = getDatabase();
    db.prepare(
      `INSERT INTO task_logs (task_id, level, message, metadata_json) VALUES (?, ?, ?, ?)`
    ).run(taskId, level, message, metadata ? JSON.stringify(metadata) : null);

    // Emit log event
    this.emit({
      type: 'log',
      taskId,
      level,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Start a task
   */
  async startTask(taskId: number): Promise<void> {
    // Check if already running
    if (this.runningTasks.has(taskId)) {
      throw new Error('Task is already running');
    }

    // Get task config
    const config = this.getTaskConfig(taskId);
    if (!config) {
      throw new Error('Task not found');
    }

    // Check Dropbox connection
    const dropboxService = getDropboxService();
    if (!dropboxService.isConnected()) {
      throw new Error('Dropbox not connected');
    }

    // Ensure Dropbox folder exists
    await dropboxService.ensureFolder(config.dropboxPath);

    // Create extractor
    const extractor = new PhotoExtractor(
      {
        headless: config.browserHeadless,
        timeout: config.browserTimeout,
        selectors: config.selectors,
      },
      {
        onLog: (level, message) => {
          this.logTaskEvent(taskId, level, message);
        },
        onScanProgress: (scanned, total) => {
          this.emit({
            type: 'scan:progress',
            taskId,
            scanned,
            total,
            timestamp: new Date().toISOString(),
          });
        },
      }
    );

    // Initialize browser
    await extractor.initialize();

    // Create running task
    const runningTask: RunningTask = {
      taskId,
      config,
      status: 'running',
      extractor,
      abortController: new AbortController(),
      currentCycle: 0,
      lastCheckAt: null,
      nextCheckAt: null,
      error: null,
    };

    this.runningTasks.set(taskId, runningTask);

    // Update database
    const db = getDatabase();
    db.prepare(
      'UPDATE task_configs SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(taskId);

    // Emit start event
    this.emit({
      type: 'task:started',
      taskId,
      timestamp: new Date().toISOString(),
    });

    this.logTaskEvent(taskId, 'info', `Task started: ${config.name}`);

    // Start the task loop
    this.runTaskLoop(runningTask).catch(async (error) => {
      console.error('Task loop error:', error);
      await this.handleTaskError(taskId, error);
    });
  }

  /**
   * Stop a task
   */
  async stopTask(taskId: number, reason = 'User requested'): Promise<void> {
    const runningTask = this.runningTasks.get(taskId);
    if (!runningTask) {
      throw new Error('Task is not running');
    }

    // Signal abort
    runningTask.abortController.abort();
    runningTask.status = 'idle';

    // Close browser
    await runningTask.extractor.close();

    // Remove from running tasks
    this.runningTasks.delete(taskId);

    // Update database
    const db = getDatabase();
    db.prepare(
      'UPDATE task_configs SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(taskId);

    // Emit stop event
    this.emit({
      type: 'task:stopped',
      taskId,
      reason,
      timestamp: new Date().toISOString(),
    });

    this.logTaskEvent(taskId, 'info', `Task stopped: ${reason}`);
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: number): TaskRuntimeStatus | null {
    const config = this.getTaskConfig(taskId);
    if (!config) {
      return null;
    }

    const runningTask = this.runningTasks.get(taskId);

    const db = getDatabase();
    const stats = db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as downloaded,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
           MAX(downloaded_at) as lastDownload
         FROM download_history WHERE task_id = ?`
      )
      .get(taskId) as { total: number; downloaded: number; failed: number; lastDownload: string | null };

    return {
      taskId,
      status: runningTask?.status || 'idle',
      currentCycle: runningTask?.currentCycle || 0,
      lastCheckAt: runningTask?.lastCheckAt?.toISOString() || null,
      nextCheckAt: runningTask?.nextCheckAt?.toISOString() || null,
      error: runningTask?.error || null,
      stats: {
        totalPhotos: stats.total,
        downloadedPhotos: stats.downloaded,
        failedPhotos: stats.failed,
        lastDownloadAt: stats.lastDownload,
      },
    };
  }

  /**
   * Handle task error
   * Ensures browser resources are always cleaned up
   */
  private async handleTaskError(taskId: number, error: Error): Promise<void> {
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      runningTask.status = 'error';
      runningTask.error = error.message;

      // Ensure browser is closed even if stopTask fails
      try {
        await runningTask.extractor.close();
      } catch (closeError) {
        console.error('Failed to close browser:', closeError);
      }
    }

    this.emit({
      type: 'task:error',
      taskId,
      error: error.message,
      timestamp: new Date().toISOString(),
    });

    this.logTaskEvent(taskId, 'error', `Task error: ${error.message}`);

    // Try to stop the task gracefully
    try {
      await this.stopTask(taskId, `Error: ${error.message}`);
    } catch (stopError) {
      console.error('Failed to stop task gracefully:', stopError);
      // Ensure task is removed from running tasks
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Main task loop
   */
  private async runTaskLoop(task: RunningTask): Promise<void> {
    const { taskId, config, extractor, abortController } = task;

    try {
      // Initial navigation
      await extractor.navigateTo(config.targetUrl);

      while (!abortController.signal.aborted) {
        task.currentCycle++;
        task.lastCheckAt = new Date();

        this.logTaskEvent(
          taskId,
          'info',
          `Starting cycle ${task.currentCycle}`
        );

        // Emit scan started
        this.emit({
          type: 'scan:started',
          taskId,
          timestamp: new Date().toISOString(),
        });

        // Refresh page (except first cycle)
        if (task.currentCycle > 1) {
          await extractor.refresh();
        }

        // Extract fingerprints
        const allPhotos = await extractor.extractFingerprints();

        // Filter out already downloaded
        const newPhotos = allPhotos.filter(
          (photo) => !this.isDownloaded(taskId, photo.fingerprint)
        );

        // Emit scan completed
        this.emit({
          type: 'scan:completed',
          taskId,
          newPhotos: newPhotos.length,
          totalPhotos: allPhotos.length,
          timestamp: new Date().toISOString(),
        });

        this.logTaskEvent(
          taskId,
          'info',
          `Scan complete: ${allPhotos.length} total, ${newPhotos.length} new`
        );

        // Download new photos
        if (newPhotos.length > 0) {
          // Extract original URLs
          const photosWithUrls = await extractor.extractPhotoUrls(
            newPhotos.map((p) => p.fingerprint)
          );

          // Download and upload
          const downloader = new PhotoDownloader(config.dropboxPath, {
            onLog: (level, message) => {
              this.logTaskEvent(taskId, level, message);
            },
            onDownloadStart: (photo) => {
              this.emit({
                type: 'download:started',
                taskId,
                fingerprint: photo.fingerprint,
                filename: photo.filename,
                timestamp: new Date().toISOString(),
              });
            },
            onDownloadComplete: (result) => {
              // Save to database
              const photo = photosWithUrls.find(
                (p) => p.fingerprint === result.fingerprint
              );
              if (photo && result.dropboxPath && result.fileSize) {
                this.saveDownloadRecord(
                  taskId,
                  result.fingerprint,
                  result.filename,
                  photo.thumbnailUrl,
                  result.dropboxPath,
                  result.fileSize
                );
              }

              this.emit({
                type: 'download:completed',
                taskId,
                fingerprint: result.fingerprint,
                filename: result.filename,
                fileSize: result.fileSize || 0,
                dropboxPath: result.dropboxPath || '',
                timestamp: new Date().toISOString(),
              });
            },
            onDownloadFailed: (photo, error) => {
              // Save failed record to database
              this.saveDownloadRecord(
                taskId,
                photo.fingerprint,
                photo.filename,
                photo.thumbnailUrl,
                null,
                null,
                'failed',
                error
              );

              this.emit({
                type: 'download:failed',
                taskId,
                fingerprint: photo.fingerprint,
                filename: photo.filename,
                error,
                timestamp: new Date().toISOString(),
              });
            },
          });

          const downloadResult = await downloader.downloadPhotos(photosWithUrls);

          this.logTaskEvent(
            taskId,
            'info',
            `Download complete: ${downloadResult.success} success, ${downloadResult.failed} failed`
          );
        }

        // Calculate next check time
        task.nextCheckAt = new Date(
          Date.now() + config.checkInterval * 1000
        );

        // Emit cycle completed
        this.emit({
          type: 'cycle:completed',
          taskId,
          downloaded: newPhotos.length,
          failed: 0,
          nextCheckAt: task.nextCheckAt.toISOString(),
          timestamp: new Date().toISOString(),
        });

        this.logTaskEvent(
          taskId,
          'info',
          `Cycle ${task.currentCycle} complete. Next check at ${task.nextCheckAt.toISOString()}`
        );

        // Wait for next cycle
        await this.sleep(config.checkInterval * 1000, abortController.signal);
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        // Normal abort, ignore
        return;
      }
      throw error;
    }
  }

  /**
   * Sleep with abort support
   */
  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);

      signal.addEventListener('abort', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  /**
   * Stop all running tasks
   */
  async stopAllTasks(): Promise<void> {
    const taskIds = Array.from(this.runningTasks.keys());
    for (const taskId of taskIds) {
      await this.stopTask(taskId, 'Server shutdown');
    }
  }
}

// Singleton instance
let taskManagerInstance: TaskManager | null = null;

export function getTaskManager(): TaskManager {
  if (!taskManagerInstance) {
    taskManagerInstance = new TaskManager();
  }
  return taskManagerInstance;
}
