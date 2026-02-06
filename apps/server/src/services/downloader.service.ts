import { getDropboxService } from './dropbox.service.js';
import { calculateDelay, sleep } from '../utils/retry.js';
import type { PhotoWithUrl } from '@photo-processor/shared';

// Retry configuration
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;  // 1 second base delay
const MAX_DELAY = 30000;  // 30 seconds max delay

interface DownloadResult {
  success: boolean;
  fingerprint: string;
  filename: string;
  dropboxPath?: string;
  fileSize?: number;
  error?: string;
}

/**
 * Download events callback
 */
export interface DownloaderEvents {
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onDownloadStart?: (photo: PhotoWithUrl) => void;
  onDownloadComplete?: (result: DownloadResult) => void;
  onDownloadFailed?: (photo: PhotoWithUrl, error: string) => void;
}

/**
 * PhotoDownloader - Downloads photos and uploads to Dropbox
 */
export class PhotoDownloader {
  private dropboxPath: string;
  private events: DownloaderEvents;

  constructor(dropboxPath: string, events?: DownloaderEvents) {
    this.dropboxPath = dropboxPath;
    this.events = events || {};
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [Downloader] ${message}`);
    this.events.onLog?.(level, message);
  }

  /**
   * Download a single photo and upload to Dropbox
   */
  async downloadPhoto(photo: PhotoWithUrl): Promise<DownloadResult> {
    this.events.onDownloadStart?.(photo);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 1. Download to memory
        const response = await fetch(photo.url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        this.log(
          'info',
          `✓ Downloaded to memory: ${photo.filename} (${buffer.length} bytes)`
        );

        // 2. Upload to Dropbox
        const dropboxService = getDropboxService();
        const fullPath = `${this.dropboxPath}/${photo.filename}`;

        const uploadResult = await dropboxService.uploadFile(fullPath, buffer);

        this.log('info', `✓ Uploaded to Dropbox: ${uploadResult.path}`);

        const result: DownloadResult = {
          success: true,
          fingerprint: photo.fingerprint,
          filename: photo.filename,
          dropboxPath: uploadResult.path,
          fileSize: uploadResult.size,
        };

        this.events.onDownloadComplete?.(result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt < MAX_RETRIES) {
          // Calculate exponential backoff delay with jitter
          const delay = calculateDelay(attempt, BASE_DELAY, MAX_DELAY);

          this.log(
            'warn',
            `Download failed (attempt ${attempt}/${MAX_RETRIES}): ${photo.filename} - ${errorMessage}. Retrying in ${delay}ms...`
          );
          await sleep(delay);
        } else {
          this.log(
            'error',
            `Download failed after ${MAX_RETRIES} attempts: ${photo.filename} - ${errorMessage}`
          );

          const result: DownloadResult = {
            success: false,
            fingerprint: photo.fingerprint,
            filename: photo.filename,
            error: errorMessage,
          };

          this.events.onDownloadFailed?.(photo, errorMessage);
          return result;
        }
      }
    }

    // Should never reach here
    return {
      success: false,
      fingerprint: photo.fingerprint,
      filename: photo.filename,
      error: 'Unknown error',
    };
  }

  /**
   * Download multiple photos sequentially
   */
  async downloadPhotos(
    photos: PhotoWithUrl[]
  ): Promise<{ success: number; failed: number; results: DownloadResult[] }> {
    const results: DownloadResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      this.log('info', `[${i + 1}/${photos.length}] Downloading: ${photo.filename}`);

      const result = await this.downloadPhoto(photo);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: successCount,
      failed: failedCount,
      results,
    };
  }
}
