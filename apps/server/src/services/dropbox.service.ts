import { getDatabase } from '../db/index.js';

interface DropboxCredentials {
  refreshToken: string;
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
}

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

/**
 * Dropbox service for file uploads with automatic token refresh
 */
export class DropboxService {
  private accessTokenCache: AccessTokenCache | null = null;
  private appKey: string;

  constructor() {
    this.appKey = process.env.DROPBOX_APP_KEY || '';
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
      .get() as any;

    if (!row) {
      return null;
    }

    return {
      refreshToken: row.refresh_token,
      accountId: row.account_id,
      accountName: row.account_name,
      accountEmail: row.account_email,
    };
  }

  /**
   * Get a valid access token (auto-refresh if expired)
   */
  async getAccessToken(): Promise<string> {
    // Check cache (with 5 minute buffer)
    if (this.accessTokenCache) {
      const bufferMs = 5 * 60 * 1000;
      if (Date.now() < this.accessTokenCache.expiresAt - bufferMs) {
        return this.accessTokenCache.token;
      }
    }

    // Refresh token
    const credentials = this.getCredentials();
    if (!credentials) {
      throw new Error('Dropbox not connected');
    }

    const response = await fetch('https://api.dropbox.com/oauth2/token', {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', errorText);
      throw new Error('Failed to refresh Dropbox access token');
    }

    const data = await response.json() as { access_token: string; expires_in: number };

    // Cache the new token
    this.accessTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return this.accessTokenCache.token;
  }

  /**
   * Upload a file to Dropbox
   */
  async uploadFile(
    path: string,
    data: Buffer,
    options?: { autorename?: boolean }
  ): Promise<{ path: string; size: number }> {
    const accessToken = await this.getAccessToken();

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;

    const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: fullPath,
          mode: 'overwrite',
          autorename: options?.autorename ?? false,
          mute: true,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload failed:', errorText);
      throw new Error(`Failed to upload file to Dropbox: ${fullPath}`);
    }

    const result = await response.json() as { path_display: string; size: number };

    return {
      path: result.path_display,
      size: result.size,
    };
  }

  /**
   * Ensure a folder exists in Dropbox
   */
  async ensureFolder(path: string): Promise<boolean> {
    const accessToken = await this.getAccessToken();

    // Ensure path starts with /
    const fullPath = path.startsWith('/') ? path : `/${path}`;

    try {
      // Try to get folder metadata
      const metaResponse = await fetch(
        'https://api.dropboxapi.com/2/files/get_metadata',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: fullPath }),
        }
      );

      if (metaResponse.ok) {
        return true; // Folder exists
      }

      // Folder doesn't exist, create it
      const createResponse = await fetch(
        'https://api.dropboxapi.com/2/files/create_folder_v2',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ path: fullPath, autorename: false }),
        }
      );

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        // Ignore "folder already exists" error
        if (!errorText.includes('conflict')) {
          console.error('Create folder failed:', errorText);
          return false;
        }
      }

      console.log(`✓ Created Dropbox folder: ${fullPath}`);
      return true;
    } catch (error) {
      console.error('Ensure folder error:', error);
      return false;
    }
  }

  /**
   * Get account info
   */
  async getAccountInfo(): Promise<{ name: string; email: string } | null> {
    try {
      const accessToken = await this.getAccessToken();

      const response = await fetch(
        'https://api.dropboxapi.com/2/users/get_current_account',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { name?: { display_name?: string }; email?: string };
      return {
        name: data.name?.display_name || 'Unknown',
        email: data.email || 'Unknown',
      };
    } catch {
      return null;
    }
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
