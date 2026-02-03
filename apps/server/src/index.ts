import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { config } from 'dotenv';

// Load environment variables
config();

// Import routes
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/task.js';
import { photoRoutes } from './routes/photo.js';
import { dropboxRoutes } from './routes/dropbox.js';

// Import database initialization
import { initDatabase } from './db/index.js';

// Create Hono app
const app = new Hono();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.route('/api/auth', authRoutes);
app.route('/api/tasks', taskRoutes);
app.route('/api/photos', photoRoutes);
app.route('/api/dropbox', dropboxRoutes);

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json(
    {
      success: false,
      error: err.message || 'Internal server error',
    },
    500
  );
});

// Not found handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not found',
    },
    404
  );
});

// Initialize and start server
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  try {
    // Initialize database
    await initDatabase();
    console.log('✓ Database initialized');

    // Start server
    console.log(`🚀 Server starting on http://${HOST}:${PORT}`);

    serve({
      fetch: app.fetch,
      port: PORT,
      hostname: HOST,
    });

    console.log(`✓ Server running on http://${HOST}:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();
