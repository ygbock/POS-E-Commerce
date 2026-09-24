import { randomUUID } from 'node:crypto';
import { DatabaseClient, getDatabaseClient } from '../db/client';
import { UserRepository, UserRecord } from '../repositories/userRepository';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken, verifyToken, TokenClaims } from '../auth/token';
import { UserRole, getPermissionsForRole, normalizeRole } from '../auth/roles';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    organizationId: string;
    email: string;
    name: string;
    role: UserRole;
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
        `INSERT INTO organizations (id,name,code,slug,plan_tier,is_active)
         VALUES ($1,$2,$3,$4,'starter',TRUE)`,
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
      permissions,
    });

    return {
      token,
      user: { id: userId, organizationId, email, name, role: 'business_owner', permissions },
      business: { id: businessId, publicId, name: businessName, slug, businessMode: input.businessMode, listingStatus: 'DRAFT' },
    };
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

    const permissions = getPermissionsForRole(user.role);
    const token = signToken({
      userId: user.id,
      email: user.email,
      organizationId: user.organization_id,
      role: user.role,
      permissions,
      locationId: user.location_id,
    });

    return {
      token,
      user: {
        id: user.id,
        organizationId: user.organization_id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
        locationId: user.location_id,
      },
    };
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
      }
    } catch {
      // If token is already invalid or expired, no revocation needed
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
    if (process.env.NODE_ENV === 'production') {
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

    let platformAdminPassword = process.env.ABACHA_PLATFORM_ADMIN_PASSWORD?.trim();
    if (!platformAdminPassword || platformAdminPassword.length < 12) {
      if (process.env.NODE_ENV !== 'production') {
        platformAdminPassword = 'PlatformAdmin123!';
      } else {
        throw new Error('PLATFORM_ADMIN_SEED_PASSWORD_REQUIRED: Set ABACHA_PLATFORM_ADMIN_PASSWORD (minimum 12 characters) before running development seed.');
      }
    }

    const defaultUsers = [
      {
        id: 'usr_platform_admin',
        orgId: orgDefault,
        email: 'platformadmin@abacha.internal',
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
    ];

    for (const u of defaultUsers) {
      const existing = await this.userRepo.findByEmail(u.orgId, u.email);
      if (!existing) {
        const { hash, salt } = hashPassword(u.password);
        await this.userRepo.createUser({
          id: u.id,
          organization_id: u.orgId,
          email: u.email,
          name: u.name,
          password_hash: hash,
          password_salt: salt,
          role: u.role,
          is_active: true,
        });
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
  }
}
