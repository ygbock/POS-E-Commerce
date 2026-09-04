import { DatabaseClient, getDatabaseClient } from '../db/client';
import { UserRole } from '../auth/roles';

export interface UserRecord {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  password_hash: string;
  password_salt: string;
  role: UserRole;
  location_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class UserRepository {
  private defaultClient: DatabaseClient;

  constructor(client?: DatabaseClient) {
    this.defaultClient = client || getDatabaseClient();
  }

  private getClient(client?: DatabaseClient): DatabaseClient {
    return client || this.defaultClient;
  }

  async createUser(
    user: {
      id?: string;
      organization_id?: string;
      organizationId?: string;
      email: string;
      name: string;
      password_hash?: string;
      passwordHash?: string;
      password_salt?: string;
      passwordSalt?: string;
      role: UserRole;
      location_id?: string | null;
      locationId?: string | null;
      is_active?: boolean;
    },
    client?: DatabaseClient
  ): Promise<UserRecord> {
    const db = this.getClient(client);
    const userId = user.id || `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const orgId = user.organization_id || user.organizationId || 'org_default';
    const passHash = user.password_hash || user.passwordHash || '';
    const passSalt = user.password_salt || user.passwordSalt || 'default_salt';
    const locId = user.location_id || user.locationId || null;

    const res = await db.query<UserRecord>(
      `INSERT INTO users (
        id, organization_id, email, name, password_hash, password_salt,
        role, location_id, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        userId,
        orgId,
        user.email.toLowerCase().trim(),
        user.name.trim(),
        passHash,
        passSalt,
        user.role,
        locId,
        user.is_active ?? true,
      ]
    );
    return res.rows[0];
  }

  async findByEmail(organizationId: string, email: string, client?: DatabaseClient): Promise<UserRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<UserRecord>(
      `SELECT * FROM users WHERE organization_id = $1 AND LOWER(email) = LOWER($2) LIMIT 1`,
      [organizationId, email.trim()]
    );
    return res.rows[0] || null;
  }

  async findById(id: string, client?: DatabaseClient): Promise<UserRecord | null> {
    const db = this.getClient(client);
    const res = await db.query<UserRecord>(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async listByOrg(organizationId: string, client?: DatabaseClient): Promise<UserRecord[]> {
    const db = this.getClient(client);
    const res = await db.query<UserRecord>(
      `SELECT * FROM users WHERE organization_id = $1 ORDER BY name ASC`,
      [organizationId]
    );
    return res.rows;
  }

  async updateUser(id: string, updates: Partial<UserRecord>, client?: DatabaseClient): Promise<UserRecord | null> {
    const db = this.getClient(client);
    const existing = await this.findById(id, client);
    if (!existing) return null;

    const merged = {
      name: updates.name ?? existing.name,
      role: updates.role ?? existing.role,
      location_id: updates.location_id !== undefined ? updates.location_id : existing.location_id,
      is_active: updates.is_active ?? existing.is_active,
      password_hash: updates.password_hash ?? existing.password_hash,
      password_salt: updates.password_salt ?? existing.password_salt,
    };

    const res = await db.query<UserRecord>(
      `UPDATE users SET
        name = $1,
        role = $2,
        location_id = $3,
        is_active = $4,
        password_hash = $5,
        password_salt = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *`,
      [
        merged.name,
        merged.role,
        merged.location_id,
        merged.is_active,
        merged.password_hash,
        merged.password_salt,
        id,
      ]
    );
    return res.rows[0] || null;
  }

  async revokeToken(
    jti: string,
    userId: string,
    expiresAt: Date,
    reasonOrClient?: string | DatabaseClient,
    maybeClient?: DatabaseClient
  ): Promise<void> {
    const client = typeof reasonOrClient === 'object' && reasonOrClient !== null ? reasonOrClient : maybeClient;
    const db = this.getClient(client);
    await db.query(
      `INSERT INTO revoked_tokens (token_jti, user_id, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_jti) DO NOTHING`,
      [jti, userId, expiresAt.toISOString()]
    );
  }

  async isTokenRevoked(jti: string, client?: DatabaseClient): Promise<boolean> {
    const db = this.getClient(client);
    const res = await db.query(
      `SELECT 1 FROM revoked_tokens WHERE token_jti = $1 LIMIT 1`,
      [jti]
    );
    return res.rows.length > 0;
  }
}
