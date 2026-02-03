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
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  account_id: string;
}

export interface DropboxAuthUrl {
  url: string;
  state: string;
}
