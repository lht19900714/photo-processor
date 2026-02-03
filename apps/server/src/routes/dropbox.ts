import { Hono } from 'hono';
import { getDatabase } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import type { ApiResponse, DropboxConfig, DropboxAuthUrl, DropboxTokens } from '@photo-processor/shared';
import crypto from 'crypto';

export const dropboxRoutes = new Hono();

// Store PKCE state temporarily (in production, use Redis or database)
const pkceStore = new Map<string, { codeVerifier: string; createdAt: number }>();

// Clean up expired PKCE states (older than 10 minutes)
function cleanupPkceStore() {
  const now = Date.now();
  for (const [state, data] of pkceStore.entries()) {
    if (now - data.createdAt > 10 * 60 * 1000) {
      pkceStore.delete(state);
    }
  }
}

// Generate PKCE code verifier and challenge
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate random code verifier (43-128 characters)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');

  return { codeVerifier, codeChallenge };
}

// Get Dropbox connection status
dropboxRoutes.get('/status', authMiddleware, (c) => {
  try {
    const db = getDatabase();
    const credentials = db.prepare('SELECT * FROM dropbox_credentials ORDER BY id DESC LIMIT 1').get() as any;

    const config: DropboxConfig = {
      isConnected: !!credentials,
      accountName: credentials?.account_name || null,
      accountEmail: credentials?.account_email || null,
      connectedAt: credentials?.created_at || null,
    };

    return c.json<ApiResponse<DropboxConfig>>({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error('Get Dropbox status error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to get Dropbox status' }, 500);
  }
});

// Generate OAuth authorization URL
dropboxRoutes.get('/auth-url', authMiddleware, (c) => {
  try {
    const appKey = process.env.DROPBOX_APP_KEY;
    if (!appKey) {
      return c.json<ApiResponse>(
        { success: false, error: 'Dropbox App Key not configured' },
        500
      );
    }

    // Clean up old PKCE states
    cleanupPkceStore();

    // Generate PKCE
    const { codeVerifier, codeChallenge } = generatePKCE();

    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // Store code verifier
    pkceStore.set(state, { codeVerifier, createdAt: Date.now() });

    // Build authorization URL
    const redirectUri = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:3000/api/dropbox/callback';
    const params = new URLSearchParams({
      client_id: appKey,
      response_type: 'code',
      token_access_type: 'offline', // Get refresh token
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      state: state,
    });

    const authUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;

    return c.json<ApiResponse<DropboxAuthUrl>>({
      success: true,
      data: { url: authUrl, state },
    });
  } catch (error) {
    console.error('Generate auth URL error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to generate auth URL' }, 500);
  }
});

// OAuth callback handler
dropboxRoutes.get('/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const state = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      // Redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return c.redirect(`${frontendUrl}/settings/dropbox?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return c.json<ApiResponse>({ success: false, error: 'Missing code or state' }, 400);
    }

    // Get stored code verifier
    const pkceData = pkceStore.get(state);
    if (!pkceData) {
      return c.json<ApiResponse>({ success: false, error: 'Invalid or expired state' }, 400);
    }

    // Delete used PKCE data
    pkceStore.delete(state);

    // Exchange code for tokens
    const appKey = process.env.DROPBOX_APP_KEY!;
    const redirectUri = process.env.DROPBOX_REDIRECT_URI || 'http://localhost:3000/api/dropbox/callback';

    const tokenResponse = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: appKey,
        code_verifier: pkceData.codeVerifier,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return c.json<ApiResponse>({ success: false, error: 'Failed to exchange code for tokens' }, 500);
    }

    const tokens = await tokenResponse.json() as DropboxTokens;

    // Get account info
    const accountResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    let accountName = null;
    let accountEmail = null;

    if (accountResponse.ok) {
      const accountData = await accountResponse.json() as { name?: { display_name?: string }; email?: string };
      accountName = accountData.name?.display_name || null;
      accountEmail = accountData.email || null;
    }

    // Save to database
    const db = getDatabase();

    // Delete existing credentials
    db.prepare('DELETE FROM dropbox_credentials').run();

    // Insert new credentials
    db.prepare(
      `INSERT INTO dropbox_credentials
      (refresh_token, account_id, account_name, account_email)
      VALUES (?, ?, ?, ?)`
    ).run(tokens.refresh_token, tokens.account_id, accountName, accountEmail);

    console.log(`✓ Dropbox connected: ${accountName} (${accountEmail})`);

    // Redirect to frontend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/settings/dropbox?success=true`);
  } catch (error) {
    console.error('Dropbox callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return c.redirect(`${frontendUrl}/settings/dropbox?error=callback_failed`);
  }
});

// Disconnect Dropbox
dropboxRoutes.delete('/disconnect', authMiddleware, (c) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM dropbox_credentials').run();

    return c.json<ApiResponse>({
      success: true,
      message: 'Dropbox disconnected successfully',
    });
  } catch (error) {
    console.error('Disconnect Dropbox error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to disconnect Dropbox' }, 500);
  }
});

// Test Dropbox connection
dropboxRoutes.post('/test', authMiddleware, async (c) => {
  try {
    const db = getDatabase();
    const credentials = db.prepare('SELECT * FROM dropbox_credentials ORDER BY id DESC LIMIT 1').get() as any;

    if (!credentials) {
      return c.json<ApiResponse>({ success: false, error: 'Dropbox not connected' }, 400);
    }

    // Get fresh access token using refresh token
    const appKey = process.env.DROPBOX_APP_KEY!;
    const tokenResponse = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh_token,
        client_id: appKey,
      }),
    });

    if (!tokenResponse.ok) {
      return c.json<ApiResponse>({ success: false, error: 'Failed to refresh access token' }, 500);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };

    // Test API call
    const accountResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!accountResponse.ok) {
      return c.json<ApiResponse>({ success: false, error: 'Dropbox API test failed' }, 500);
    }

    const accountData = await accountResponse.json() as { name?: { display_name?: string }; email?: string };

    return c.json<ApiResponse>({
      success: true,
      message: `Connection successful: ${accountData.name?.display_name}`,
      data: {
        accountName: accountData.name?.display_name,
        accountEmail: accountData.email,
      },
    });
  } catch (error) {
    console.error('Test Dropbox error:', error);
    return c.json<ApiResponse>({ success: false, error: 'Failed to test Dropbox connection' }, 500);
  }
});
