import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore - node:sqlite is available in the Node runtime used by the desktop API.
import { DatabaseSync } from 'node:sqlite';

const cwd = process.cwd();
let databaseDir = cwd;
if (!cwd.endsWith('database')) {
  databaseDir = path.resolve(cwd, 'packages/database');
}

const migrationName = normalizeMigrationName(process.argv[2]);
if (!migrationName) {
  console.error('Usage: pnpm db:migrate:sqlite <migration-name>');
  process.exit(1);
}

const sqliteSchemaPath = path.resolve(databaseDir, 'prisma/schema.sqlite.prisma');
const sqliteMigrationsDir = path.resolve(databaseDir, 'prisma/sqlite-migrations');

if (!fs.existsSync(sqliteSchemaPath)) {
  console.error(`Cannot find SQLite schema at: ${sqliteSchemaPath}. Run pnpm db:generate first.`);
  process.exit(1);
}

fs.mkdirSync(sqliteMigrationsDir, { recursive: true });

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thunder-sqlite-migrate-'));
const baselineDbPath = path.join(tempDir, 'baseline.db');

try {
  applyExistingMigrations(baselineDbPath);

  const diff = spawnSync(
    'pnpm',
    [
      'exec',
      'prisma',
      'migrate',
      'diff',
      '--from-url',
      `file:${baselineDbPath}`,
      '--to-schema-datamodel',
      sqliteSchemaPath,
      '--script',
    ],
    {
      cwd: databaseDir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  );

  if (diff.status !== 0) {
    process.stderr.write(diff.stderr);
    process.stdout.write(diff.stdout);
    process.exit(diff.status ?? 1);
  }

  const sql = diff.stdout.trim();
  if (!sql || sql.includes('-- This is an empty migration.')) {
    console.log('[SQLite Migration] No schema changes detected. No migration was created.');
    process.exit(0);
  }

  const timestamp = createTimestamp();
  const folderName = `${timestamp}_${migrationName}`;
  const migrationDir = path.join(sqliteMigrationsDir, folderName);
  fs.mkdirSync(migrationDir, { recursive: true });
  fs.writeFileSync(path.join(migrationDir, 'migration.sql'), `${sql}\n`, 'utf8');

  console.log(`[SQLite Migration] Created ${folderName}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function applyExistingMigrations(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    const folders = listMigrationFolders();
    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const sqlPath = path.join(sqliteMigrationsDir, folder, 'migration.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');
      try {
        db.exec('BEGIN TRANSACTION;');
        db.exec(sql);
        db.exec(`PRAGMA user_version = ${i + 1};`);
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw new Error(`Existing SQLite migration ${folder} failed: ${error.message}`);
      }
    }
  } finally {
    db.close();
  }
}

function listMigrationFolders() {
  if (!fs.existsSync(sqliteMigrationsDir)) {
    return [];
  }

  return fs.readdirSync(sqliteMigrationsDir)
    .filter((entry) => fs.statSync(path.join(sqliteMigrationsDir, entry)).isDirectory() && /^\d{14}_/.test(entry))
    .sort();
}

function normalizeMigrationName(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
  ];
  return parts.map((part) => String(part).padStart(2, '0')).join('');
}
