/**
 * Task configuration interface
 */
export interface TaskConfig {
  id: number;
  name: string;
  targetUrl: string;
  checkInterval: number; // seconds
  selectors: TaskSelectors;
  browserHeadless: boolean;
  browserTimeout: number; // milliseconds
  dropboxPath: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSelectors {
  photoItem: string;
  photoClick: string;
  viewOriginal: string;
}

export interface CreateTaskInput {
  name: string;
  targetUrl: string;
  checkInterval?: number;
  selectors?: Partial<TaskSelectors>;
  browserHeadless?: boolean;
  browserTimeout?: number;
  dropboxPath: string;
}

export interface UpdateTaskInput {
  name?: string;
  targetUrl?: string;
  checkInterval?: number;
  selectors?: Partial<TaskSelectors>;
  browserHeadless?: boolean;
  browserTimeout?: number;
  dropboxPath?: string;
}

/**
 * Task runtime status
 */
export type TaskStatus = 'idle' | 'running' | 'paused' | 'error';

export interface TaskRuntimeStatus {
  taskId: number;
  status: TaskStatus;
  currentCycle: number;
  lastCheckAt: string | null;
  nextCheckAt: string | null;
  error: string | null;
  stats: TaskStats;
}

export interface TaskStats {
  totalPhotos: number;
  downloadedPhotos: number;
  failedPhotos: number;
  lastDownloadAt: string | null;
}

/**
 * Default selectors (from original Python script)
 */
export const DEFAULT_SELECTORS: TaskSelectors = {
  photoItem: 'div.photo-content.container li.photo-item',
  photoClick: 'span',
  viewOriginal: 'div.operate-buttons li.row-all-center a',
};

export const DEFAULT_TASK_CONFIG = {
  checkInterval: 60,
  browserHeadless: true,
  browserTimeout: 30000,
  selectors: DEFAULT_SELECTORS,
};

/**
 * Task log entry
 */
export interface TaskLog {
  id: number;
  taskId: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadataJson: string | null;
  createdAt: string;
}
