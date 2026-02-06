import { Dropbox } from 'dropbox';
import { getDatabase } from '../db/index.js';

interface DropboxCredentials {
  refreshToken: string;
  accessToken: string | null;
  expiresAt: Date | null;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
}

// Retry configuration (matching Python's MAX_DOWNLOAD_RETRIES)
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

/**
 * Helper function for retry with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        console.warn(
          `Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delayMs * attempt}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Dropbox service using official SDK with automatic token refresh
 *
 * Based on Python implementation:
 * - Uses official dropbox SDK
 * - Supports refresh_token + app_key authentication
 * - Auto token refresh handled by SDK
 */
export class DropboxService {
  private client: Dropbox | null = null;
  private appKey: string;
  private appSecret: string;
  private refreshTokenPromise: Promise<string> | null = null; // Concurrency protection

  constructor() {
    this.appKey = process.env.DROPBOX_APP_KEY || '';
    this.appSecret = process.env.DROPBOX_APP_SECRET || '';

    if (!this.appKey) {
      console.warn('DROPBOX_APP_KEY not configured');
    }
  }

  /**
   * Check if Dropbox is connected
   */
  isConnected(): boolean {
    const credentials = this.getCredentials();
    return !!credentials;
  }

  /**
   * Get stored credentials from database
   */
  private getCredentials(): DropboxCredentials | null {
    const db = getDatabase();
    const row = db
      .prepare('SELECT * FROM dropbox_credentials ORDER BY id DESC LIMIT 1')
      .get() as {
        refresh_token: string;
        access_token: string | null;
        expires_at: string | null;
        account_id: string | null;
        account_name: string | null;
        account_email: string | null;
      } | undefined;

    if (!row) {
      return null;
    }

    return {
      refreshToken: row.refresh_token,
      accessToken: row.access_token,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      accountId: row.account_id,
      accountName: row.account_name,
      accountEmail: row.account_email,
    };
  }

  /**
   * Check if token is expiring soon (within 5 minutes)
   * Returns true if token should be refreshed
   */
  private isTokenExpiringSoon(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return true; // No expiry time, should refresh
    }

    const now = Date.now();
    const expiryTime = expiresAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    return expiryTime - now < fiveMinutes;
  }

  /**
   * Refresh access token using refresh token
   * Updates database with new access_token and expires_at
   * Protected against concurrent calls
   */
  public async refreshAccessToken(): Promise<string> {
    // Prevent concurrent refresh requests
    if (this.refreshTokenPromise) {
      console.log('Token refresh already in progress, waiting...');
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = this.doRefreshToken();

    try {
      const accessToken = await this.refreshTokenPromise;
      return accessToken;
    } finally {
      this.refreshTokenPromise = null;
    }
  }

  /**
   * Internal method to perform token refresh
   */
  private async doRefreshToken(): Promise<string> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('Dropbox not connected');
    }

    console.log('Refreshing Dropbox access token...');

    try {
      const response = await withRetry(async () => {
        const res = await fetch('https://api.dropbox.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: credentials.refreshToken,
            client_id: this.appKey,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Token refresh failed: ${res.status} ${errorText}`);
        }

        return res.json() as Promise<{
          access_token: string;
          expires_in: number;
          token_type: string;
        }>;
      });

      const expiresAt = new Date(Date.now() + response.expires_in * 1000);

      // Update database
      const db = getDatabase();
      db.prepare(
        `UPDATE dropbox_credentials
         SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT id FROM dropbox_credentials ORDER BY id DESC LIMIT 1)`
      ).run(response.access_token, expiresAt.toISOString());

      console.log(`✓ Access token refreshed, expires at ${expiresAt.toISOString()}`);

      // Reset client to use new token on next request
      this.resetClient();

      return response.access_token;
    } catch (error) {
      console.error('Failed to refresh access token:', error);
      throw error;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   * @returns Valid access token
   */
  public async getValidAccessToken(): Promise<string> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('Dropbox not connected');
    }

    // Check if we have a cached token that's still valid
    if (credentials.accessToken && !this.isTokenExpiringSoon(credentials.expiresAt)) {
      return credentials.accessToken;
    }

    // Token is missing or expiring, refresh it
    return this.refreshAccessToken();
  }

  /**
   * Get or create Dropbox client instance
   * SDK handles token refresh automatically when configured with refreshToken
   */
  private async getClient(): Promise<Dropbox> {
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('Dropbox not connected');
    }

    // Check if token needs refresh before creating/reusing client
    if (this.isTokenExpiringSoon(credentials.expiresAt)) {
      console.log('Token expiring soon, refreshing...');
      await this.refreshAccessToken();
    }

    if (this.client) {
      return this.client;
    }

    // Initialize with refresh token - SDK handles auto-refresh
    // This matches Python: dropbox.Dropbox(oauth2_refresh_token=..., app_key=..., app_secret=...)
    this.client = new Dropbox({
      clientId: this.appKey,
      clientSecret: this.appSecret || undefined,
      refreshToken: credentials.refreshToken,
    });

    return this.client;
  }

  /**
   * Reset client (force re-initialization on next call)
   */
  resetClient(): void {
    this.client = null;
  }

  /**
   * Upload a file to Dropbox with retry
   * Matches Python: dropbox_client.files_upload(content, dropbox_file_path, mode=dropbox.files.WriteMode.overwrite)
   */
  async uploadFile(
    path: string,
    data: Buffer,
    options?: { autorename?: boolean; overwrite?: boolean }
  ): Promise<{ path: string; size: number }> {
    const client = await this.getClient();

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;

    const result = await withRetry(async () => {
      const response = await client.filesUpload({
        path: fullPath,
        contents: data,
        mode: options?.overwrite !== false
          ? { '.tag': 'overwrite' }
          : { '.tag': 'add' },
        autorename: options?.autorename ?? false,
        mute: true,
      });

      return response.result;
    });

    console.log(`✓ Uploaded to Dropbox: ${result.path_display}`);

    return {
      path: result.path_display || fullPath,
      size: result.size,
    };
  }

  /**
   * Ensure a folder exists in Dropbox
   * Matches Python: ensure_dropbox_path()
   */
  async ensureFolder(path: string): Promise<boolean> {
    const client = await this.getClient();

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;

    try {
      // Try to get folder metadata
      await client.filesGetMetadata({ path: fullPath });
      console.log(`Dropbox folder exists: ${fullPath}`);
      return true;
    } catch (error) {
      // Folder doesn't exist, try to create it
      if (this.isPathNotFoundError(error)) {
        try {
          await client.filesCreateFolderV2({
            path: fullPath,
            autorename: false,
          });
          console.log(`✓ Created Dropbox folder: ${fullPath}`);
          return true;
        } catch (createError) {
          // Ignore "folder already exists" conflict error
          if (this.isConflictError(createError)) {
            return true;
          }
          console.error('Create folder failed:', createError);
          return false;
        }
      }
      console.error('Ensure folder error:', error);
      return false;
    }
  }

  /**
   * Get account info
   * Matches Python: client.users_get_current_account()
   */
  async getAccountInfo(): Promise<{ name: string; email: string } | null> {
    try {
      const client = await this.getClient();
      const response = await client.usersGetCurrentAccount();
      const account = response.result;

      return {
        name: account.name?.display_name || 'Unknown',
        email: account.email || 'Unknown',
      };
    } catch (error) {
      console.error('Get account info failed:', error);
      return null;
    }
  }

  /**
   * List files in a folder (for deduplication)
   * Matches Python: get_existing_files()
   */
  async listFolder(path: string): Promise<Set<string>> {
    const client = await this.getClient();
    const existing = new Set<string>();

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;

    try {
      let response = await client.filesListFolder({ path: fullPath });

      while (true) {
        for (const entry of response.result.entries) {
          existing.add(entry.name.toLowerCase());
        }

        if (!response.result.has_more) {
          break;
        }

        response = await client.filesListFolderContinue({
          cursor: response.result.cursor,
        });
      }
    } catch (error) {
      if (this.isPathNotFoundError(error)) {
        console.log(`Dropbox folder ${fullPath} does not exist, will be created`);
      } else {
        console.warn(`Warning: Could not list Dropbox folder ${fullPath}:`, error);
      }
    }

    return existing;
  }

  /**
   * Check if error is a "path not found" error
   */
  private isPathNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const errorObj = error as { error?: { error_summary?: string } };
      const summary = errorObj.error?.error_summary || String(error);
      return summary.includes('path/not_found') || summary.includes('not_found');
    }
    return false;
  }

  /**
   * Check if error is a conflict error (folder already exists)
   */
  private isConflictError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const errorObj = error as { error?: { error_summary?: string } };
      const summary = errorObj.error?.error_summary || String(error);
      return summary.includes('conflict') || summary.includes('folder_conflict');
    }
    return false;
  }
}

// Singleton instance
let dropboxServiceInstance: DropboxService | null = null;

export function getDropboxService(): DropboxService {
  if (!dropboxServiceInstance) {
    dropboxServiceInstance = new DropboxService();
  }
  return dropboxServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing or reconnection)
 */
export function resetDropboxService(): void {
  if (dropboxServiceInstance) {
    dropboxServiceInstance.resetClient();
  }
  dropboxServiceInstance = null;
}
