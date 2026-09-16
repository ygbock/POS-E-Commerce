import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { FeatureFlag } from '../repositories/subscriptionRepository';
import { ApiError } from '../utils/errorSanitizer';

let defaultSubscriptionService: SubscriptionService | null = null;

function getSubscriptionService(): SubscriptionService {
  if (!defaultSubscriptionService) {
    defaultSubscriptionService = new SubscriptionService();
  }
  return defaultSubscriptionService;
}

/**
 * Middleware: Enforce Specific Plan Feature Flag
 * Validates that the caller's organization holds an active subscription including the requested feature.
 * Super admins bypass feature restriction unless tenant-scoped.
 */
export function requireFeature(feature: FeatureFlag, service?: SubscriptionService) {
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

    // Platform Super Admin bypasses feature restriction
    if (req.auth.role === 'super_admin') {
      return next();
    }

    const orgId = req.auth.organizationId;
    const subService = service || getSubscriptionService();

    try {
      await subService.assertFeature(orgId, feature, {
        userId: req.auth.userId,
        role: req.auth.role,
      });
      next();
    } catch (err: any) {
      if (err instanceof ApiError) {
        return res.status(err.status).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            feature,
          },
        });
      }
      return res.status(403).json({
        success: false,
        error: {
          code: 'FEATURE_NOT_INCLUDED',
          message: `Feature '${feature}' is not included in your current subscription plan.`,
          feature,
        },
      });
    }
  };
}

/**
 * Middleware: Enforce Quota Limits
 * Validates that requested creation is within plan limits.
 */
export function requireWithinLimit(
  limitType: 'users' | 'locations' | 'products' | 'orders',
  service?: SubscriptionService
) {
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

    // Platform Super Admin bypasses quota limit checks
    if (req.auth.role === 'super_admin') {
      return next();
    }

    const orgId = req.auth.organizationId;
    const subService = service || getSubscriptionService();

    try {
      await subService.assertWithinLimit(orgId, limitType, 1, {
        userId: req.auth.userId,
        role: req.auth.role,
      });
      next();
    } catch (err: any) {
      if (err instanceof ApiError) {
        return res.status(err.status).json({
          success: false,
          error: {
            code: err.code,
            message: err.message,
            limitType,
          },
        });
      }
      return res.status(403).json({
        success: false,
        error: {
          code: 'LIMIT_EXCEEDED',
          message: `You have reached your subscription plan limit for ${limitType}.`,
          limitType,
        },
      });
    }
  };
}
