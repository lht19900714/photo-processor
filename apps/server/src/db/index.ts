import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import bcrypt from 'bcrypt';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH || './data/app.db';

  // Ensure data directory exists
  const dataDir = dirname(dbPath);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Create database connection
  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  runMigrations(db);

  // Create initial admin user if not exists
  await createInitialUser(db);
}

function runMigrations(db: Database.Database): void {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Task configs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_url TEXT NOT NULL,
      check_interval INTEGER DEFAULT 60,
      selectors_json TEXT NOT NULL,
      browser_headless INTEGER DEFAULT 1,
      browser_timeout INTEGER DEFAULT 30000,
      dropbox_path TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Dropbox credentials table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dropbox_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refresh_token TEXT NOT NULL,
      account_id TEXT,
      account_name TEXT,
      account_email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Download history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS download_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      fingerprint TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      thumbnail_url TEXT,
      dropbox_path TEXT,
      file_size INTEGER,
      status TEXT DEFAULT 'success',
      error_message TEXT,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES task_configs(id) ON DELETE CASCADE,
      UNIQUE(task_id, fingerprint)
    )
  `);

  // Migration: Add status and error_message columns if they don't exist
  const columns = db.prepare("PRAGMA table_info(download_history)").all() as { name: string }[];
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('status')) {
    db.exec("ALTER TABLE download_history ADD COLUMN status TEXT DEFAULT 'success'");
    console.log('✓ Migration: Added status column to download_history');
  }

  if (!columnNames.includes('error_message')) {
    db.exec("ALTER TABLE download_history ADD COLUMN error_message TEXT");
    console.log('✓ Migration: Added error_message column to download_history');
  }

  // Task logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES task_configs(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_download_history_task_id ON download_history(task_id);
    CREATE INDEX IF NOT EXISTS idx_download_history_fingerprint ON download_history(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_task_logs_task_id ON task_logs(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_logs_created_at ON task_logs(created_at);
  `);

  // Reset running tasks to idle on startup (they were interrupted by server restart)
  const resetResult = db.prepare("UPDATE task_configs SET is_active = 0 WHERE is_active = 1").run();
  if (resetResult.changes > 0) {
    console.log(`✓ Reset ${resetResult.changes} interrupted task(s) to idle state`);
  }

  console.log('✓ Database migrations completed');
}

async function createInitialUser(db: Database.Database): Promise<void> {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  // Check if user exists
  const existingUser = db
    .prepare('SELECT id FROM users WHERE username = ?')
    .get(username);

  if (!existingUser) {
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(
      username,
      passwordHash
    );
    console.log(`✓ Initial admin user created: ${username}`);
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
