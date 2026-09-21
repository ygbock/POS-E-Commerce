import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { AuthService } from '../services/authService.ts';
import { requireAuth } from '../middleware/auth.ts';

export function createMerchantRouter(db: DatabaseClient, authService: AuthService) {
  const router = express.Router();

  const fail = (res: Response, err: any) => {
    const raw = String(err?.message || 'Merchant request failed.');
    const code = raw.split(':')[0];
    const status =
      code === 'EMAIL_ALREADY_REGISTERED' ? 409 :
      code === 'VALIDATION_ERROR' ? 422 :
      code === 'UNAUTHORIZED' ? 401 :
      code === 'TENANT_ACCESS_DENIED' ? 403 : 400;
    return res.status(status).json({
      success: false,
      error: { code, message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw },
    });
  };

  router.post('/signup', async (req, res) => {
    try {
      const result = await authService.registerBusinessOwner({
        name: String(req.body?.name || ''),
        email: String(req.body?.email || ''),
        password: String(req.body?.password || ''),
        businessName: String(req.body?.businessName || ''),
        businessMode: req.body?.businessMode === 'DISCOVERY_AND_STORE' ? 'DISCOVERY_AND_STORE' : 'DISCOVERY_ONLY',
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      fail(res, err);
    }
  });

  router.get('/me', requireAuth(), async (req, res, next) => {
    try {
      const userId = req.auth!.userId;
      const businesses = await db.query(
        \`SELECT b.id,b.public_id,b.name,b.slug,b.business_mode,b.listing_status,b.verification_status,
                b.is_discoverable,b.organization_id,m.role AS membership_role,m.is_active AS membership_active,
                b.created_at,b.updated_at
           FROM discovery_business_memberships m
           JOIN discovery_businesses b ON b.id=m.business_id
          WHERE m.user_id=$1 AND m.is_active=TRUE
          ORDER BY b.created_at DESC\`,
        [userId],
      );
      const onboarding = await db.query(
        \`SELECT u.id,u.email,u.name,u.role,u.organization_id,u.email_verified_at,
                COUNT(m.business_id)::int AS business_count
           FROM users u
           LEFT JOIN discovery_business_memberships m ON m.user_id=u.id AND m.is_active=TRUE
          WHERE u.id=$1
          GROUP BY u.id\`,
        [userId],
      );
      res.json({ success: true, data: { user: onboarding.rows[0] || null, businesses: businesses.rows } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/businesses/:id', requireAuth(), async (req, res, next) => {
    try {
      const result = await db.query(
        \`SELECT b.id,b.public_id,b.name,b.slug,b.legal_name,b.business_type,b.short_description,b.description,
                b.phone,b.email,b.whatsapp,b.website,b.logo_url,b.cover_image_url,b.business_mode,
                b.listing_status,b.verification_status,b.is_discoverable,b.organization_id,
                m.role AS membership_role
           FROM discovery_business_memberships m
           JOIN discovery_businesses b ON b.id=m.business_id
          WHERE m.user_id=$1 AND m.business_id=$2 AND m.is_active=TRUE
          LIMIT 1\`,
        [req.auth!.userId, req.params.id],
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Business not found.' } });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.post('/businesses', requireAuth(), async (req, res, next) => {
    try {
      const businessMode = req.body?.businessMode === 'DISCOVERY_AND_STORE' ? 'DISCOVERY_AND_STORE' : 'DISCOVERY_ONLY';
      const name = String(req.body?.businessName || '').trim();
      if (!name) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Business name is required.' } });

      const businessId = \`disc_\${randomUUID()}\`;
      const publicId = \`biz_\${randomUUID().replace(/-/g, '').slice(0, 16)}\`;
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'business';
      const slug = \`\${baseSlug}-\${randomUUID().replace(/-/g, '').slice(0, 6)}\`;
      const organizationId = businessMode === 'DISCOVERY_AND_STORE' ? req.auth!.organizationId : null;

      await db.query('BEGIN');
      try {
        await db.query(
          \`INSERT INTO discovery_businesses
           (id,public_id,organization_id,name,slug,short_description,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT','UNVERIFIED',FALSE,$8)\`,
          [businessId,publicId,organizationId,name,\`\${name} listing on AbaCha.\`,businessMode,req.auth!.userId],
        );
        await db.query('INSERT INTO discovery_business_settings (business_id) VALUES ($1)', [businessId]);
        await db.query(
          \`INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
           VALUES ($1,$2,'OWNER',TRUE)\`,
          [businessId,req.auth!.userId],
        );
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
      res.status(201).json({ success: true, data: { id: businessId, publicId, name, slug, businessMode, listingStatus: 'DRAFT' } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
