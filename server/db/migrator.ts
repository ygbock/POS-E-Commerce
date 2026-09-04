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

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string | null;
  applied_at: string;
}

export async function ensureMigrationTable(client: DatabaseClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function getAppliedMigrationRecords(client: DatabaseClient): Promise<Map<string, AppliedMigration>> {
  await ensureMigrationTable(client);
  const result = await client.query<AppliedMigration>(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC'
  );
  const map = new Map<string, AppliedMigration>();
  for (const row of result.rows) {
    map.set(row.version, row);
  }
  return map;
}

export async function getAppliedMigrations(client: DatabaseClient): Promise<Set<string>> {
  const records = await getAppliedMigrationRecords(client);
  return new Set(records.keys());
}

/**
 * Executes pending database schema migrations.
 * 
 * CHECKSUM ENFORCEMENT:
 * - For every already-applied migration:
 *   - Stored checksum is retrieved from schema_migrations
 *   - Computed SHA-256 of current migration file is compared
 *   - MATCH -> skip migration
 *   - MISMATCH -> throw fatal error immediately and abort
 *   - Applied migrations must NEVER be modified in-place or silently skipped.
 */
export async function runMigrations(
  client?: DatabaseClient,
  migrationsDir?: string
): Promise<{ applied: string[]; skipped: string[] }> {
  const db = client || getDatabaseClient();
  await ensureMigrationTable(db);

  const appliedMap = await getAppliedMigrationRecords(db);
  const migrationFiles = loadMigrationFiles(migrationsDir);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const migration of migrationFiles) {
    const appliedRecord = appliedMap.get(migration.version);

    if (appliedRecord) {
      // Checksum verification: ensure migration script has not been modified after being applied
      if (!appliedRecord.checksum || appliedRecord.checksum !== migration.checksum) {
        throw new Error(
          `[Omnicore DB Fatal] Migration checksum mismatch for version ${migration.version} (${migration.name}). ` +
          `Stored checksum: ${appliedRecord.checksum || '(none)'}, Computed checksum: ${migration.checksum}. ` +
          `Applied migrations must never be modified in-place.`
        );
      }
      skipped.push(`${migration.version}_${migration.name}`);
      continue;
    }

    // Run migration in a transaction
    await db.withTransaction(async (tx) => {
      // Execute the SQL script
      await tx.exec(migration.sql);

      // Record migration with cryptographic checksum
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

export function loadSeedFiles(seedsDir?: string): { name: string; filePath: string; sql: string }[] {
  const dir = seedsDir || path.join(process.cwd(), 'server/db/seeds');
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
    return { name: file, filePath, sql };
  });
}

/**
 * Seeds the database with development/test demo data.
 * 
 * ENVIRONMENT SAFETY:
 * - Demo seeds are strictly prohibited in production unless ALLOW_DEMO_SEED=true is set.
 */
export async function runSeeds(
  client?: DatabaseClient,
  seedsDir?: string,
  options?: { allowProduction?: boolean }
): Promise<{ applied: string[] }> {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !options?.allowProduction && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      '[Omnicore DB Fatal] Demo seed execution is strictly prohibited in production unless ALLOW_DEMO_SEED=true is explicitly set.'
    );
  }

  const db = client || getDatabaseClient();
  const seedFiles = loadSeedFiles(seedsDir);
  const applied: string[] = [];

  for (const seed of seedFiles) {
    await db.withTransaction(async (tx) => {
      await tx.exec(seed.sql);
    });
    applied.push(seed.name);
  }

  return { applied };
}

// CLI Execution Support
const isDirectCliRun = Boolean(process.argv[1] && (process.argv[1].endsWith('migrator.ts') || process.argv[1].endsWith('migrator.js') || process.argv[1].includes('migrator')));
if (isDirectCliRun) {
  const db = getDatabaseClient();
  const withSeed = process.argv.includes('--with-seed') || process.argv.includes('--seed');
  console.log(`[Omnicore DB] Running database migrations...`);

  runMigrations(db)
    .then(async (result) => {
      console.log(`[Omnicore DB] Migrations complete. Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
      if (result.applied.length > 0) {
        console.log(`Applied migrations: ${result.applied.join(', ')}`);
      }

      if (withSeed) {
        console.log(`[Omnicore DB] Running demo seeds...`);
        const seedResult = await runSeeds(db);
        console.log(`[Omnicore DB] Seeds applied: ${seedResult.applied.join(', ')}`);
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
      console.error('[Omnicore DB] Migration/Seed failed:', err);
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

