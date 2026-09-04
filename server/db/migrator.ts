import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseClient, getDatabaseClient } from './client';

export interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
  sql: string;
  checksum: string;
}

export function loadMigrationFiles(migrationsDir?: string): MigrationFile[] {
  const dir = migrationsDir || path.join(process.cwd(), 'server/db/migrations');
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((file) => {
    const filePath = path.join(dir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const parts = file.replace('.sql', '').split('_');
    const version = parts[0];
    const name = parts.slice(1).join('_');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');

    return {
      version,
      name,
      filePath,
      sql,
      checksum,
    };
  });
}

export async function ensureMigrationTable(client: DatabaseClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64),
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function getAppliedMigrations(client: DatabaseClient): Promise<Set<string>> {
  await ensureMigrationTable(client);
  const result = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  return new Set(result.rows.map((r) => r.version));
}

export async function runMigrations(
  client?: DatabaseClient,
  migrationsDir?: string,
  options?: { includeSeed?: boolean }
): Promise<{ applied: string[]; skipped: string[] }> {
  const db = client || getDatabaseClient();
  await ensureMigrationTable(db);

  const appliedSet = await getAppliedMigrations(db);
  const migrationFiles = loadMigrationFiles(migrationsDir);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrationFiles) {
    // If seed migrations (e.g. 002_demo_seed) should be skipped unless explicitly requested
    if (migration.name.includes('demo_seed') && options?.includeSeed === false) {
      skipped.push(`${migration.version}_${migration.name} (seed excluded)`);
      continue;
    }

    if (appliedSet.has(migration.version)) {
      skipped.push(`${migration.version}_${migration.name}`);
      continue;
    }

    // Run migration in a transaction
    await db.withTransaction(async (tx) => {
      // Execute the SQL script
      await tx.exec(migration.sql);

      // Record migration
      await tx.query(
        `INSERT INTO schema_migrations (version, name, checksum, applied_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [migration.version, migration.name, migration.checksum]
      );
    });

    applied.push(`${migration.version}_${migration.name}`);
  }

  return { applied, skipped };
}

// CLI Execution Support
const isDirectCliRun = Boolean(process.argv[1] && (process.argv[1].endsWith('migrator.ts') || process.argv[1].endsWith('migrator.js') || process.argv[1].includes('migrator')));
if (isDirectCliRun) {
  const db = getDatabaseClient();
  const includeSeed = process.argv.includes('--with-seed');
  console.log(`[Omnicore DB] Running database migrations (includeSeed: ${includeSeed})...`);

  runMigrations(db, undefined, { includeSeed })
    .then(async (result) => {
      console.log(`[Omnicore DB] Migrations complete. Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
      if (result.applied.length > 0) {
        console.log(`Applied: ${result.applied.join(', ')}`);
      }
      try {
        await Promise.race([
          db.close(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        // ignore close error
      }
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[Omnicore DB] Migration failed:', err);
      try {
        await Promise.race([
          db.close(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        // ignore close error
      }
      process.exit(1);
    });
}
