import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
let databaseDir = cwd;
if (!cwd.endsWith('database')) {
  databaseDir = path.resolve(cwd, 'packages/database');
}

const pgSchemaPath = path.resolve(databaseDir, 'prisma/schema.prisma');
const sqliteSchemaPath = path.resolve(databaseDir, 'prisma/schema.sqlite.prisma');

if (!fs.existsSync(pgSchemaPath)) {
  console.error(`Cannot find standard schema at: ${pgSchemaPath}`);
  process.exit(1);
}

let schemaContent = fs.readFileSync(pgSchemaPath, 'utf8');

// 1. Change database provider to sqlite
schemaContent = schemaContent.replace(
  /provider\s*=\s*"postgresql"/g,
  'provider = "sqlite"'
);

// 2. Set engineType to library for native desktop binary support (SQLite)
schemaContent = schemaContent.replace(
  /engineType\s*=\s*"client"/g,
  'engineType = "library"'
);

// 3. Add custom output directory for SQLite client inside generator client block
schemaContent = schemaContent.replace(
  /generator client \{([\s\S]*?)\}/,
  (match, content) => {
    return `generator client {${content}  output = "../src/generated/sqlite-client"\n}`;
  }
);

// 4. Ensure directories exist
fs.mkdirSync(path.dirname(sqliteSchemaPath), { recursive: true });

fs.writeFileSync(sqliteSchemaPath, schemaContent, 'utf8');
console.log(`[Sync] Successfully generated SQLite schema at: ${sqliteSchemaPath}`);
