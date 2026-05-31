// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import migrations from './sqlite-migrations.json';

// Resolve directory path safely across ESM and CommonJS environments
const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.resolve();

function resolveAndInjectQueryEngine() {
  if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) return;

  // Search in node_modules/@prisma/client
  const baseDir = path.join(currentDir, 'node_modules', '@prisma', 'client');
  if (fs.existsSync(baseDir)) {
    const files = fs.readdirSync(baseDir);
    const engineFile = files.find(f => f.includes('query_engine') && f.endsWith('.node'));
    if (engineFile) {
      const enginePath = path.join(baseDir, engineFile);
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
      console.log(`[Prisma] Dynamically located query engine at: ${enginePath}`);
      return;
    }
  }

  // Fallback: search in parent/sibling node_modules (for dev or monorepo paths)
  const devDir = path.join(currentDir, '..', 'node_modules', '.prisma', 'client');
  if (fs.existsSync(devDir)) {
    const files = fs.readdirSync(devDir);
    const engineFile = files.find(f => f.includes('query_engine') && f.endsWith('.node'));
    if (engineFile) {
      const enginePath = path.join(devDir, engineFile);
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = enginePath;
      console.log(`[Prisma] Dynamically located dev query engine at: ${enginePath}`);
    }
  }
}

function getDatabasePath(dbUrl: string): string {
  return dbUrl.replace(/^(file:|sqlite:)/, '');
}

export function ensureDatabaseInitialized() {
  resolveAndInjectQueryEngine();
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || (!dbUrl.startsWith('file:') && !dbUrl.startsWith('sqlite:'))) {
    // Only run SQLite sequential versioned migrations for SQLite databases
    return;
  }

  const dbPath = path.resolve(getDatabasePath(dbUrl));

  // Ensure database parent directory exists
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  console.log(`[Database] Connecting to SQLite database at: ${dbPath}`);
  const db = new DatabaseSync(dbPath);

  try {
    // 1. Get current schema version (PRAGMA user_version)
    const versionRow = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
    const currentVersion = versionRow ? versionRow.user_version : 0;

    console.log(`[Database] Current database version is: ${currentVersion}. Available migrations: ${migrations.length}`);

    if (currentVersion < migrations.length) {
      console.log(`[Database] Database is behind by ${migrations.length - currentVersion} migration(s). Running migrations...`);

      for (let i = currentVersion; i < migrations.length; i++) {
        const migration = migrations[i];
        console.log(`[Database] Applying migration [${i + 1}/${migrations.length}]: ${migration.name}`);

        try {
          db.exec('BEGIN TRANSACTION;');
          db.exec(migration.sql);
          db.exec(`PRAGMA user_version = ${i + 1};`);
          db.exec('COMMIT;');
          console.log(`[Database] Successfully applied migration: ${migration.name}`);
        } catch (err) {
          db.exec('ROLLBACK;');
          console.error(`[Database] Failed to apply migration: ${migration.name}. Rolling back.`, err);
          throw err;
        }
      }
      console.log('[Database] All migrations applied successfully.');
    } else {
      console.log('[Database] Database is up to date.');
    }

    // 2. Pre-seed the requested user: zhimengren
    preseedUser(db);

  } catch (error) {
    console.error('[Database] Failed to initialize local SQLite database:', error);
    db.close();
    throw error;
  }

  db.close();
}

function preseedUser(db: DatabaseSync) {
  const username = 'thunder';
  const salt = 'c7W81oklPRSu44rqkKmwWQ';
  const hash = 'j1ZzuVN0fLFyEj4beuRhlXdBZq5T5Vsp6-tqB8hG_zU';

  const userExists = db
    .prepare('SELECT id FROM auth_user WHERE username = ?')
    .get(username);

  if (!userExists) {
    console.log(`[Database] Pre-seeding default desktop user: ${username}`);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO auth_user (id, username, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'default-desktop-user',
      username,
      hash,
      salt,
      now,
      now
    );
    console.log(`[Database] User ${username} pre-seeded successfully.`);
  }
}
