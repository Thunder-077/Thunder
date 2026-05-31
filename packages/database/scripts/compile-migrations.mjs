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

const migrationsDir = path.resolve(databaseDir, 'prisma/sqlite-migrations');
let apiSrcDir = path.resolve(databaseDir, '../../apps/api/src');
if (!fs.existsSync(apiSrcDir)) {
  // Fallback if directory layout is different
  apiSrcDir = path.resolve(databaseDir, '../api/src');
}

if (!fs.existsSync(migrationsDir)) {
  console.log(`[Compile] No SQLite migrations folder found at: ${migrationsDir}. Generating empty sqlite-migrations.json.`);
  writeEmptyMigrations();
  process.exit(0);
}

try {
  const folders = fs.readdirSync(migrationsDir)
    .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory() && /^\d{14}_/.test(f))
    .sort(); // Sort chronologically by 14-digit timestamp prefix

  const compiledMigrations = [];

  for (const folder of folders) {
    const sqlPath = path.join(migrationsDir, folder, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      compiledMigrations.push({
        name: folder,
        sql: sqlContent
      });
      console.log(`[Compile] Compiled SQLite migration: ${folder}`);
    }
  }

  validateSqliteMigrations(compiledMigrations);

  // Ensure output directory exists
  fs.mkdirSync(apiSrcDir, { recursive: true });
  
  const outputPath = path.join(apiSrcDir, 'sqlite-migrations.json');
  fs.writeFileSync(outputPath, JSON.stringify(compiledMigrations, null, 2), 'utf8');
  console.log(`[Compile] Successfully generated sqlite-migrations.json at: ${outputPath}`);

} catch (error) {
  console.error('[Compile] Failed to compile migrations:', error);
  process.exit(1);
}

function writeEmptyMigrations() {
  fs.mkdirSync(apiSrcDir, { recursive: true });
  const outputPath = path.join(apiSrcDir, 'sqlite-migrations.json');
  fs.writeFileSync(outputPath, '[]\n', 'utf8');
}

function validateSqliteMigrations(migrations) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thunder-sqlite-migrations-'));
  const dbPath = path.join(tempDir, 'verify.db');
  const db = new DatabaseSync(dbPath);

  try {
    for (let i = 0; i < migrations.length; i++) {
      const migration = migrations[i];
      try {
        db.exec('BEGIN TRANSACTION;');
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${i + 1};`);
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw new Error(`SQLite migration ${migration.name} failed validation: ${error.message}`);
      }
    }
    console.log(`[Compile] Validated ${migrations.length} SQLite migration(s) against a temporary database.`);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
