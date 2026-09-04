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
   * Authenticate a user with email, password, and optional organization ID.
   * If organizationId is not provided, defaults to 'org_default'.
   */
  async login(credentials: {
    email: string;
    password: string;
    organizationId?: string;
  }): Promise<LoginResult> {
    const orgId = credentials.organizationId || 'org_default';
    const email = credentials.email.toLowerCase().trim();

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

  /**
   * Seed standard system users if they do not already exist.
   * Ensures development and tests have valid credentials immediately.
   */
  async seedDefaultUsers(): Promise<void> {
    const orgDefault = 'org_default';

    // Ensure organizations exist
    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active)
       VALUES ('org_default', 'Omnicore Global Retail Ltd', 'OMNICORE_DEFAULT', TRUE)
       ON CONFLICT (id) DO NOTHING`
    );

    await this.db.query(
      `INSERT INTO organizations (id, name, code, is_active)
       VALUES ('org_secondary', 'Secondary Tenant Ltd', 'TENANT_SEC', TRUE)
       ON CONFLICT (id) DO NOTHING`
    );

    const defaultUsers = [
      {
        id: 'usr_super_admin',
        orgId: orgDefault,
        email: 'superadmin@omnicore.internal',
        name: 'Super Administrator',
        role: 'super_admin' as UserRole,
        password: 'SuperAdmin123!',
      },
      {
        id: 'usr_admin',
        orgId: orgDefault,
        email: 'admin@omnicore.internal',
        name: 'Enterprise Admin',
        role: 'admin' as UserRole,
        password: 'AdminPass123!',
      },
      {
        id: 'usr_manager',
        orgId: orgDefault,
        email: 'manager@omnicore.internal',
        name: 'Store Operations Manager',
        role: 'manager' as UserRole,
        password: 'ManagerPass123!',
      },
      {
        id: 'usr_cashier',
        orgId: orgDefault,
        email: 'cashier@omnicore.internal',
        name: 'POS Terminal Cashier',
        role: 'cashier' as UserRole,
        password: 'CashierPass123!',
      },
      {
        id: 'usr_inventory_mgr',
        orgId: orgDefault,
        email: 'inventory@omnicore.internal',
        name: 'Inventory Controller',
        role: 'inventory_manager' as UserRole,
        password: 'InventoryPass123!',
      },
      {
        id: 'usr_purchasing_mgr',
        orgId: orgDefault,
        email: 'purchasing@omnicore.internal',
        name: 'Procurement Specialist',
        role: 'purchasing_manager' as UserRole,
        password: 'PurchasingPass123!',
      },
      {
        id: 'usr_sales',
        orgId: orgDefault,
        email: 'sales@omnicore.internal',
        name: 'Retail Sales Rep',
        role: 'sales_user' as UserRole,
        password: 'SalesPass123!',
      },
      {
        id: 'usr_viewer',
        orgId: orgDefault,
        email: 'viewer@omnicore.internal',
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
  }
}
