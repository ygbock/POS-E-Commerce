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

export function getDatabaseClient(): DatabaseClient {
  if (activeDbInstance) {
    return activeDbInstance;
  }

  const databaseUrl = process.env.DATABASE_URL;
  const pgHost = process.env.PGHOST;

  if (databaseUrl || (pgHost && pgHost !== 'localhost')) {
    activeDbInstance = new PostgresPoolClient(databaseUrl);
  } else {
    // Embedded PostgreSQL engine (PGlite) for local development, tests, or standalone execution
    const dataDir = process.env.NODE_ENV === 'test' ? undefined : path.join(process.cwd(), '.data/postgres');
    activeDbInstance = new PGliteDatabaseClient(dataDir);
  }

  return activeDbInstance;
}

export function createIsolatedTestClient(): DatabaseClient {
  return new PGliteDatabaseClient();
}
