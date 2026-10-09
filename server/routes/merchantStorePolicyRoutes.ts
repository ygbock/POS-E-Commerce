import express, { Request, Response } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth } from '../middleware/auth.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';

const MONEY_FIELDS = ['freeShippingThreshold', 'standardShippingFee', 'expressShippingFee'] as const;
const TEXT_FIELDS = ['shippingPolicy', 'returnPolicy', 'warrantyPolicy', 'deliveryPromise', 'pickupInstructions'] as const;

function fail(res: Response, err: any) {
  const raw = String(err?.message || 'Store policy request failed.');
  const code = raw.split(':')[0];
  const status =
    code === 'NOT_FOUND' ? 404 :
    code === 'VALIDATION_ERROR' ? 422 :
    code === 'PERMISSION_DENIED' || code === 'TENANT_ACCESS_DENIED' ? 403 : 400;
  return res.status(status).json({
    success: false,
    error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw },
  });
}

function parseMoney(value: unknown, field: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`VALIDATION_ERROR:${field} must be a non-negative monetary amount.`);
  }
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(`VALIDATION_ERROR:${field} must be a non-negative amount with at most 2 decimal places.`);
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`VALIDATION_ERROR:${field} must be a non-negative monetary amount.`);
  }
  return numeric.toFixed(2);
}

function parseText(value: unknown, field: string, maxLength = 2000): string {
  if (value == null) return '';
  if (typeof value !== 'string') {
    throw new Error(`VALIDATION_ERROR:${field} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`VALIDATION_ERROR:${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

export function createMerchantStorePolicyRouter(db: DatabaseClient) {
  const router = express.Router();
  const audit = new AuditRepository(db);

  async function authorizeBusiness(req: Request, businessId: string) {
    if (!req.auth?.userId || !req.auth.organizationId) {
      throw new Error('TENANT_ACCESS_DENIED:Tenant context is required.');
    }

    const result = await db.query(
      `SELECT b.id,b.organization_id,m.role
         FROM discovery_businesses b
         JOIN discovery_business_memberships m ON m.business_id=b.id
        WHERE b.id=$1 AND b.organization_id=$2 AND m.user_id=$3 AND m.is_active=TRUE
        LIMIT 1`,
      [businessId, req.auth.organizationId, req.auth.userId],
    );

    const row = result.rows[0];
    if (!row) throw new Error('NOT_FOUND:Business not found.');
    if (row.role !== 'OWNER' && row.role !== 'MANAGER') {
      throw new Error('PERMISSION_DENIED:Only business owners and managers can manage store policies.');
    }
    return row;
  }

  router.get('/businesses/:id/store-policies', requireAuth(), async (req, res) => {
    try {
      const business = await authorizeBusiness(req, req.params.id);
      const result = await db.query('SELECT policies FROM organizations WHERE id=$1', [business.organization_id]);
      if (!result.rows[0]) throw new Error('NOT_FOUND:Organization not found.');

      const raw = typeof result.rows[0].policies === 'string'
        ? JSON.parse(result.rows[0].policies)
        : (result.rows[0].policies || {});

      res.json({
        success: true,
        data: {
          organizationId: business.organization_id,
          freeShippingThreshold: raw.freeShippingThreshold ?? null,
          standardShippingFee: raw.standardShippingFee ?? null,
          expressShippingFee: raw.expressShippingFee ?? null,
          shippingPolicy: typeof raw.shippingPolicy === 'string' ? raw.shippingPolicy : '',
          returnPolicy: typeof raw.returnPolicy === 'string' ? raw.returnPolicy : '',
          warrantyPolicy: typeof raw.warrantyPolicy === 'string' ? raw.warrantyPolicy : '',
          deliveryPromise: typeof raw.deliveryPromise === 'string' ? raw.deliveryPromise : '',
          pickupEnabled: raw.pickupEnabled === true,
          pickupInstructions: typeof raw.pickupInstructions === 'string' ? raw.pickupInstructions : '',
        },
      });
    } catch (err) {
      fail(res, err);
    }
  });

  router.patch('/businesses/:id/store-policies', requireAuth(), async (req, res) => {
    try {
      const business = await authorizeBusiness(req, req.params.id);
      const result = await db.withTransaction(async (tx) => {
        const current = await tx.query('SELECT policies FROM organizations WHERE id=$1 FOR UPDATE', [business.organization_id]);
        if (!current.rows[0]) throw new Error('NOT_FOUND:Organization not found.');

        const existing = typeof current.rows[0].policies === 'string'
          ? JSON.parse(current.rows[0].policies)
          : (current.rows[0].policies || {});
        const next = { ...existing };

        for (const field of MONEY_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
            next[field] = parseMoney(req.body[field], field);
          }
        }
        for (const field of TEXT_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
            next[field] = parseText(req.body[field], field);
          }
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pickupEnabled')) {
          if (typeof req.body.pickupEnabled !== 'boolean') {
            throw new Error('VALIDATION_ERROR:pickupEnabled must be a boolean.');
          }
          next.pickupEnabled = req.body.pickupEnabled;
        }

        const missing = MONEY_FIELDS.filter((field) => {
          const value = next[field];
          return value === undefined || value === null || String(value).trim() === '';
        });
        if (missing.length) {
          throw new Error(`VALIDATION_ERROR:Configure all required shipping amounts before saving: ${missing.join(', ')}.`);
        }

        const updated = await tx.query(
          'UPDATE organizations SET policies=$1::jsonb, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING policies',
          [JSON.stringify(next), business.organization_id],
        );

        return { next, policies: updated.rows[0]?.policies || next };
      });

      await audit.recordEvent({
        organization_id: business.organization_id,
        actor_id: req.auth!.userId,
        actor_name: req.auth!.email || req.auth!.userId,
        actor_role: req.auth!.role,
        action: 'STORE_POLICIES_UPDATED',
        entity_type: 'ORGANIZATION',
        entity_id: business.organization_id,
        metadata: { businessId: business.id, changedFields: Object.keys(req.body || {}).filter((key) => [...MONEY_FIELDS, ...TEXT_FIELDS, 'pickupEnabled'].includes(key as any)) },
        severity: 'High',
        result: 'SUCCESS',
      });

      const policies = result.policies as any;
      res.json({
        success: true,
        data: {
          organizationId: business.organization_id,
          ...Object.fromEntries(MONEY_FIELDS.map((field) => [field, policies[field]])),
          ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, policies[field] || ''])),
          pickupEnabled: policies.pickupEnabled === true,
        },
      });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}
