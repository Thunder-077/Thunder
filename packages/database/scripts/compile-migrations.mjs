import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
let databaseDir = cwd;
if (!cwd.endsWith('database')) {
  databaseDir = path.resolve(cwd, 'packages/database');
}

const migrationsDir = path.resolve(databaseDir, 'prisma/migrations');
let apiSrcDir = path.resolve(databaseDir, '../../apps/api/src');
if (!fs.existsSync(apiSrcDir)) {
  // Fallback if directory layout is different
  apiSrcDir = path.resolve(databaseDir, '../api/src');
}

if (!fs.existsSync(migrationsDir)) {
  console.log(`[Compile] No migrations folder found at: ${migrationsDir}. Generating empty migrations.json.`);
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
      console.log(`[Compile] Compiled migration: ${folder}`);
    }
  }

  // Ensure output directory exists
  fs.mkdirSync(apiSrcDir, { recursive: true });
  
  const outputPath = path.join(apiSrcDir, 'migrations.json');
  fs.writeFileSync(outputPath, JSON.stringify(compiledMigrations, null, 2), 'utf8');
  console.log(`[Compile] Successfully generated migrations.json at: ${outputPath}`);

} catch (error) {
  console.error('[Compile] Failed to compile migrations:', error);
  process.exit(1);
}

function writeEmptyMigrations() {
  fs.mkdirSync(apiSrcDir, { recursive: true });
  const outputPath = path.join(apiSrcDir, 'migrations.json');
  fs.writeFileSync(outputPath, '[]\n', 'utf8');
}
