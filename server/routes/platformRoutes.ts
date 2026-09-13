import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';

export function createPlatformRouter(db: DatabaseClient): Router {
  const router = Router();

  router.get('/overview', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_VIEW), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tenants = await db.query<any>(
        'SELECT id, name, is_active, created_at FROM organizations ORDER BY created_at DESC'
      );
      const activeUsers = await db.query<any>(
        'SELECT COUNT(*)::int AS count FROM users WHERE is_active = true'
      );
      res.json({
        success: true,
        data: {
          tenants: tenants.rows.map((t) => ({
            id: t.id,
            name: t.name,
            status: t.is_active ? 'active' : 'suspended',
            createdAt: t.created_at,
          })),
          activeUsers: activeUsers.rows[0]?.count ?? 0,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tenants', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_TENANTS), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await db.query<any>(
        'SELECT id, name, is_active, created_at FROM organizations ORDER BY created_at DESC'
      );
      res.json({ success: true, count: result.rows.length, data: result.rows.map((t) => ({
        id: t.id, name: t.name, status: t.is_active ? 'active' : 'suspended', createdAt: t.created_at,
      })) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
