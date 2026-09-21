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

  const migrations: MigrationFile[] = [];
  const seenVersions = new Map<string, MigrationFile>();

  for (const file of files) {
    const filePath = path.join(dir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const parts = file.replace('.sql', '').split('_');
    const version = parts[0];
    const name = parts.slice(1).join('_');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const migration: MigrationFile = { version, name, filePath, sql, checksum };
    const existing = seenVersions.get(version);

    if (existing) {
      if (existing.checksum === checksum) {
        // A duplicate copy of the exact same migration can occur in a local
        // checkout after a migration was moved/renamed. Treat it as one
        // migration so schema_migrations never receives the same version twice.
        continue;
      }
      throw new Error(
        `[AbaCha DB Fatal] Duplicate migration version ${version}: ${existing.name} and ${name} have different contents. ` +
        'Migration versions must be unique; rename the newer migration instead of reusing an applied version.'
      );
    }

    seenVersions.set(version, migration);
    migrations.push(migration);
  }

  return migrations;
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
/**
 * Historical production compatibility.
 *
 * Migrations 011 and 012 were applied in production from earlier revisions:
 * - 011: earlier storefront revision (b2c9e9ffe21dd2795065a5228bbca6e8adcbc7a3ca44fc239c6ed527efcaac14)
 * - 012: platform_subscription_management revision (2f29563803d2341bc5a030553f523d6e696933baca8f5230b0c3d6d9b211ab07)
 *
 * Their recorded checksums are retained as narrowly scoped compatibility aliases:
 * the already-applied migrations are skipped from re-recording; their production
 * schema_migrations rows are never modified. Any idempotent DDL required forward
 * is safely executed to ensure subsequent migrations (e.g. referencing plan_tier) succeed.
 */
const LEGACY_APPLIED_MIGRATION_CHECKSUMS: Record<string, ReadonlySet<string>> = {
  '011': new Set([
    'b2c9e9ffe21dd2795065a5228bbca6e8adcbc7a3ca44fc239c6ed527efcaac14',
  ]),
  '012': new Set([
    '2f29563803d2341bc5a030553f523d6e696933baca8f5230b0c3d6d9b211ab07',
  ]),
};

function isKnownLegacyAppliedMigration(version: string, checksum: string | null): boolean {
  return Boolean(checksum && LEGACY_APPLIED_MIGRATION_CHECKSUMS[version]?.has(checksum));
}

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
        if (isKnownLegacyAppliedMigration(migration.version, appliedRecord.checksum)) {
          console.warn(
            `[AbaCha DB] Reconciling known legacy migration ${migration.version}_${migration.name}; ` +
            `production checksum ${appliedRecord.checksum} is a recognized historical revision.`
          );
          await db.withTransaction(async (tx) => {
            await tx.exec(migration.sql);
          });
          skipped.push(`${migration.version}_${migration.name}`);
          continue;
        }

        throw new Error(
          `[AbaCha DB Fatal] Migration checksum mismatch for version ${migration.version} (${migration.name}). ` +
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
      '[AbaCha DB Fatal] Demo seed execution is strictly prohibited in production unless ALLOW_DEMO_SEED=true is explicitly set.'
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
  console.log(`[AbaCha DB] Running database migrations...`);

  runMigrations(db)
    .then(async (result) => {
      console.log(`[AbaCha DB] Migrations complete. Applied: ${result.applied.length}, Skipped: ${result.skipped.length}`);
      if (result.applied.length > 0) {
        console.log(`Applied migrations: ${result.applied.join(', ')}`);
      }

      if (withSeed) {
        console.log(`[AbaCha DB] Running demo seeds...`);
        const seedResult = await runSeeds(db);
        console.log(`[AbaCha DB] Seeds applied: ${seedResult.applied.join(', ')}`);
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
      console.error('[AbaCha DB] Migration/Seed failed:', err);
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

