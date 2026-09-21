import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { AuthService } from '../services/authService.ts';
import { requireAuth } from '../middleware/auth.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';

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

  const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
  const audit = new AuditRepository(db);
  const recordBusinessAudit = async (req: Request, action: string, businessId: string, metadata: Record<string, any> = {}, severity: 'Info'|'Low'|'Medium'|'High'|'Critical' = 'Medium', result: 'SUCCESS'|'FAILED'|'DENIED' = 'SUCCESS', beforeState?: any, afterState?: any) => {
    if (!req.auth) return;
    try {
      await audit.recordEvent({ organization_id: req.auth.organizationId, actor_id: req.auth.userId, actor_name: req.auth.email || req.auth.userId, actor_role: req.auth.role, action, entity_type: 'DISCOVERY_BUSINESS', entity_id: businessId, before_state: beforeState, after_state: afterState, metadata, severity, result });
    } catch (error) { console.warn('[Audit] Discovery business event failed:', error); }
  };

  const requireTeamManager = async (req: Request, businessId: string, minimum: 'MANAGER' | 'OWNER' = 'MANAGER') => {
    const membership = await db.query(
      `SELECT role,is_active FROM discovery_business_memberships
        WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE LIMIT 1`,
      [businessId, req.auth!.userId],
    );
    const role = membership.rows[0]?.role as string | undefined;
    if (!role) throw new Error('NOT_FOUND:Business not found.');
    if (minimum === 'OWNER' && role !== 'OWNER') {
      throw new Error('PERMISSION_DENIED:Only the business owner can perform this team operation.');
    }
    if (minimum === 'MANAGER' && !['OWNER', 'MANAGER'].includes(role)) {
      throw new Error('PERMISSION_DENIED:Team management access is restricted to owners and managers.');
    }
    return role;
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
        `SELECT b.id,b.public_id,b.name,b.slug,b.business_mode,b.listing_status,b.verification_status,
                b.is_discoverable,b.organization_id,m.role AS membership_role,m.is_active AS membership_active,
                b.created_at,b.updated_at
           FROM discovery_business_memberships m
           JOIN discovery_businesses b ON b.id=m.business_id
          WHERE m.user_id=$1 AND m.is_active=TRUE
          ORDER BY b.created_at DESC`,
        [userId],
      );
      const onboarding = await db.query(
        `SELECT u.id,u.email,u.name,u.role,u.organization_id,u.email_verified_at,
                COUNT(m.business_id)::int AS business_count
           FROM users u
           LEFT JOIN discovery_business_memberships m ON m.user_id=u.id AND m.is_active=TRUE
          WHERE u.id=$1
          GROUP BY u.id`,
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
        `SELECT b.id,b.public_id,b.name,b.slug,b.legal_name,b.business_type,b.short_description,b.description,
                b.phone,b.email,b.whatsapp,b.website,b.logo_url,b.cover_image_url,b.business_mode,
                b.listing_status,b.verification_status,b.is_discoverable,b.organization_id,
                m.role AS membership_role
           FROM discovery_business_memberships m
           JOIN discovery_businesses b ON b.id=m.business_id
          WHERE m.user_id=$1 AND m.business_id=$2 AND m.is_active=TRUE
          LIMIT 1`,
        [req.auth!.userId, req.params.id],
      );
      if (!result.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Business not found.' } });
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      next(err);
    }
  });

  router.get('/businesses/:id/team', requireAuth(), async (req, res, next) => {
    try {
      await requireTeamManager(req, req.params.id);
      const members = await db.query(
        `SELECT m.business_id,m.user_id,m.role,m.is_active,m.created_at,m.updated_at,
                u.name,u.email,u.email_verified_at
           FROM discovery_business_memberships m
           JOIN users u ON u.id=m.user_id
          WHERE m.business_id=$1
          ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END, u.name ASC`,
        [req.params.id],
      );
      const invitations = await db.query(
        `SELECT i.id,i.business_id,i.invited_email,i.role,i.status,i.expires_at,i.created_at,
                u.name AS invited_by_name
           FROM discovery_business_invitations i
           JOIN users u ON u.id=i.invited_by_user_id
          WHERE i.business_id=$1 AND i.status='PENDING'
          ORDER BY i.created_at DESC`,
        [req.params.id],
      );
      const currentMember = members.rows.find((member: any) => member.user_id === req.auth!.userId);
      res.json({ success: true, data: { members: members.rows, invitations: invitations.rows, currentUserRole: currentMember?.role || null } });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses/:id/team/invitations', requireAuth(), async (req, res, next) => {
    try {
      const actorRole = await requireTeamManager(req, req.params.id);
      const email = normalizeEmail(req.body?.email);
      const role = req.body?.role === 'MANAGER' ? 'MANAGER' : 'STAFF';
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        throw new Error('VALIDATION_ERROR:Enter a valid team member email address.');
      }
      if (actorRole === 'MANAGER' && role === 'MANAGER') {
        throw new Error('PERMISSION_DENIED:Managers may invite staff members only.');
      }

      const existing = await db.query(
        `SELECT id FROM users WHERE lower(email)=lower($1) AND is_active=TRUE LIMIT 1`,
        [email],
      );
      if (existing.rows[0]) {
        const membership = await db.query(
          `SELECT role,is_active FROM discovery_business_memberships
            WHERE business_id=$1 AND user_id=$2 LIMIT 1`,
          [req.params.id, existing.rows[0].id],
        );
        if (membership.rows[0]?.is_active) {
          throw new Error('VALIDATION_ERROR:This user is already a member of the business.');
        }
      }

      const pending = await db.query(
        `SELECT id FROM discovery_business_invitations
          WHERE business_id=$1 AND lower(invited_email)=lower($2) AND status='PENDING'
          LIMIT 1`,
        [req.params.id, email],
      );
      if (pending.rows[0]) {
        throw new Error('VALIDATION_ERROR:An active invitation already exists for this email.');
      }

      const invitationId = `d_inv_${randomUUID()}`;
      await db.query(
        `INSERT INTO discovery_business_invitations
          (id,business_id,invited_email,role,invited_by_user_id,status,expires_at)
         VALUES ($1,$2,$3,$4,$5,'PENDING',CURRENT_TIMESTAMP + INTERVAL '7 days')`,
        [invitationId, req.params.id, email, role, req.auth!.userId],
      );

      await recordBusinessAudit(req, 'BUSINESS_TEAM_INVITATION_CREATED', req.params.id, { invitationId, invitedEmail: email, role }, 'Medium', 'SUCCESS');

      res.status(201).json({
        success: true,
        data: {
          id: invitationId,
          businessId: req.params.id,
          invitedEmail: email,
          role,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses/:id/team/invitations/:invitationId/revoke', requireAuth(), async (req, res) => {
    try {
      await requireTeamManager(req, req.params.id);
      const result = await db.query(
        `UPDATE discovery_business_invitations
            SET status='REVOKED',updated_at=CURRENT_TIMESTAMP
          WHERE id=$1 AND business_id=$2 AND status='PENDING'
          RETURNING id,status`,
        [req.params.invitationId, req.params.id],
      );
      if (!result.rows[0]) throw new Error('NOT_FOUND:Pending invitation not found.');
      await recordBusinessAudit(req, 'BUSINESS_TEAM_INVITATION_REVOKED', req.params.id, { invitationId: req.params.invitationId }, 'Medium');
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses/:id/team/members/:userId/role', requireAuth(), async (req, res) => {
    try {
      await requireTeamManager(req, req.params.id, 'OWNER');
      const role = req.body?.role === 'MANAGER' ? 'MANAGER' : req.body?.role === 'STAFF' ? 'STAFF' : '';
      if (!role) throw new Error('VALIDATION_ERROR:Team role must be MANAGER or STAFF.');

      const result = await db.query(
        `UPDATE discovery_business_memberships
            SET role=$1,updated_at=CURRENT_TIMESTAMP
          WHERE business_id=$2 AND user_id=$3 AND is_active=TRUE AND role <> 'OWNER'
          RETURNING business_id,user_id,role,is_active,updated_at`,
        [role, req.params.id, req.params.userId],
      );
      if (!result.rows[0]) throw new Error('NOT_FOUND:Active non-owner team member not found.');
      await recordBusinessAudit(req, 'BUSINESS_TEAM_MEMBER_ROLE_CHANGED', req.params.id, { targetUserId: req.params.userId, newRole: role }, 'High');
      res.json({ success: true, data: result.rows[0] });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses/:id/team/members/:userId/deactivate', requireAuth(), async (req, res) => {
    try {
      const actorRole = await requireTeamManager(req, req.params.id);
      const target = await db.query(
        `SELECT role FROM discovery_business_memberships
          WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE LIMIT 1`,
        [req.params.id, req.params.userId],
      );
      const targetRole = target.rows[0]?.role as string | undefined;
      if (!targetRole) throw new Error('NOT_FOUND:Active team member not found.');
      if (targetRole === 'OWNER') throw new Error('VALIDATION_ERROR:The business owner cannot be deactivated.');
      if (actorRole === 'MANAGER' && targetRole !== 'STAFF') {
        throw new Error('PERMISSION_DENIED:Managers may deactivate staff members only.');
      }

      await recordBusinessAudit(req, 'BUSINESS_TEAM_MEMBER_DEACTIVATED', req.params.id, { targetUserId: req.params.userId, targetRole }, 'High');

      await db.query(
        `UPDATE discovery_business_memberships
            SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP
          WHERE business_id=$1 AND user_id=$2`,
        [req.params.id, req.params.userId],
      );
      res.json({ success: true, data: { businessId: req.params.id, userId: req.params.userId, isActive: false } });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses/:id/team/invitations/:invitationId/accept', requireAuth(), async (req, res) => {
    try {
      const invitation = await db.query(
        `SELECT id,business_id,invited_email,role,status,expires_at
           FROM discovery_business_invitations
          WHERE id=$1 AND business_id=$2 LIMIT 1`,
        [req.params.invitationId, req.params.id],
      );
      const row = invitation.rows[0];
      if (!row) throw new Error('NOT_FOUND:Invitation not found.');
      if (row.status !== 'PENDING') throw new Error('VALIDATION_ERROR:This invitation is no longer pending.');
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await db.query(
          `UPDATE discovery_business_invitations SET status='EXPIRED',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [row.id],
        );
        throw new Error('VALIDATION_ERROR:This invitation has expired.');
      }

      const user = await db.query(
        `SELECT id,email FROM users WHERE id=$1 AND is_active=TRUE LIMIT 1`,
        [req.auth!.userId],
      );
      if (!user.rows[0] || normalizeEmail(user.rows[0].email) !== normalizeEmail(row.invited_email)) {
        throw new Error('PERMISSION_DENIED:The signed-in account email does not match this invitation.');
      }

      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
           VALUES ($1,$2,$3,TRUE)
           ON CONFLICT (business_id,user_id)
           DO UPDATE SET role=EXCLUDED.role,is_active=TRUE,updated_at=CURRENT_TIMESTAMP`,
          [row.business_id, req.auth!.userId, row.role],
        );
        await db.query(
          `UPDATE discovery_business_invitations
              SET status='ACCEPTED',accepted_by_user_id=$1,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
            WHERE id=$2`,
          [req.auth!.userId, row.id],
        );
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }

      await recordBusinessAudit(req, 'BUSINESS_TEAM_INVITATION_ACCEPTED', row.business_id, { invitationId: row.id, role: row.role }, 'Medium');
      res.json({ success: true, data: { businessId: row.business_id, role: row.role, status: 'ACCEPTED' } });
    } catch (err) {
      fail(res, err);
    }
  });

  router.post('/businesses', requireAuth(), async (req, res, next) => {
    try {
      const businessMode = req.body?.businessMode === 'DISCOVERY_AND_STORE' ? 'DISCOVERY_AND_STORE' : 'DISCOVERY_ONLY';
      const name = String(req.body?.businessName || '').trim();
      if (!name) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Business name is required.' } });

      const businessId = `disc_${randomUUID()}`;
      const publicId = `biz_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'business';
      const slug = `${baseSlug}-${randomUUID().replace(/-/g, '').slice(0, 6)}`;
      const organizationId = businessMode === 'DISCOVERY_AND_STORE' ? req.auth!.organizationId : null;

      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO discovery_businesses
           (id,public_id,organization_id,name,slug,short_description,business_mode,listing_status,verification_status,is_discoverable,created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT','UNVERIFIED',FALSE,$8)`,
          [businessId,publicId,organizationId,name,`${name} listing on AbaCha.`,businessMode,req.auth!.userId],
        );
        await db.query('INSERT INTO discovery_business_settings (business_id) VALUES ($1)', [businessId]);
        await db.query(
          `INSERT INTO discovery_business_memberships (business_id,user_id,role,is_active)
           VALUES ($1,$2,'OWNER',TRUE)`,
          [businessId,req.auth!.userId],
        );
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }
      await recordBusinessAudit(req, 'DISCOVERY_BUSINESS_CREATED', businessId, { businessMode }, 'Info');
      res.status(201).json({ success: true, data: { id: businessId, publicId, name, slug, businessMode, listingStatus: 'DRAFT' } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
