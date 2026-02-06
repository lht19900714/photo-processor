/**
 * WebSocket event types for real-time communication
 */

// Server -> Client events
export type ServerWSEvent =
  | TaskStartedEvent
  | TaskStoppedEvent
  | TaskErrorEvent
  | TaskRecoveringEvent
  | TaskRecoveredEvent
  | DropboxAuthErrorEvent
  | ScanStartedEvent
  | ScanProgressEvent
  | ScanCompletedEvent
  | DownloadStartedEvent
  | DownloadCompletedEvent
  | DownloadFailedEvent
  | CycleCompletedEvent
  | LogEvent;

export interface TaskStartedEvent {
  type: 'task:started';
  taskId: number;
  timestamp: string;
}

export interface TaskStoppedEvent {
  type: 'task:stopped';
  taskId: number;
  reason: string;
  timestamp: string;
}

export interface TaskErrorEvent {
  type: 'task:error';
  taskId: number;
  error: string;
  timestamp: string;
}

export interface TaskRecoveringEvent {
  type: 'task:recovering';
  taskId: number;
  errorType: string;
  attempt: number;
  maxRetries: number;
  delayMs: number;
  timestamp: string;
}

export interface TaskRecoveredEvent {
  type: 'task:recovered';
  taskId: number;
  timestamp: string;
}

export interface DropboxAuthErrorEvent {
  type: 'dropbox:authError';
  message: string;
  timestamp: string;
}

export interface ScanStartedEvent {
  type: 'scan:started';
  taskId: number;
  timestamp: string;
}

export interface ScanProgressEvent {
  type: 'scan:progress';
  taskId: number;
  scanned: number;
  total: number;
  timestamp: string;
}

export interface ScanCompletedEvent {
  type: 'scan:completed';
  taskId: number;
  newPhotos: number;
  totalPhotos: number;
  timestamp: string;
}

export interface DownloadStartedEvent {
  type: 'download:started';
  taskId: number;
  fingerprint: string;
  filename: string;
  timestamp: string;
}

export interface DownloadCompletedEvent {
  type: 'download:completed';
  taskId: number;
  fingerprint: string;
  filename: string;
  fileSize: number;
  dropboxPath: string;
  timestamp: string;
}

export interface DownloadFailedEvent {
  type: 'download:failed';
  taskId: number;
  fingerprint: string;
  filename: string;
  error: string;
  timestamp: string;
}

export interface CycleCompletedEvent {
  type: 'cycle:completed';
  taskId: number;
  downloaded: number;
  failed: number;
  nextCheckAt: string;
  timestamp: string;
}

export interface LogEvent {
  type: 'log';
  taskId: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

// Client -> Server events
export type ClientWSEvent =
  | SubscribeEvent
  | UnsubscribeEvent;

export interface SubscribeEvent {
  type: 'subscribe';
  taskId: number;
}

export interface UnsubscribeEvent {
  type: 'unsubscribe';
  taskId: number;
}
