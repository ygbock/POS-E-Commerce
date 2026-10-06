import { Request, Response, NextFunction } from 'express';
import { UserRole, hasPermission, isPlatformRole, AuthIdentityType, getIdentityTypeForRole } from '../auth/roles';
import { AuthService } from '../services/authService';
import { TokenClaims } from '../auth/token';
import { ACCESS_COOKIE } from '../auth/session';

/**
 * Authenticated Request Context (SEC-001)
 * 
 * Cryptographically verified identity and tenant boundary.
 * The client cannot inject or alter these values.
 */
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
  identityType?: AuthIdentityType;
  permissions: string[];
  locationId?: string | null;
  email?: string;
  jti?: string;
  organizationActive?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Extract token from Authorization header or cookie.
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(part => part.trim());
  const match = cookies.find(part => part.startsWith(`${ACCESS_COOKIE}=`));
  return match ? decodeURIComponent(match.substring(ACCESS_COOKIE.length + 1)) : null;
}

/**
 * Central Authentication Middleware
 * Validates cryptographic signature, expiration, and revocation status.
 * Attaches verified AuthContext to req.auth.
 */
export function createAuthenticateMiddleware(authService?: AuthService) {
  const service = authService || new AuthService();

  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractToken(req);
    if (!token) {
      return next();
    }

    try {
      const claims: TokenClaims = await service.verifySession(token);
      let organizationActive = true;
      if (!isPlatformRole(claims.role)) {
        organizationActive = await service.isOrganizationActive(claims.orgId);
      }

      req.auth = {
        userId: claims.sub,
        organizationId: claims.orgId,
        role: claims.role,
        identityType: getIdentityTypeForRole(claims.role),
        permissions: claims.permissions,
        locationId: claims.locId,
        email: claims.email,
        jti: claims.jti,
        organizationActive,
      };
      next();
    } catch {
      // Failed authentication: leave req.auth undefined.
      // Internal error details are NOT stored on request or leaked to clients.
      next();
    }
  };
}

/**
 * Middleware: Enforce server-authoritative email verification for selected identity realms.
 *
 * Login remains available so users can reach verification/recovery flows. This gate is
 * applied only to protected operational routes and derives verification state from the
 * current users row rather than from browser-controlled state or a stale JWT claim.
 */
export function requireVerifiedEmail(...identityTypes: AuthIdentityType[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
      });
    }

    if (identityTypes.length > 0 && !identityTypes.includes(req.auth.identityType || getIdentityTypeForRole(req.auth.role))) {
      return next();
    }

    if (isPlatformRole(req.auth.role) || req.auth.identityType === 'platform') {
      return next();
    }

    try {
      const db = (req.app as any).get?.('db') as { query?: Function } | undefined;
      if (!db?.query) {
        return res.status(503).json({
          success: false,
          error: { code: 'EMAIL_VERIFICATION_UNAVAILABLE', message: 'Email verification status is temporarily unavailable.' },
        });
      }

      const result = await db.query(
        `SELECT email_verified_at
           FROM users
          WHERE id=$1 AND organization_id=$2 AND is_active=TRUE
          LIMIT 1`,
        [req.auth.userId, req.auth.organizationId],
      );
      if (!result.rows[0]) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authenticated account is no longer available.' },
        });
      }

      if (!result.rows[0].email_verified_at) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'EMAIL_VERIFICATION_REQUIRED',
            message: 'Please verify your email address before using this feature.',
          },
        });
      }

      next();
    } catch {
      return res.status(503).json({
        success: false,
        error: { code: 'EMAIL_VERIFICATION_UNAVAILABLE', message: 'Email verification status is temporarily unavailable.' },
      });
    }
  };
}

/**
 * Middleware: Enforce Authenticated Session
 * Rejects unauthenticated requests with HTTP 401 Unauthorized.
 */
export function requireAuth() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }
    if (req.auth.organizationActive === false && !isPlatformRole(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'This organization is currently inactive.',
        },
      });
    }
    next();
  };
}

/**
 * Middleware: Enforce Specific Permission
 * Requires caller to hold at least one of the specified permissions.
 * Rejects unauthorized callers with HTTP 403 Forbidden.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    if (req.auth.organizationActive === false && !isPlatformRole(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'This organization is currently inactive.',
        },
      });
    }

    const hasAny = requiredPermissions.some(perm =>
      hasPermission(req.auth!.permissions, perm)
    );

    if (!hasAny) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires permission: ${requiredPermissions.join(' or ')}.`,
          requiredPermissions,
        },
      });
    }

    next();
  };
}

/**
 * Middleware: Enforce Specific Role(s)
 * Rejects callers lacking the required role with HTTP 403 Forbidden.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    // super_admin always bypasses role check
    if (req.auth.role === 'super_admin') {
      return next();
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Caller role '${req.auth.role}' is not authorized for this operation.`,
          allowedRoles,
        },
      });
    }

    next();
  };
}

/**
 * Middleware: Enforce Multi-Tenant Isolation
 * Ensures the target resource's organizationId matches the caller's organizationId.
 * Super Admins are granted cross-tenant supervisory access.
 */
export function requireTenantAccess(getOrgIdFromRequest?: (req: Request) => string | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    if (req.auth.organizationActive === false && !isPlatformRole(req.auth.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'This organization is currently inactive.',
        },
      });
    }

    // Super Admin can access all tenants
    if (req.auth.role === 'super_admin') {
      return next();
    }

    const targetOrgId = getOrgIdFromRequest
      ? getOrgIdFromRequest(req)
      : (req.params.orgId ||
         req.params.organizationId ||
         (req.query && (req.query.orgId || req.query.organizationId))) as string;

    // If request explicitly targets a different organization, forbid it
    if (targetOrgId && targetOrgId !== req.auth.organizationId) {
      const auditRepo: any = req.app?.get?.('auditRepo');
      if (auditRepo && typeof auditRepo.recordEvent === 'function') {
        try {
          await auditRepo.recordEvent({
            organization_id: req.auth.organizationId,
            actor_id: req.auth.userId,
            actor_name: req.auth.email || req.auth.userId,
            actor_role: req.auth.role,
            action: 'SECURITY_CROSS_TENANT_DENIED',
            entity_type: 'SECURITY',
            entity_id: String(targetOrgId),
            metadata: {
              callerTenant: req.auth.organizationId,
              attemptedTenant: targetOrgId,
              path: req.originalUrl || req.url,
              method: req.method,
            },
            severity: 'Critical',
            result: 'DENIED',
          });
        } catch (e: any) {
          console.warn('[Audit] Cross-tenant denial log failed:', e);
        }
      }

      return res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_ACCESS_DENIED',
          message: 'Cross-tenant access forbidden. You cannot access or modify resources belonging to another organization.',
          authorizedTenant: req.auth.organizationId,
        },
      });
    }

    next();
  };
}

/** Require a platform control-plane permission. Never infer platform access from client state. */
export function requirePlatformPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ success:false, error:{ code:'UNAUTHORIZED', message:'Authentication required.' } });
    const platformRoles = ['system_owner','platform_admin','platform_support','platform_finance'];
    if (req.auth.identityType !== 'platform' || !platformRoles.includes(req.auth.role)) return res.status(403).json({ success:false, error:{ code:'PLATFORM_ACCESS_DENIED', message:'Platform access required.' } });
    const allowed = permissions.some(permission => hasPermission(req.auth!.permissions, permission));
    if (!allowed) return res.status(403).json({ success:false, error:{ code:'PLATFORM_PERMISSION_DENIED', message:'Insufficient platform permission.' } });
    next();
  };
}
