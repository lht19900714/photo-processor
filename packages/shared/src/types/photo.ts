/**
 * Photo and download history types
 */
export interface Photo {
  id: number;
  taskId: number;
  fingerprint: string;
  originalFilename: string;
  thumbnailUrl: string | null;
  dropboxPath: string | null;
  fileSize: number | null;
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
