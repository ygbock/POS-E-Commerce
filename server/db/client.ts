import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import fs from 'fs';

export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number | null;
}

export interface DatabaseClient {
  query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>>;
  exec(sql: string): Promise<void>;
  withTransaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isEmbedded(): boolean;
}

class PostgresPoolClient implements DatabaseClient {
  private pool: pg.Pool;

  constructor(connectionString?: string) {
    const config: pg.PoolConfig = connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST || 'localhost',
          port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || 'postgres',
          database: process.env.PGDATABASE || 'omnicore',
          ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
        };

    this.pool = new pg.Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
    const result = await this.pool.query(text, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async withTransaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transactionalClient: DatabaseClient = {
        query: async <R = any>(text: string, params?: any[]) => {
          const res = await client.query(text, params);
          return { rows: res.rows as R[], rowCount: res.rowCount };
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
        withTransaction: async <R = any>(innerCb: (c: DatabaseClient) => Promise<R>) => {
          // Nested transaction / savepoint
          await client.query('SAVEPOINT sp_nested');
          try {
            const res = await innerCb(transactionalClient);
            await client.query('RELEASE SAVEPOINT sp_nested');
            return res;
          } catch (err) {
            await client.query('ROLLBACK TO SAVEPOINT sp_nested');
            throw err;
          }
        },
        close: async () => {},
        isEmbedded: () => false,
      };

      const result = await callback(transactionalClient);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  isEmbedded(): boolean {
    return false;
  }
}

class PGliteDatabaseClient implements DatabaseClient {
  private db: PGlite;

  constructor(dataDir?: string) {
    if (dataDir) {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.db = new PGlite(dataDir);
    } else {
      this.db = new PGlite();
    }
  }

  async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
    const res = await this.db.query(text, params);
    return {
      rows: (res.rows || []) as T[],
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  async withTransaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return (await this.db.transaction(async (tx) => {
      const txClient: DatabaseClient = {
        query: async <R = any>(text: string, params?: any[]) => {
          const r = await tx.query(text, params);
          return {
            rows: (r.rows || []) as R[],
            rowCount: r.affectedRows ?? r.rows.length,
          };
        },
        exec: async (sql: string) => {
          await tx.exec(sql);
        },
        withTransaction: async <R = any>(innerCb: (c: DatabaseClient) => Promise<R>) => {
          return innerCb(txClient);
        },
        close: async () => {},
        isEmbedded: () => true,
      };
      return callback(txClient);
    })) as T;
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  isEmbedded(): boolean {
    return true;
  }
}

let activeDbInstance: DatabaseClient | null = null;

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolves the appropriate database client based on explicit execution environment rules:
 * 
 * NODE_ENV=development
 *   DATABASE_URL or PGHOST present -> PostgreSQL (PostgresPoolClient)
 *   otherwise -> PGlite (PGliteDatabaseClient)
 * 
 * NODE_ENV=test
 *   isolated PGlite permitted (or PostgreSQL if DATABASE_URL/PGHOST explicitly configured)
 * 
 * NODE_ENV=production
 *   valid PostgreSQL configuration required (DATABASE_URL or PGHOST)
 *   missing configuration -> throw fatal error
 *   PostgreSQL connection failure -> throw fatal error
 *   PGlite -> NEVER permitted under any circumstances
 * 
 * Direct conditions only; no indirect heuristics (such as pgHost !== 'localhost').
 */
export function getDatabaseClient(options?: { forceNew?: boolean }): DatabaseClient {
  if (activeDbInstance && !options?.forceNew) {
    return activeDbInstance;
  }

  const env = process.env.NODE_ENV;
  const databaseUrl = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;

  // NODE_ENV=production:
  // - valid PostgreSQL configuration required
  // - missing configuration → throw
  // - PGlite → NEVER permitted
  if (env === 'production') {
    if (!databaseUrl && !pgHost) {
      throw new Error(
        '[Omnicore DB Fatal] Production environment requires a valid PostgreSQL configuration (DATABASE_URL or PGHOST). ' +
        'PGlite is NEVER permitted in production.'
      );
    }
    const client = new PostgresPoolClient(databaseUrl);
    activeDbInstance = client;
    return client;
  }

  // NODE_ENV=test:
  // - isolated PGlite permitted (or PostgreSQL if explicitly configured)
  if (env === 'test') {
    if (databaseUrl || pgHost) {
      const client = new PostgresPoolClient(databaseUrl);
      activeDbInstance = client;
      return client;
    }
    const client = new PGliteDatabaseClient();
    activeDbInstance = client;
    return client;
  }

  // NODE_ENV=development (or default):
  // - DATABASE_URL/PGHOST present → PostgreSQL
  // - otherwise → PGlite
  if (databaseUrl || pgHost) {
    const client = new PostgresPoolClient(databaseUrl);
    activeDbInstance = client;
    return client;
  }

  const dataDir = path.join(process.cwd(), '.data/postgres');
  const client = new PGliteDatabaseClient(dataDir);
  activeDbInstance = client;
  return client;
}

export function resetDatabaseClient(client?: DatabaseClient): void {
  activeDbInstance = client || null;
}

export function createIsolatedTestClient(): DatabaseClient {
  return new PGliteDatabaseClient();
}

