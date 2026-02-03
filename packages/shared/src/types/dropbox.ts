/**
 * Dropbox configuration and OAuth types
 */
export interface DropboxConfig {
  isConnected: boolean;
  accountName: string | null;
  accountEmail: string | null;
  connectedAt: string | null;
}

export interface DropboxOAuthState {
  codeVerifier: string;
  state: string;
  createdAt: number;
}

export interface DropboxTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
  accountId: string;
}

export interface DropboxAuthUrl {
  url: string;
  state: string;
}
