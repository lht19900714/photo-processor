import { Hono } from 'hono';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db/index.js';
import type { ApiResponse, LoginInput, LoginResponse, User } from '@photo-processor/shared';

export const authRoutes = new Hono();

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-me'
);
const JWT_EXPIRES_IN = '7d';

// Login
authRoutes.post('/login', async (c) => {
  try {
    const body = await c.req.json<LoginInput>();
    const { username, password } = body;

    if (!username || !password) {
      return c.json<ApiResponse>(
        { success: false, error: 'Username and password are required' },
        400
      );
    }

    const db = getDatabase();
    const user = db
      .prepare('SELECT id, username, password_hash, created_at FROM users WHERE username = ?')
      .get(username) as { id: number; username: string; password_hash: string; created_at: string } | undefined;

    if (!user) {
      return c.json<ApiResponse>(
        { success: false, error: 'Invalid username or password' },
        401
      );
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return c.json<ApiResponse>(
        { success: false, error: 'Invalid username or password' },
        401
      );
    }

    // Generate JWT
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const token = await new SignJWT({ userId: user.id, username: user.username })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(JWT_EXPIRES_IN)
      .sign(JWT_SECRET);

    const response: LoginResponse = {
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
      token,
      expiresAt: expiresAt.toISOString(),
    };

    return c.json<ApiResponse<LoginResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json<ApiResponse>(
      { success: false, error: 'Login failed' },
      500
    );
  }
});

// Get current user
authRoutes.get('/me', async (c) => {
  try {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json<ApiResponse>(
        { success: false, error: 'No token provided' },
        401
      );
    }

    const token = authHeader.substring(7);
    const { payload } = await jwtVerify(token, JWT_SECRET);

    const db = getDatabase();
    const user = db
      .prepare('SELECT id, username, created_at FROM users WHERE id = ?')
      .get(payload.userId) as { id: number; username: string; created_at: string } | undefined;

    if (!user) {
      return c.json<ApiResponse>(
        { success: false, error: 'User not found' },
        404
      );
    }

    return c.json<ApiResponse<User>>({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Auth error:', error);
    return c.json<ApiResponse>(
      { success: false, error: 'Invalid token' },
      401
    );
  }
});

// Logout (client-side only, just return success)
authRoutes.post('/logout', (c) => {
  return c.json<ApiResponse>({
    success: true,
    message: 'Logged out successfully',
  });
});
