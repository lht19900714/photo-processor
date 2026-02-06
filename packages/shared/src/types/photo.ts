/**
 * Photo and download history types
 */
export type PhotoStatus = 'success' | 'failed';

export interface Photo {
  id: number;
  taskId: number;
  taskName: string;
  fingerprint: string;
  originalFilename: string;
  thumbnailUrl: string | null;
  dropboxPath: string | null;
  fileSize: number | null;
  status: PhotoStatus;
  errorMessage: string | null;
  downloadedAt: string;
}

export interface PhotoInfo {
  index: number;
  fingerprint: string;
  thumbnailUrl: string;
}

export interface PhotoWithUrl extends PhotoInfo {
  url: string;
  filename: string;
}

export interface DownloadProgress {
  taskId: number;
  current: number;
  total: number;
  currentPhoto: string | null;
  startedAt: string;
}

export interface PhotoStats {
  totalDownloaded: number;
  todayDownloaded: number;
  totalSize: number;
  lastDownloadAt: string | null;
}

/**
 * Failed download record for task detail page
 */
export interface FailedDownload {
  id: number;
  fingerprint: string;
  filename: string;
  errorMessage: string;
  failedAt: string;
}
