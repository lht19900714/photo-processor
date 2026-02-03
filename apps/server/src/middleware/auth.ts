import type { Context, Next } from 'hono';
import { jwtVerify } from 'jose';
import type { ApiResponse } from '@photo-processor/shared';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-me'
);

export interface AuthContext {
  userId: number;
  username: string;
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
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

    // Add user info to context
    c.set('userId', payload.userId);
    c.set('username', payload.username);

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json<ApiResponse>(
      { success: false, error: 'Invalid or expired token' },
      401
    );
  }
}
