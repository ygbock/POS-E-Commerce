import { Router, Request, Response } from 'express';
import { DatabaseClient } from '../db/client';
import { requireAuth, requirePermission, requireTenantAccess } from '../middleware/auth';
import { PERMISSIONS } from '../auth/roles';
import { ReportingService } from '../services/reportingService';

export function createReportRouter(db: DatabaseClient) {
  const router = Router();
  const service = new ReportingService(db);

  const tenantId = (req: Request): string => {
    if (!req.auth?.organizationId) throw new Error('TENANT_REQUIRED');
    return req.auth.organizationId;
  };

  const parseCommon = (req: Request) => ({
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    locationId: typeof req.query.locationId === 'string' ? req.query.locationId : undefined,
    channel: typeof req.query.channel === 'string' ? req.query.channel as any : undefined,
  });

  const handle = (fn: (req: Request) => Promise<any>) => async (req: Request, res: Response) => {
    try {
      const data = await fn(req);
      return res.json({ success: true, data });
    } catch (err: any) {
      if (err?.message === 'TENANT_REQUIRED') {
        return res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Authenticated tenant context is required.' } });
      }
      if (err?.message === 'INVALID_REPORT_DATE_RANGE') {
        return res.status(422).json({ success: false, error: { code: 'INVALID_REPORT_DATE_RANGE', message: 'Invalid report date range.' } });
      }
      return res.status(500).json({ success: false, error: { code: 'REPORT_ERROR', message: 'Unable to generate report.' } });
    };
  };

  router.get('/sales-summary', requireAuth(), requirePermission(PERMISSIONS.REPORTS_VIEW), requireTenantAccess(), handle(async (req) => {
    return service.getSalesSummary(tenantId(req), parseCommon(req));
  }));

  router.get('/inventory-valuation', requireAuth(), requirePermission(PERMISSIONS.REPORTS_VIEW), requireTenantAccess(), handle(async (req) => {
    return service.getInventoryValuation(tenantId(req), typeof req.query.locationId === 'string' ? req.query.locationId : undefined);
  }));

  router.get('/shift-reconciliation', requireAuth(), requirePermission(PERMISSIONS.REPORTS_VIEW), requireTenantAccess(), handle(async (req) => {
    return service.getShiftReconciliation(tenantId(req), parseCommon(req));
  }));

  return router;
}
