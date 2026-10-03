import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { BillingService, verifyBillingSignature } from '../services/billingService.ts';

export function createBillingRouter(db: DatabaseClient): Router {
  const router = Router();
  const billing = new BillingService(db);

  router.get('/invoices', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = typeof req.query.organizationId === 'string' ? req.query.organizationId.trim() : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : undefined;
      const rawLimit = Number(req.query.limit);
      const rawOffset = Number(req.query.offset);
      const result = await billing.listInvoices({
        organizationId,
        status,
        limit: Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 50,
        offset: Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0,
      });
      res.json({ success: true, data: result.invoices, pagination: { total: result.total, limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/invoices/:invoiceId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await billing.getInvoice(req.params.invoiceId);
      if (!invoice) return res.status(404).json({ success: false, error: { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found.' } });
      res.json({ success: true, data: invoice });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invoices/:organizationId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_BILLING), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.params.organizationId.trim();
      if (!organizationId) return res.status(422).json({ success: false, error: { code: 'TENANT_ID_REQUIRED', message: 'Organization ID is required.' } });
      const invoice = await billing.createInvoice(organizationId, {
        provider: typeof req.body?.provider === 'string' ? req.body.provider.trim() : undefined,
        dueDays: req.body?.dueDays,
        reason: typeof req.body?.reason === 'string' ? req.body.reason.trim() : undefined,
      });
      res.status(201).json({ success: true, data: invoice });
    } catch (err: any) {
      const message = err?.message || 'Unable to create invoice.';
      const code = String(message).split(':')[0] || 'BILLING_ERROR';
      const status = code === 'SUBSCRIPTION_NOT_FOUND' ? 404 : code === 'TENANT_REQUIRED' ? 422 : 400;
      res.status(status).json({ success: false, error: { code, message } });
    }
  });

  return router;
}

export function createBillingWebhookRouter(db: DatabaseClient): Router {
  const router = Router();
  const billing = new BillingService(db);

  router.post('/billing', async (req: Request, res: Response) => {
    const secret = process.env.ABACHA_BILLING_WEBHOOK_SECRET?.trim();
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const payload = rawBody ? rawBody.toString('utf8') : JSON.stringify(req.body || {});
    const signature = String(req.header('x-abacha-signature') || req.header('x-webhook-signature') || '');

    if (!secret) {
      return res.status(503).json({ success: false, error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Billing webhook verification is not configured.' } });
    }
    if (!rawBody || !verifyBillingSignature(payload, signature, secret)) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_WEBHOOK_SIGNATURE', message: 'Invalid billing webhook signature.' } });
    }

    try {
      const event = req.body;
      const result = await billing.processWebhook(event, payload, String(req.header('x-billing-provider') || 'monime').trim().toLowerCase());
      return res.status(result.duplicate ? 200 : 202).json({
        success: true,
        data: { accepted: true, duplicate: result.duplicate, invoice: result.invoice },
      });
    } catch (err: any) {
      console.error('[BillingWebhook] processing failed:', err?.message || 'unknown error');
      return res.status(400).json({ success: false, error: { code: 'WEBHOOK_PROCESSING_FAILED', message: 'Billing webhook could not be processed.' } });
    }
  });

  return router;
}
