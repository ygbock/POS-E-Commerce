import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePlatformPermission } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';

const eventId = (prefix: string) => prefix + '_' + randomUUID().replace(/-/g, '');

export function createPlatformDiscoveryModerationRouter(db: DatabaseClient): Router {
  const router = Router();
  const guard = [requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_DISCOVERY)];
  const discoveryService = new DiscoveryBusinessService(undefined, db);

  router.get('/listings', ...guard, async (req, res, next) => {
    try {
      const status = String(req.query.status || 'SUBMITTED').trim().toUpperCase();
      const allowed = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED'];
      if (!allowed.includes(status)) return res.status(422).json({ success:false, error:{code:'INVALID_STATUS',message:'Invalid listing moderation status.'} });

      const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
      const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
      const search = String(req.query.search || '').trim().slice(0, 120);
      const mode = String(req.query.mode || '').trim().toUpperCase();
      const verification = String(req.query.verification || '').trim().toUpperCase();
      const hasIssues = String(req.query.hasIssues || '').trim().toLowerCase();
      const offset = (page - 1) * pageSize;

      const where = ['b.listing_status=$1'];
      const params: unknown[] = [status];
      let n = 2;
      if (search) {
        where.push(`(b.name ILIKE $${n} OR b.slug ILIKE $${n} OR b.business_type ILIKE $${n})`);
        params.push(`%${search.replace(/[%_]/g, '\\$&')}%`);
        n++;
      }
      if (mode && ['DISCOVERY_ONLY','DISCOVERY_AND_STORE'].includes(mode)) {
        where.push(`b.business_mode=$${n}`);
        params.push(mode);
        n++;
      }
      if (verification && ['PENDING','VERIFIED','REJECTED','UNVERIFIED'].includes(verification)) {
        where.push(`b.verification_status=$${n}`);
        params.push(verification);
        n++;
      }
      if (hasIssues === 'true') where.push(`EXISTS (SELECT 1 FROM discovery_listing_moderation_issues i WHERE i.business_id=b.id AND i.status='OPEN')`);
      if (hasIssues === 'false') where.push(`NOT EXISTS (SELECT 1 FROM discovery_listing_moderation_issues i WHERE i.business_id=b.id AND i.status='OPEN')`);

      const count = await db.query(
        `SELECT COUNT(*)::int AS total FROM discovery_businesses b WHERE ${where.join(' AND ')}`,
        params,
      );
      const total = Number(count.rows[0]?.total || 0);

      const dataParams = [...params, pageSize, offset];
      const r = await db.query(
        `SELECT b.id,b.name,b.slug,b.business_type,b.business_mode,b.organization_id,b.listing_status,
                b.verification_status,b.is_discoverable,b.created_at,b.updated_at,
                COALESCE((SELECT COUNT(*) FROM discovery_listing_moderation_issues i WHERE i.business_id=b.id AND i.status='OPEN'),0)::int AS open_issue_count,
                (SELECT e.created_at FROM discovery_listing_events e WHERE e.business_id=b.id AND e.to_status=$1 ORDER BY e.created_at DESC LIMIT 1) AS status_changed_at
           FROM discovery_businesses b
          WHERE ${where.join(' AND ')}
          ORDER BY status_changed_at ASC NULLS LAST, b.created_at ASC
          LIMIT $${n} OFFSET $${n + 1}`,
        dataParams,
      );
      res.json({success:true,data:r.rows,meta:{page,pageSize,total,totalPages:Math.ceil(total/pageSize),hasNextPage:offset+pageSize<total,hasPreviousPage:page>1}});
    } catch (err) { next(err); }
  });

  router.get('/listings/:id', ...guard, async (req, res, next) => {
    try {
      const data = await discoveryService.getListingModerationDetail(req.params.id, { userId:req.auth!.userId, role:req.auth!.role, organizationId:req.auth!.organizationId });
      res.json({success:true,data});
    } catch (err) { next(err); }
  });

  router.post('/listings/:id/decision', ...guard, async (req, res, next) => {
    try {
      const status = String(req.body?.status || '').trim().toUpperCase();
      const reason = String(req.body?.reason || '').trim().slice(0, 4000) || undefined;
      const issues = Array.isArray(req.body?.issues) ? req.body.issues : [];
      if (!['UNDER_REVIEW','APPROVED','REJECTED','PUBLISHED'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'Decision status must be UNDER_REVIEW, APPROVED, REJECTED, or PUBLISHED.'}});
      if (status === 'REJECTED' && !reason && issues.length === 0) return res.status(422).json({success:false,error:{code:'REJECTION_REASON_REQUIRED',message:'Select at least one moderation issue or provide an overall rejection note.'}});
      const allowedIssues = new Set(['identity','description','contact','category','location','coordinates','offering','store']);
      const normalizedIssues = issues.map((item:any) => ({key:String(item?.key || '').trim().toLowerCase(),detail:String(item?.detail || '').trim().slice(0,1000) || null})).filter((item:any) => allowedIssues.has(item.key));
      if (status === 'REJECTED' && issues.length !== normalizedIssues.length) return res.status(422).json({success:false,error:{code:'INVALID_MODERATION_ISSUE',message:'One or more moderation issue keys are invalid.'}});
      const actor = { userId:req.auth!.userId, role:req.auth!.role, organizationId:req.auth!.organizationId };
      let updated;
      if (status === 'UNDER_REVIEW') updated = await discoveryService.review(req.params.id, actor, reason);
      else if (status === 'APPROVED') updated = await discoveryService.approve(req.params.id, actor, reason);
      else if (status === 'PUBLISHED') updated = await discoveryService.publish(req.params.id, actor, reason);
      else updated = await discoveryService.reject(req.params.id, actor, reason, undefined, normalizedIssues);
      res.json({success:true,data:updated});
    } catch (err) { next(err); }
  });

  router.get('/verification', ...guard, async (_req, res, next) => {
    try {
      const r = await db.query(`SELECT v.*, b.name AS business_name, b.organization_id, b.verification_status FROM discovery_verification_applications v JOIN discovery_businesses b ON b.id=v.business_id WHERE v.status='PENDING' ORDER BY v.created_at ASC LIMIT 200`);
      res.json({ success: true, data: r.rows });
    } catch (err) { next(err); }
  });

  router.post('/verification/:id/decision', ...guard, async (req, res, next) => {
    try {
      const status = String(req.body?.status || '');
      if (!['APPROVED', 'REJECTED'].includes(status)) return res.status(422).json({ success:false, error:{code:'INVALID_STATUS',message:'status must be APPROVED or REJECTED.'} });
      const reason = String(req.body?.reason || '').trim().slice(0,2000) || null;
      const result = await db.withTransaction(async (tx) => {
        const current = await tx.query(`SELECT v.*, b.organization_id, b.verification_status FROM discovery_verification_applications v JOIN discovery_businesses b ON b.id=v.business_id WHERE v.id=$1 AND v.status='PENDING' FOR UPDATE`, [req.params.id]);
        if (!current.rows[0]) throw new Error('NOT_FOUND:Verification application not found.');
        const row = current.rows[0];
        const updated = await tx.query(`UPDATE discovery_verification_applications SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`, [status,req.auth!.userId,reason,req.params.id]);
        await tx.query(`UPDATE discovery_businesses SET verification_status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`, [status==='APPROVED'?'VERIFIED':'REJECTED',row.business_id]);
        await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'VERIFICATION',$3,'VERIFICATION_DECIDED',$4,$5,$6,$7,$8)`, [eventId('trust'),row.business_id,req.params.id,row.verification_status,status==='APPROVED'?'VERIFIED':'REJECTED',req.auth!.userId,reason,{}]);
        return updated.rows[0];
      });
      res.json({ success:true, data:result });
    } catch (err) { next(err); }
  });

  router.get('/claims', ...guard, async (_req, res, next) => {
    try {
      const r = await db.query(`SELECT c.*, b.name AS business_name FROM discovery_business_claims c JOIN discovery_businesses b ON b.id=c.business_id WHERE c.status='PENDING' ORDER BY c.created_at ASC LIMIT 200`);
      res.json({success:true,data:r.rows});
    } catch (err) { next(err); }
  });

  router.post('/claims/:id/decision', ...guard, async (req, res, next) => {
    try {
      const status=String(req.body?.status||'');
      if (!['APPROVED','REJECTED'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'status must be APPROVED or REJECTED.'}});
      const reason=String(req.body?.reason||'').trim().slice(0,2000)||null;
      const result=await db.withTransaction(async(tx)=>{
        const current=await tx.query(`SELECT * FROM discovery_business_claims WHERE id=$1 AND status='PENDING' FOR UPDATE`,[req.params.id]);
        if(!current.rows[0]) throw new Error('NOT_FOUND:Claim not found.');
        const row=current.rows[0];
        const updated=await tx.query(`UPDATE discovery_business_claims SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,[status,req.auth!.userId,reason,req.params.id]);
        await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'CLAIM',$3,'CLAIM_DECIDED','PENDING',$4,$5,$6,$7)`,[eventId('trust'),row.business_id,req.params.id,status,req.auth!.userId,reason,{}]);
        return updated.rows[0];
      });
      res.json({success:true,data:result});
    }catch(err){next(err);}
  });

  router.get('/reviews', ...guard, async (req, res, next) => {
    try {
      const status=String(req.query.status||'PENDING');
      if(!['PENDING','PUBLISHED','REJECTED','HIDDEN'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'Invalid review status.'}});
      const r=await db.query(`SELECT r.*,b.name AS business_name,b.organization_id FROM discovery_reviews r JOIN discovery_businesses b ON b.id=r.business_id WHERE r.status=$1 ORDER BY r.created_at ASC LIMIT 200`,[status]);
      res.json({success:true,data:r.rows});
    }catch(err){next(err);}
  });

  router.post('/reviews/:id/decision', ...guard, async (req, res, next) => {
    try {
      const status=String(req.body?.status||'');
      if(!['PUBLISHED','REJECTED','HIDDEN'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'status must be PUBLISHED, REJECTED or HIDDEN.'}});
      const reason=String(req.body?.reason||'').trim().slice(0,2000)||null;
      const result=await db.withTransaction(async(tx)=>{
        const current=await tx.query(`SELECT r.* FROM discovery_reviews r WHERE r.id=$1 FOR UPDATE`,[req.params.id]);
        if(!current.rows[0]) throw new Error('NOT_FOUND:Review not found.');
        const row=current.rows[0];
        const updated=await tx.query(`UPDATE discovery_reviews SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,[status,req.params.id]);
        await tx.query(`INSERT INTO discovery_review_moderation_events(id,review_id,from_status,to_status,actor_user_id,reason) VALUES($1,$2,$3,$4,$5,$6)`,[eventId('rev_evt'),req.params.id,row.status,status,req.auth!.userId,reason]);
        await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'REVIEW',$3,'REVIEW_DECIDED',$4,$5,$6,$7,$8)`,[eventId('trust'),row.business_id,req.params.id,row.status,status,req.auth!.userId,reason,{}]);
        return updated.rows[0];
      });
      res.json({success:true,data:updated});
    } catch (err) { next(err); }
  });

  router.get('/reports', ...guard, async (req, res, next) => {
    try {
      const status=String(req.query.status||'');
      if(status&&!['PENDING','UNDER_REVIEW','RESOLVED','DISMISSED'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'Invalid report status.'}});
      const r=await db.query(`SELECT r.*,b.name AS business_name,s.name AS service_name FROM discovery_reports r LEFT JOIN discovery_businesses b ON b.id=r.business_id LEFT JOIN discovery_services s ON s.id=r.service_id LEFT JOIN discovery_businesses sb ON sb.id=s.business_id WHERE ($1='' OR r.status=$1) ORDER BY r.created_at ASC LIMIT 200`,[status]);
      res.json({success:true,data:r.rows});
    }catch(err){next(err);}
  });

  router.post('/reports/:id/decision', ...guard, async (req, res, next) => {
    try {
      const status=String(req.body?.status||'');
      if(!['RESOLVED','DISMISSED','UNDER_REVIEW'].includes(status)) return res.status(422).json({success:false,error:{code:'INVALID_STATUS',message:'Invalid report status.'}});
      const note=String(req.body?.note||'').trim().slice(0,2000)||null;
      const result=await db.withTransaction(async(tx)=>{
        const current=await tx.query(`SELECT * FROM discovery_reports WHERE id=$1 FOR UPDATE`,[req.params.id]);
        if(!current.rows[0]) throw new Error('NOT_FOUND:Report not found.');
        const row=current.rows[0];
        const updated=await tx.query(`UPDATE discovery_reports SET status=$1,resolved_by_user_id=$2,resolved_at=CASE WHEN $1 IN ('RESOLVED','DISMISSED') THEN CURRENT_TIMESTAMP ELSE NULL END,resolution_note=$3 WHERE id=$4 RETURNING *`,[status,req.auth!.userId,status==='UNDER_REVIEW'?null:note,req.params.id]);
        await tx.query(`INSERT INTO discovery_report_events(id,report_id,from_status,to_status,actor_user_id,note) VALUES($1,$2,$3,$4,$5,$6)`,[eventId('rep_evt'),req.params.id,row.status,status,req.auth!.userId,note]);
        await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'REPORT',$3,'REPORT_DECIDED',$4,$5,$6,$7,$8)`,[eventId('trust'),row.business_id,req.params.id,row.status,status,req.auth!.userId,note,{}]);
        return updated.rows[0];
      });
      res.json({success:true,data:result});
    }catch(err){next(err);}
  });

  return router;
}
