import { Request, Response, NextFunction } from 'express';
import { UserRole, hasPermission } from '../auth/roles';
import { AuthService } from '../services/authService';
import { TokenClaims } from '../auth/token';

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
  permissions: string[];
  locationId?: string | null;
  email?: string;
  jti?: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      authError?: string;
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
  return null;
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
      req.auth = {
        userId: claims.sub,
        organizationId: claims.orgId,
        role: claims.role,
        permissions: claims.permissions,
        locationId: claims.locId,
        email: claims.email,
        jti: claims.jti,
      };
      next();
    } catch (err: any) {
      req.authError = err.message || 'Token verification failed';
      // Do not halt here; requireAuth() will enforce rejection if endpoint requires it
      next();
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
      // Detailed token verification errors remain strictly server-side
      if (req.authError && process.env.NODE_ENV !== 'production') {
        console.debug('[Auth Middleware Debug]', req.authError);
      }
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
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

    // Super Admin can access all tenants
    if (req.auth.role === 'super_admin') {
      return next();
    }

    const targetOrgId = getOrgIdFromRequest
      ? getOrgIdFromRequest(req)
      : (req.params.orgId || req.params.organizationId || (req.query && (req.query.orgId || req.query.organizationId)) as string);

    // If request explicitly targets a different organization, forbid it
    if (targetOrgId && targetOrgId !== req.auth.organizationId) {
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
