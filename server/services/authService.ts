import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';
import { UserRepository, UserRecord } from '../repositories/userRepository';
import { hashPassword, verifyPassword } from '../auth/password';
import { UserRole, getPermissionsForRole, normalizeRole, getIdentityTypeForRole, AuthIdentityType, isPlatformRole } from '../auth/roles';
import { signToken, verifyToken, TokenClaims } from '../auth/token';
import { createAuthSession, generateRefreshToken, hashRefreshToken, findSessionByRefreshToken, findSessionByAccessJti, listUserSessions, revokeUserSession, replaceAuthSession, revokeAuthSession, revokeAuthSessionFamily, revokeAllUserSessions, touchAuthSession, ACCESS_SESSION_TTL_SECONDS, REFRESH_SESSION_TTL_SECONDS } from '../auth/session';

export interface LoginResult {
  token: string;
  /** Internal-only refresh credential. Defined non-enumerably so API JSON never exposes it. */
  refreshToken?: string;
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: UserRole;
    identityType: AuthIdentityType;
    permissions: string[];
    locationId?: string | null;
  };
}

export class AuthService {
  private userRepo: UserRepository;
  private db: DatabaseClient;

  constructor(clientOrUserRepo?: DatabaseClient | UserRepository, maybeAuditRepoOrClient?: any) {
    if (clientOrUserRepo && typeof (clientOrUserRepo as any).createUser === 'function') {
      this.userRepo = clientOrUserRepo as UserRepository;
      this.db = (clientOrUserRepo as any).defaultClient || (maybeAuditRepoOrClient && typeof maybeAuditRepoOrClient.query === 'function' ? maybeAuditRepoOrClient : getDatabaseClient());
    } else {
      this.db = (clientOrUserRepo as DatabaseClient) || getDatabaseClient();
      this.userRepo = new UserRepository(this.db);
    }
  }

  /**
   * Authenticate a user with email, password, and mandatory organization ID.
   * Fail-closed: Never falls back to default tenant implicitly.
   */

  private async attachSecureSession(
    result: LoginResult,
    input: {
      userId: string;
      organizationId: string;
      identityType: AuthIdentityType;
      role: UserRole;
      deviceId?: string | null;
      userAgent?: string | null;
      ipAddress?: string | null;
    },
  ): Promise<LoginResult> {
    const claims = verifyToken(result.token);
    const refreshToken = generateRefreshToken();
    const now = Date.now();
    await createAuthSession(this.db, {
      userId: input.userId,
      organizationId: input.organizationId,
      identityType: input.identityType,
      role: input.role,
      accessJti: claims.jti,
      refreshToken,
      deviceId: input.deviceId,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      accessExpiresAt: new Date(now + ACCESS_SESSION_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(now + REFRESH_SESSION_TTL_SECONDS * 1000),
    });
    Object.defineProperty(result, 'refreshToken', {
      value: refreshToken,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return result;
  }

  async refreshSession(refreshToken: string): Promise<LoginResult> {
    if (!refreshToken || refreshToken.length < 40) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const session = await findSessionByRefreshToken(this.db, refreshToken);
    if (!session) throw new Error('INVALID_REFRESH_TOKEN');

    if (session.revoked_at) {
      // A previously rotated refresh token was presented again. Revoke the entire
      // family so an attacker cannot continue using a stolen descendant token.
      await revokeAuthSessionFamily(this.db, session.refresh_token_family_id, 'refresh-token-reuse');
      throw new Error('REFRESH_TOKEN_REUSE_DETECTED');
    }

    if (new Date(session.refresh_expires_at).getTime() <= Date.now()) {
      await revokeAuthSession(this.db, session.id, 'refresh-expired');
      throw new Error('REFRESH_TOKEN_EXPIRED');
    }

    const permissions = getPermissionsForRole(session.role);
    const accessToken = signToken({
      userId: session.user_id,
      email: undefined,
      organizationId: session.organization_id,
      role: session.role,
      identityType: session.identity_type,
      permissions,
      expiresInSeconds: ACCESS_SESSION_TTL_SECONDS,
    });
    const accessClaims = verifyToken(accessToken);
    const nextRefreshToken = generateRefreshToken();
    const nextSession = await createAuthSession(this.db, {
      userId: session.user_id,
      organizationId: session.organization_id,
      identityType: session.identity_type,
      role: session.role,
      accessJti: accessClaims.jti,
      refreshToken: nextRefreshToken,
      refreshFamilyId: session.refresh_token_family_id,
      deviceId: session.device_id,
      userAgent: session.user_agent,
      ipAddress: session.ip_address,
      accessExpiresAt: new Date(Date.now() + ACCESS_SESSION_TTL_SECONDS * 1000),
      refreshExpiresAt: new Date(session.refresh_expires_at),
    });
    await replaceAuthSession(this.db, session.id, nextSession.id);

    const user = await this.userRepo.findById(session.user_id, session.organization_id);
    if (!user || !user.is_active) {
      await revokeAuthSession(this.db, nextSession.id, 'user-inactive');
      throw new Error('INVALID_REFRESH_TOKEN');
    }

    const result: LoginResult = {
      token: accessToken,
      user: {
        id: user.id,
        organizationId: user.organization_id,
        email: user.email,
        name: user.name,
        role: session.role,
        identityType: session.identity_type,
        permissions,
        locationId: user.location_id,
      },
    };
    Object.defineProperty(result, 'refreshToken', {
      value: nextRefreshToken,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    return result;
  }

  async logoutWithRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    const session = await findSessionByRefreshToken(this.db, refreshToken);
    if (session) {
      await revokeAuthSession(this.db, session.id, 'logout');
      return;
    }
    // A rotated refresh token is already revoked; revoke its family to fail
    // closed if a stale credential is being replayed during logout.
    const anySession = await this.db.query<{ refresh_token_family_id: string }>(
      'SELECT refresh_token_family_id FROM auth_sessions WHERE refresh_token_hash=$1 LIMIT 1',
      [hashRefreshToken(refreshToken)],
    );
    if (anySession.rows[0]) {
      await revokeAuthSessionFamily(this.db, anySession.rows[0].refresh_token_family_id, 'logout-stale-refresh');
    }
  }

  async logoutAllSessions(userId: string): Promise<void> {
    await revokeAllUserSessions(this.db, userId, 'logout-all');
  }

  async listSessions(userId: string) {
    const sessions = await listUserSessions(this.db, userId);
    return sessions.map(session => ({
      id: session.id,
      userId: session.user_id,
      organizationId: session.organization_id,
      identityType: session.identity_type,
      role: session.role,
      deviceId: session.device_id,
      userAgent: session.user_agent,
      ipAddress: session.ip_address,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      accessExpiresAt: session.access_expires_at,
      refreshExpiresAt: session.refresh_expires_at,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    return revokeUserSession(this.db, userId, sessionId);
  }

  async registerBusinessOwner(input: {
    name: string;
    email: string;
    password: string;
    businessName: string;
    businessMode: 'DISCOVERY_ONLY' | 'DISCOVERY_AND_STORE';
  }): Promise<{
    token: string;
    user: LoginResult['user'];
    business: { id: string; publicId: string; name: string; slug: string; businessMode: string; listingStatus: string };
  }> {
    const name = input.name.trim();
    const email = input.email.toLowerCase().trim();
    const businessName = input.businessName.trim();
    const password = input.password;

    if (!name || name.length < 2) throw new Error('VALIDATION_ERROR: Full name is required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('VALIDATION_ERROR: A valid email address is required.');
    if (!password || password.length < 12) throw new Error('VALIDATION_ERROR: Password must be at least 12 characters.');
    if (!businessName || businessName.length < 2) throw new Error('VALIDATION_ERROR: Business name is required.');
    if (!['DISCOVERY_ONLY', 'DISCOVERY_AND_STORE'].includes(input.businessMode)) {
      throw new Error('VALIDATION_ERROR: A valid business mode is required.');
    }

    const existing = await this.db.query('SELECT id FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
    if (existing.rows.length) throw new Error('EMAIL_ALREADY_REGISTERED: An account with this email already exists.');

    const baseSlug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'business';
    const idSuffix = randomUUID().replace(/-/g, '').slice(0, 12);
    const organizationId = `org_merchant_${idSuffix}`;
    const organizationCode = `MERCHANT_${idSuffix.toUpperCase()}`;
    const userId = `usr_${randomUUID()}`;
    const businessId = `disc_${randomUUID()}`;
    const publicId = `biz_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const slug = `${baseSlug}-${idSuffix.slice(0, 6)}`;
    const { hash, salt } = hashPassword(password);

    await this.db.query('BEGIN');
    try {
      await this.db.query(
        `INSERT INTO organizations (id,name,code,slug,plan_tier,is_active,policies)
         VALUES ($1,$2,$3,$4,'starter',TRUE,
           '{"freeShippingThreshold": "75.00", "standardShippingFee": "9.99", "expressShippingFee": "19.99", "shippingPolicy": "Standard shipping delivers within 3-5 business days.", "returnPolicy": "Returns accepted within 30 days of receipt in original condition.", "warrantyPolicy": "Standard 1-year manufacturer warranty applies to all electronics.", "deliveryPromise": "Orders placed before 2 PM dispatch same-day.", "pickupEnabled": true, "pickupInstructions": "Ready for pickup within 2 hours at your selected branch."}'::jsonb
         )`,
        [organizationId, businessName, organizationCode, `${baseSlug}-${idSuffix.slice(0, 6)}`],
      );

      await this.db.query(
        `INSERT INTO users (id,organization_id,email,name,password_hash,password_salt,role,is_active)
         VALUES ($1,$2,$3,$4,$5,$6,'business_owner',TRUE)`,
        [userId, organizationId, email, name, hash, salt],
      );

      await this.db.query(
        `INSERT INTO discovery_businesses
         (id,public_id,organization_id,name,slug,short_description,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT','UNVERIFIED',FALSE,$8)`,
        [
          businessId,
          publicId,
          input.businessMode === 'DISCOVERY_ONLY' ? null : organizationId,
          businessName,
          slug,
          `New ${businessName} listing on AbaCha.`,
          input.businessMode,
          userId,
        ],
      );

      await this.db.query(
        `INSERT INTO discovery_business_settings (business_id) VALUES ($1)`,
        [businessId],
      );

      await this.db.query(
        `INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
         VALUES ($1,$2,'OWNER',TRUE)`,
        [businessId, userId],
      );

      await this.db.query(
        `INSERT INTO organization_subscriptions
         (id,organization_id,plan_id,status,current_period_start,current_period_end,trial_ends_at,metadata)
         SELECT $1,$2::varchar,COALESCE((SELECT id FROM subscription_plans WHERE code='starter' LIMIT 1),'plan_starter'),
                'trialing',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP + INTERVAL '14 days',
                CURRENT_TIMESTAMP + INTERVAL '14 days',jsonb_build_object('source','merchant_signup')
         WHERE NOT EXISTS (SELECT 1 FROM organization_subscriptions WHERE organization_id=$2::varchar)`,
        [`sub_${idSuffix}`, organizationId],
      );

      await this.db.query('COMMIT');
    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }

    const permissions = getPermissionsForRole('business_owner');
    const token = signToken({
      userId,
      email,
      organizationId,
      role: 'business_owner',
      identityType: 'business_owner',
      permissions,
      expiresInSeconds: ACCESS_SESSION_TTL_SECONDS,
    });

    const result: LoginResult = {
      token,
      user: { id: userId, organizationId, email, name, role: 'business_owner', identityType: 'business_owner', permissions },
      business: { id: businessId, publicId, name: businessName, slug, businessMode: input.businessMode, listingStatus: 'DRAFT' },
    } as any;
    await this.attachSecureSession(result, {
      userId,
      organizationId,
      identityType: 'business_owner',
      role: 'business_owner',
    });
    return result;
  }

  async login(credentials: {
    email: string;
    password: string;
    organizationId?: string;
  }): Promise<LoginResult> {
    const email = credentials.email.toLowerCase().trim();
    if (!email || !credentials.password) throw new Error('Invalid email or password');

    let orgId = credentials.organizationId?.trim() || '';

    // If no tenant was supplied, resolve it from the email. Never allow the
    // client to select an arbitrary tenant when the account belongs elsewhere.
    if (!orgId) {
      const matches = await this.db.query<UserRecord>(
        `SELECT u.* FROM users u
         JOIN organizations o ON o.id = u.organization_id
         WHERE LOWER(u.email) = LOWER($1)
           AND u.is_active = true
           AND o.is_active = true
         LIMIT 2`,
        [email],
      );
      if (matches.rows.length === 0) throw new Error('Invalid email or password');
      if (matches.rows.length > 1) throw new Error('TENANT_SELECTION_REQUIRED: This account belongs to multiple organizations');
      orgId = matches.rows[0].organization_id;
    }
    if (!(await this.isOrganizationActive(orgId))) {
      throw new Error('INACTIVE_ORGANIZATION: Organization is inactive');
    }

    const user = await this.userRepo.findByEmail(orgId, email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_active) {
      throw new Error('User account is deactivated');
    }

    const isValid = verifyPassword(credentials.password, user.password_hash, user.password_salt);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Canonicalize the persisted role before issuing the session. This keeps
    // role-based routing/authorization stable even when legacy seed data contains
    // casing, spaces, or hyphenated role names.
    const role = normalizeRole(user.role);
    // Control-plane identities must use the dedicated platform authentication
    // boundary. Never issue a platform session from the tenant login endpoint.
    if (isPlatformRole(role)) {
      throw new Error('PLATFORM_LOGIN_REQUIRED: Platform operators must sign in through the platform control plane.');
    }
    const permissions = getPermissionsForRole(role);
    const token = signToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role,
      identityType: getIdentityTypeForRole(role),
      permissions,
      locationId: user.location_id,
      expiresInSeconds: ACCESS_SESSION_TTL_SECONDS,
    });

    const result: LoginResult = {
      token,
      user: {
        id: user.id,
        organizationId: user.organization_id,
        email: user.email,
        name: user.name,
        role,
        identityType: getIdentityTypeForRole(role),
        permissions,
        locationId: user.location_id,
      },
    };
    await this.attachSecureSession(result, {
      userId: user.id,
      organizationId: user.organization_id,
      identityType: getIdentityTypeForRole(role),
      role,
    });
    return result;
  }

  /**
   * Platform control-plane authentication. This is intentionally separate from
   * tenant/business authentication: the email must resolve to a platform role,
   * and tenant selection is never accepted from the client.
   */
  async loginPlatform(credentials: { email: string; password: string }): Promise<LoginResult> {
    const email = credentials.email.toLowerCase().trim();
    if (!email || !credentials.password) throw new Error('Invalid platform credentials');

    const queryResult = await this.db.query<UserRecord>(
      `SELECT u.*
         FROM users u
         WHERE LOWER(u.email)=LOWER($1)
           AND u.is_active=TRUE
           AND u.role IN ('system_owner','platform_admin','platform_support','platform_finance')
         LIMIT 1`,
      [email],
    );
    const user = queryResult.rows[0];
    if (!user) throw new Error('Invalid platform credentials');
    const role = normalizeRole(user.role);
    if (!isPlatformRole(role)) throw new Error('PLATFORM_ACCESS_DENIED');
    if (!verifyPassword(credentials.password, user.password_hash, user.password_salt)) {
      throw new Error('Invalid platform credentials');
    }

    const permissions = getPermissionsForRole(role);
    const token = signToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role,
      identityType: 'platform',
      permissions,
      locationId: user.location_id,
      expiresInSeconds: ACCESS_SESSION_TTL_SECONDS,
    });
    const result: LoginResult = {
      token,
      user: {
        id: user.id,
        organizationId: user.organization_id,
        email: user.email,
        name: user.name,
        role,
        identityType: 'platform',
        permissions,
        locationId: user.location_id,
      },
    };
    await this.attachSecureSession(result, {
      userId: user.id,
      organizationId: user.organization_id,
      identityType: 'platform',
      role,
    });
    return result;
  }

  /**
   * Authoritatively verify an incoming token, ensuring it has not been revoked.
   */
  async verifySession(token: string): Promise<TokenClaims> {
    const claims = verifyToken(token);

    // Check revocation in database
    if (claims.jti) {
      const isRevoked = await this.userRepo.isTokenRevoked(claims.jti);
      if (isRevoked) {
        const err: any = new Error('Token has been revoked');
        err.code = 'REVOKED';
        throw err;
      }

      // If this access token belongs to a V2 server session, the session record
      // is authoritative for revocation. Legacy/test-issued JWTs without a
      // session row remain compatible during the migration window.
      const session = await findSessionByAccessJti(this.db, claims.jti);
      if (session?.revoked_at) {
        const err: any = new Error('Session has been revoked');
        err.code = 'REVOKED';
        throw err;
      }
      if (session) await touchAuthSession(this.db, session.id);
    }

    return claims;
  }

  /**
   * Revalidate tenant lifecycle state for an authenticated session.
   * Platform identities are intentionally handled separately from tenant users.
   */
  async isOrganizationActive(organizationId: string): Promise<boolean> {
    if (!organizationId || typeof organizationId !== 'string') return false;
    const result = await this.db.query<{ is_active: boolean }>(
      'SELECT is_active FROM organizations WHERE id = $1 LIMIT 1',
      [organizationId],
    );
    return result.rows[0]?.is_active === true;
  }

  /**
   * Invalidate/logout a token session.
   */
  async logout(token: string): Promise<void> {
    try {
      const claims = verifyToken(token);
      if (claims.jti) {
        const expiresAt = new Date(claims.exp * 1000);
        await this.userRepo.revokeToken(claims.jti, claims.sub, expiresAt);
        const session = await this.db.query<{ id: string }>(
          'SELECT id FROM auth_sessions WHERE access_jti = $1 LIMIT 1',
          [claims.jti],
        );
        if (session.rows[0]) await revokeAuthSession(this.db, session.rows[0].id, 'logout');
      }
    } catch {
      // If token is already invalid or expired, no revocation needed.
    }
  }


  async requestPasswordReset(emailInput: string, organizationId?: string): Promise<void> {
    const email = emailInput.toLowerCase().trim();
    if (!email) return;
    let orgId = organizationId?.trim() || '';
    if (!orgId) {
      const matches = await this.db.query<UserRecord>(
        `SELECT u.* FROM users u JOIN organizations o ON o.id = u.organization_id
         WHERE LOWER(u.email)=LOWER($1) AND u.is_active=true AND o.is_active=true LIMIT 2`,
        [email],
      );
      if (matches.rows.length !== 1) return;
      orgId = matches.rows[0].organization_id;
    }
    const user = await this.userRepo.findByEmail(orgId, email);
    if (!user || !user.is_active) return;

    const rawToken = require('crypto').randomBytes(32).toString('base64url');
    const tokenHash = require('crypto').createHash('sha256').update(rawToken).digest('hex');
    const id = require('crypto').randomBytes(24).toString('hex');
    await this.db.query('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND used_at IS NULL', [user.id]);
    await this.db.query(
      'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES ($1,$2,$3,CURRENT_TIMESTAMP + INTERVAL \'30 minutes\')',
      [id, user.id, tokenHash],
    );
    // Delivery is deliberately kept behind an application integration boundary.
    // Do not log or return the raw token in production.
    const resetUrl = process.env.PASSWORD_RESET_URL;
    if (!resetUrl) throw new Error('PASSWORD_RESET_DELIVERY_NOT_CONFIGURED');
    // The mail/SMS provider integration should consume this event without exposing the token.
    await this.db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, details, created_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
      [require('crypto').randomBytes(16).toString('hex'), orgId, user.id, 'password_reset_requested',
       JSON.stringify({ resetUrl: `${resetUrl}?token=${rawToken}` })],
    );
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (!rawToken || !newPassword || newPassword.length < 12) throw new Error('VALIDATION_ERROR: Password must be at least 12 characters');
    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const result = await this.db.query<UserRecord & { token_id: string }>(
      `SELECT u.*, p.id AS token_id FROM password_reset_tokens p
       JOIN users u ON u.id=p.user_id
       WHERE p.token_hash=$1 AND p.used_at IS NULL AND p.expires_at>CURRENT_TIMESTAMP
       LIMIT 1`,
      [tokenHash],
    );
    if (!result.rows[0]) throw new Error('INVALID_RESET_TOKEN');
    const row:any=result.rows[0];
    const hashed=hashPassword(newPassword);
    await this.db.query('BEGIN');
    try {
      await this.db.query('UPDATE users SET password_hash=$1,password_salt=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3',[hashed.hash,hashed.salt,row.id]);
      await this.db.query('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE id=$1',[row.token_id]);
      await this.db.query('UPDATE revoked_tokens SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=$1 AND revoked_at IS NULL',[row.id]);
      await this.db.query('COMMIT');
    } catch(e){ await this.db.query('ROLLBACK'); throw e; }
  }

  /**
   * Provision the first tenant administrator using a server-side bootstrap secret.
   * This is intentionally one-time: once any active admin/super_admin exists for
   * the organization, bootstrap is permanently refused for that organization.
   */
  async bootstrapInitialAdmin(input: {
    bootstrapSecret: string;
    email: string;
    name: string;
    password: string;
    organizationId?: string;
  }): Promise<LoginResult['user']> {
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
    if (!expectedSecret || expectedSecret.length < 32) {
      throw new Error('BOOTSTRAP_DISABLED: ADMIN_BOOTSTRAP_SECRET is not configured securely');
    }
    if (!input.bootstrapSecret || input.bootstrapSecret !== expectedSecret) {
      throw new Error('BOOTSTRAP_FORBIDDEN: Invalid bootstrap credentials');
    }

    const orgId = (input.organizationId || 'org_default').trim();
    const email = input.email.toLowerCase().trim();
    const name = input.name.trim();

    if (!email || !name || !input.password || input.password.length < 12) {
      throw new Error('VALIDATION_ERROR: email, name and a password of at least 12 characters are required');
    }

    if (!(await this.isOrganizationActive(orgId))) {
      throw new Error('INACTIVE_ORGANIZATION: Organization is inactive');
    }

    const existingAdmins = await this.userRepo.countActiveAdmins(orgId);
    if (existingAdmins > 0) {
      throw new Error('BOOTSTRAP_ALREADY_COMPLETED: An active administrator already exists');
    }

    const existing = await this.userRepo.findByEmail(orgId, email);
    if (existing) {
      throw new Error('BOOTSTRAP_USER_EXISTS: A user with this email already exists');
    }

    const { hash, salt } = hashPassword(input.password);
    const user = await this.userRepo.createUser({
      organization_id: orgId,
      email,
      name,
      password_hash: hash,
      password_salt: salt,
      role: 'super_admin',
      is_active: true,
    });

    const permissions = getPermissionsForRole(user.role);
    return {
      id: user.id,
      organizationId: user.organization_id,
      email: user.email,
      name: user.name,
      role: user.role,
      identityType: 'staff',
      permissions,
      locationId: user.location_id,
    };
  }

  /**
   * Seed standard system users if they do not already exist.
   * Ensures development and tests have valid credentials immediately when explicitly enabled.
   * STRICTLY FORBIDDEN IN PRODUCTION.
   */
  async seedDefaultUsers(): Promise<void> {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEEDING_IN_PRODUCTION !== 'true') {
      throw new Error('CRITICAL SECURITY VIOLATION: seedDefaultUsers() must NEVER execute in production');
    }

    const orgDefault = 'org_default';

    // Ensure organizations exist
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active)
       VALUES ('org_default', 'AbaCha Global Retail Ltd', 'ABACHA_DEFAULT', TRUE)
       ON CONFLICT (id) DO NOTHING`
    );

    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active)
       VALUES ('org_secondary', 'Secondary Tenant Ltd', 'TENANT_SEC', TRUE)
       ON CONFLICT (id) DO NOTHING`
    );

    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active)
       VALUES ('org_ygbock', 'Ygbock Commerce Hub', 'YGBOCK_HUB', TRUE)
       ON CONFLICT (id) DO NOTHING`
    );

    // Two listing only businesses
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active, plan_tier, slug)
       VALUES ('org_list_only_1', 'Freetown General Services Ltd', 'LIST_ONLY_1', TRUE, 'starter', 'freetown-general-ltd')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active, plan_tier, slug)
       VALUES ('org_list_only_2', 'Kono Artisanal Crafts Ltd', 'LIST_ONLY_2', TRUE, 'starter', 'kono-artisanal-crafts-ltd')
       ON CONFLICT (id) DO NOTHING`
    );

    // Two listing + inventory businesses
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active, plan_tier, slug)
       VALUES ('org_list_inv_1', 'Bo Electronics & Spare Parts Ltd', 'LIST_INV_1', TRUE, 'professional', 'bo-electronics-spare-parts-ltd')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active, plan_tier, slug)
       VALUES ('org_list_inv_2', 'Makeni Supermarket & Retail Ltd', 'LIST_INV_2', TRUE, 'professional', 'makeni-supermarket-retail-ltd')
       ON CONFLICT (id) DO NOTHING`
    );

    // Explicitly update and backfill standard shipping policies for all seeded organisations
    await this.db.query(
      `UPDATE organizations
       SET policies = '{"freeShippingThreshold": 75.00, "standardShippingFee": 9.99, "expressShippingFee": 19.99, "shippingPolicy": "Standard shipping delivers within 3-5 business days.", "returnPolicy": "Returns accepted within 30 days of receipt in original condition.", "warrantyPolicy": "Standard 1-year manufacturer warranty applies.", "deliveryPromise": "Orders placed before 2 PM dispatch same-day.", "pickupEnabled": true, "pickupInstructions": "Ready for pickup within 2 hours."}'::jsonb
       WHERE id IN ('org_default', 'org_secondary', 'org_ygbock', 'org_list_only_1', 'org_list_only_2', 'org_list_inv_1', 'org_list_inv_2')
          OR policies = '{}'::jsonb
          OR policies IS NULL`
    );

    const systemOwnerEmail = (process.env.ABACHA_SYSTEM_OWNER_EMAIL || 'systemowner@abacha.internal').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(systemOwnerEmail)) {
      throw new Error('SYSTEM_OWNER_SEED_EMAIL_INVALID: Set ABACHA_SYSTEM_OWNER_EMAIL to a valid email address.');
    }

    const systemOwnerPassword = process.env.ABACHA_SYSTEM_OWNER_PASSWORD?.trim();

    const platformAdminEmail = (process.env.ABACHA_PLATFORM_ADMIN_EMAIL || 'platformadmin@abacha.internal').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(platformAdminEmail)) {
      throw new Error('PLATFORM_ADMIN_SEED_EMAIL_INVALID: Set ABACHA_PLATFORM_ADMIN_EMAIL to a valid email address.');
    }

    let platformAdminPassword = process.env.ABACHA_PLATFORM_ADMIN_PASSWORD?.trim();
    if (!platformAdminPassword || platformAdminPassword.length < 12) {
      if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_SEEDING_IN_PRODUCTION === 'true') {
        platformAdminPassword = 'PlatformAdmin123!';
      } else {
        throw new Error('PLATFORM_ADMIN_SEED_PASSWORD_REQUIRED: Set ABACHA_PLATFORM_ADMIN_PASSWORD (minimum 12 characters) before running development seed.');
      }
    }

    const defaultUsers = [
      ...(systemOwnerPassword && systemOwnerPassword.length >= 12 ? [{
        id: 'usr_system_owner',
        orgId: orgDefault,
        email: systemOwnerEmail,
        name: 'AbaCha System Owner',
        role: 'system_owner' as UserRole,
        password: systemOwnerPassword,
      }] : []),
      {
        id: 'usr_platform_admin',
        orgId: orgDefault,
        email: platformAdminEmail,
        name: 'AbaCha Platform Administrator',
        role: 'platform_admin' as UserRole,
        password: platformAdminPassword,
      },
      {
        id: 'usr_super_admin',
        orgId: orgDefault,
        email: 'superadmin@abacha.internal',
        name: 'Super Administrator',
        role: 'super_admin' as UserRole,
        password: 'SuperAdmin123!',
      },
      {
        id: 'usr_admin',
        orgId: orgDefault,
        email: 'admin@abacha.internal',
        name: 'Enterprise Admin',
        role: 'admin' as UserRole,
        password: 'AdminPass123!',
      },
      {
        id: 'usr_manager',
        orgId: orgDefault,
        email: 'manager@abacha.internal',
        name: 'Store Operations Manager',
        role: 'manager' as UserRole,
        password: 'ManagerPass123!',
      },
      {
        id: 'usr_cashier',
        orgId: orgDefault,
        email: 'cashier@abacha.internal',
        name: 'POS Terminal Cashier',
        role: 'cashier' as UserRole,
        password: 'CashierPass123!',
      },
      {
        id: 'usr_inventory_mgr',
        orgId: orgDefault,
        email: 'inventory@abacha.internal',
        name: 'Inventory Controller',
        role: 'inventory_manager' as UserRole,
        password: 'InventoryPass123!',
      },
      {
        id: 'usr_purchasing_mgr',
        orgId: orgDefault,
        email: 'purchasing@abacha.internal',
        name: 'Procurement Specialist',
        role: 'purchasing_manager' as UserRole,
        password: 'PurchasingPass123!',
      },
      {
        id: 'usr_sales',
        orgId: orgDefault,
        email: 'sales@abacha.internal',
        name: 'Retail Sales Rep',
        role: 'sales_user' as UserRole,
        password: 'SalesPass123!',
      },
      {
        id: 'usr_viewer',
        orgId: orgDefault,
        email: 'viewer@abacha.internal',
        name: 'Auditor Viewer',
        role: 'viewer' as UserRole,
        password: 'ViewerPass123!',
      },
      // Tenant Isolation Test User (Belongs to org_secondary)
      {
        id: 'usr_other_admin',
        orgId: 'org_secondary',
        email: 'admin@other.internal',
        name: 'Secondary Tenant Admin',
        role: 'admin' as UserRole,
        password: 'Tenant2Pass123!',
      },
      // Seeded Merchant Owner
      {
        id: 'usr_ygbock',
        orgId: 'org_ygbock',
        email: 'ygbock@gmail.com',
        name: 'Ygbock Merchant Owner',
        role: 'business_owner' as UserRole,
        password: 'MerchantOwner123!',
      },
      // Two listing only businesses
      {
        id: 'usr_merchant_list1',
        orgId: 'org_list_only_1',
        email: 'merchant_list1@abacha.internal',
        name: 'Freetown List Owner',
        role: 'business_owner' as UserRole,
        password: 'MerchantListPass1!',
      },
      {
        id: 'usr_merchant_list2',
        orgId: 'org_list_only_2',
        email: 'merchant_list2@abacha.internal',
        name: 'Kono List Owner',
        role: 'business_owner' as UserRole,
        password: 'MerchantListPass2!',
      },
      // Two listing + inventory businesses
      {
        id: 'usr_merchant_inv1',
        orgId: 'org_list_inv_1',
        email: 'merchant_inv1@abacha.internal',
        name: 'Bo Inv Owner',
        role: 'business_owner' as UserRole,
        password: 'MerchantInvPass1!',
      },
      {
        id: 'usr_merchant_inv2',
        orgId: 'org_list_inv_2',
        email: 'merchant_inv2@abacha.internal',
        name: 'Makeni Inv Owner',
        role: 'business_owner' as UserRole,
        password: 'MerchantInvPass2!',
      },
      // Dummy Platform Admin Account
      {
        id: 'usr_dummy_platform_admin',
        orgId: orgDefault,
        email: 'dummy_admin@abacha.internal',
        name: 'Dummy Platform Admin',
        role: 'platform_admin' as UserRole,
        password: 'DummyAdmin123!',
      },
    ];

    for (const u of defaultUsers) {
      // Reconcile seeded identities by stable ID first. This is critical for
      // platform-admin credentials: the configured email may legitimately change
      // between environments or bootstrap rotations, while usr_platform_admin
      // must remain the same account rather than causing a duplicate-ID insert.
      const existingById = await this.db.query<UserRecord>(
        'SELECT * FROM users WHERE id=$1 AND organization_id=$2 LIMIT 1',
        [u.id, u.orgId],
      );
      const existing = existingById.rows[0] || await this.userRepo.findByEmail(u.orgId, u.email);

      const { hash, salt } = hashPassword(u.password);
      if (!existing) {
        await this.userRepo.createUser({
          id: u.id,
          organization_id: u.orgId,
          email: u.email,
          name: u.name,
          password_hash: hash,
          password_salt: salt,
          role: u.role,
          identity_type: getIdentityTypeForRole(u.role),
          is_active: true,
        });
      } else {
        await this.db.query(
          `UPDATE users
             SET email = $1, name = $2, password_hash = $3, password_salt = $4,
                 role = $5, identity_type = $6, is_active = TRUE, updated_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND organization_id = $8`,
          [u.email, u.name, hash, salt, u.role, getIdentityTypeForRole(u.role), existing.id, u.orgId],
        );
      }
    }

    // Ensure ygbock discovery business, settings and membership exist
    await this.db.query(
      `INSERT INTO discovery_businesses
       (id, public_id, organization_id, name, slug, short_description, business_mode, listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ('disc_ygbock', 'biz_ygbock_123456', 'org_ygbock', 'Ygbock Retail Express', 'ygbock-retail-express', 'AbaCha merchant hub for Ygbock.', 'DISCOVERY_AND_STORE', 'DRAFT', 'UNVERIFIED', FALSE, 'usr_ygbock')
       ON CONFLICT (id) DO NOTHING`
    );

    await this.db.query(
      `INSERT INTO discovery_business_settings (business_id)
       VALUES ('disc_ygbock')
       ON CONFLICT (business_id) DO NOTHING`
    );

    await this.db.query(
      `INSERT INTO discovery_business_memberships (business_id, user_id, role, is_active)
       VALUES ('disc_ygbock', 'usr_ygbock', 'OWNER', TRUE)
       ON CONFLICT (business_id, user_id) DO NOTHING`
    );

    // Two listing only businesses
    await this.db.query(
      `INSERT INTO discovery_businesses
       (id, public_id, organization_id, name, slug, short_description, business_mode, listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ('disc_list_1', 'biz_list_1_987654', NULL, 'Freetown General Services', 'freetown-general', 'Freetown general services listing only business.', 'DISCOVERY_ONLY', 'PUBLISHED', 'VERIFIED', TRUE, 'usr_merchant_list1')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_businesses
       (id, public_id, organization_id, name, slug, short_description, business_mode, listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ('disc_list_2', 'biz_list_2_987654', NULL, 'Kono Artisanal Crafts', 'kono-artisanal', 'Kono artisanal crafts listing only business.', 'DISCOVERY_ONLY', 'PUBLISHED', 'VERIFIED', TRUE, 'usr_merchant_list2')
       ON CONFLICT (id) DO NOTHING`
    );

    // Two listing + inventory businesses
    await this.db.query(
      `INSERT INTO discovery_businesses
       (id, public_id, organization_id, name, slug, short_description, business_mode, listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ('disc_inv_1', 'biz_inv_1_987654', 'org_list_inv_1', 'Bo Electronics & Spare Parts', 'bo-electronics', 'Bo electronics and spare parts listing plus inventory business.', 'DISCOVERY_AND_STORE', 'PUBLISHED', 'VERIFIED', TRUE, 'usr_merchant_inv1')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_businesses
       (id, public_id, organization_id, name, slug, short_description, business_mode, listing_status, verification_status, is_discoverable, created_by_user_id)
       VALUES ('disc_inv_2', 'biz_inv_2_987654', 'org_list_inv_2', 'Makeni Supermarket & Retail', 'makeni-supermarket', 'Makeni supermarket and retail listing plus inventory business.', 'DISCOVERY_AND_STORE', 'PUBLISHED', 'VERIFIED', TRUE, 'usr_merchant_inv2')
       ON CONFLICT (id) DO NOTHING`
    );

    // Settings
    for (const bid of ['disc_list_1', 'disc_list_2', 'disc_inv_1', 'disc_inv_2']) {
      await this.db.query(
        `INSERT INTO discovery_business_settings (business_id)
         VALUES ($1)
         ON CONFLICT (business_id) DO NOTHING`, [bid]
      );
    }

    // Memberships
    await this.db.query(
      `INSERT INTO discovery_business_memberships (business_id, user_id, role, is_active)
       VALUES ('disc_list_1', 'usr_merchant_list1', 'OWNER', TRUE)
       ON CONFLICT (business_id, user_id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_memberships (business_id, user_id, role, is_active)
       VALUES ('disc_list_2', 'usr_merchant_list2', 'OWNER', TRUE)
       ON CONFLICT (business_id, user_id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_memberships (business_id, user_id, role, is_active)
       VALUES ('disc_inv_1', 'usr_merchant_inv1', 'OWNER', TRUE)
       ON CONFLICT (business_id, user_id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_memberships (business_id, user_id, role, is_active)
       VALUES ('disc_inv_2', 'usr_merchant_inv2', 'OWNER', TRUE)
       ON CONFLICT (business_id, user_id) DO NOTHING`
    );

    // Initial Locations for Seeded Businesses
    await this.db.query(
      `INSERT INTO discovery_business_locations (id, business_id, name, location_type, address_line_1, city, district, region, latitude, longitude, is_primary, is_active, location_quality_status, location_source)
       VALUES ('loc_list_1', 'disc_list_1', 'Freetown Central Office', 'OFFICE', '10 Siaka Stevens Street', 'Freetown', 'Western Area Urban', 'Western Area', 8.484, -13.229, TRUE, TRUE, 'HIGH', 'MANUAL')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_locations (id, business_id, name, location_type, address_line_1, city, district, region, latitude, longitude, is_primary, is_active, location_quality_status, location_source)
       VALUES ('loc_list_2', 'disc_list_2', 'Kono Workshop', 'BRANCH', '5 Post Office Road', 'Koidu', 'Kono', 'Eastern Province', 8.643, -10.971, TRUE, TRUE, 'HIGH', 'MANUAL')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_locations (id, business_id, name, location_type, address_line_1, city, district, region, latitude, longitude, is_primary, is_active, location_quality_status, location_source)
       VALUES ('loc_inv_1', 'disc_inv_1', 'Bo Main Branch', 'STORE', '72 Bo-Kenema Highway', 'Bo', 'Bo', 'Southern Province', 7.962, -11.737, TRUE, TRUE, 'HIGH', 'MANUAL')
       ON CONFLICT (id) DO NOTHING`
    );
    await this.db.query(
      `INSERT INTO discovery_business_locations (id, business_id, name, location_type, address_line_1, city, district, region, latitude, longitude, is_primary, is_active, location_quality_status, location_source)
       VALUES ('loc_inv_2', 'disc_inv_2', 'Makeni Central Mall', 'STORE', '15 Rogbaneh Road', 'Makeni', 'Bombali', 'Northern Province', 8.883, -12.043, TRUE, TRUE, 'HIGH', 'MANUAL')
       ON CONFLICT (id) DO NOTHING`
    );
  }
}
