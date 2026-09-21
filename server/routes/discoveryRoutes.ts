import express, { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requireTenantAccess } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rateLimiter.ts';
import { DiscoveryBusinessRepository } from '../repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';
import { DiscoveryStoreProvisioningService } from '../services/discoveryStoreProvisioningService.ts';
import { discoveryFuzzyScore, discoverySearchTokens, normalizeDiscoverySearchText, rankDiscoveryFuzzy } from '../utils/discoverySearch.ts';
import { rankDiscoveryServiceMatches } from '../utils/discoveryServiceMatching.ts';
import { assertBusinessPermission, type DiscoveryBusinessPermission } from '../services/discoveryBusinessAccess.ts';

const SERVICE_BOOKING_MODES = new Set(['REQUEST', 'BOOKING', 'QUOTE']);
const ANALYTICS_EVENTS = new Set(['SEARCH','IMPRESSION','VIEW','CONTACT','DIRECTION_CLICK','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW','SERVICE_REQUEST','ORDER_CLICK']);
const SEARCH_ATTRIBUTION_EVENTS = new Set(['IMPRESSION','VIEW','CONTACT','DIRECTION_CLICK','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW','SERVICE_REQUEST','ORDER_CLICK']);
const discoverySearchRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120, message: 'Too many discovery search requests. Please slow down and try again shortly.' });
const discoveryAttributionRateLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 180, message: 'Too many discovery attribution events. Please slow down and try again shortly.' });

export function createDiscoveryRouter(db: DatabaseClient) {
  const router = express.Router();
  const repo = new DiscoveryBusinessRepository(db);
  const businessService = new DiscoveryBusinessService(repo, db);

  const actor = (req: Request) => ({
    userId: req.auth!.userId,
    role: req.auth!.role,
    organizationId: req.auth!.organizationId,
  });

  const normalizeLocation = (input: any) => {
    const x = input || {};
    const locationType = String(x.locationType || 'STORE').trim().toUpperCase();
    const allowedTypes = new Set(['STORE','OFFICE','BRANCH','WAREHOUSE','HOME_BASED','MOBILE','SERVICE_AREA','KIOSK','OTHER']);
    if (!allowedTypes.has(locationType)) throw new Error('VALIDATION_ERROR:invalid locationType.');

    const name = String(x.name || '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error('VALIDATION_ERROR:name is required.');
    if (name.length > 255) throw new Error('VALIDATION_ERROR:name exceeds 255 characters.');

    const lat = x.latitude == null || x.latitude === '' ? null : Number(x.latitude);
    const lng = x.longitude == null || x.longitude === '' ? null : Number(x.longitude);
    if ((lat == null) !== (lng == null)) throw new Error('VALIDATION_ERROR:latitude and longitude must be provided together.');
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) throw new Error('VALIDATION_ERROR:latitude must be between -90 and 90.');
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) throw new Error('VALIDATION_ERROR:longitude must be between -180 and 180.');

    const radius = x.serviceRadiusKm == null || x.serviceRadiusKm === '' ? null : Number(x.serviceRadiusKm);
    if (radius != null && (!Number.isFinite(radius) || radius < 0 || radius > 500)) throw new Error('VALIDATION_ERROR:serviceRadiusKm must be between 0 and 500.');
    if (locationType === 'SERVICE_AREA' && (radius == null || radius <= 0)) {
      throw new Error('VALIDATION_ERROR:service-area locations require a positive serviceRadiusKm.');
    }

    const text = (value: any, max: number) => {
      if (value == null || value === '') return null;
      const v = String(value).trim().replace(/\s+/g, ' ');
      if (v.length > max) throw new Error(`VALIDATION_ERROR:location field exceeds ${max} characters.`);
      return v || null;
    };

    const addressLine1 = text(x.addressLine1, 255);
    const city = text(x.city, 128);
    const district = text(x.district, 128);
    const region = text(x.region, 128);
    const addressScore = addressLine1 && city && district && region ? 100 : city && region ? 75 : city ? 50 : 0;
    const coordinateAccuracyM = x.coordinateAccuracyM == null || x.coordinateAccuracyM === '' ? null : Number(x.coordinateAccuracyM);
    const quality = lat != null && lng != null && addressLine1 && city
      ? 'HIGH'
      : (lat != null && lng != null) || (city && region) ? 'MEDIUM' : 'LOW';

    if (coordinateAccuracyM != null && (!Number.isFinite(coordinateAccuracyM) || coordinateAccuracyM < 0)) throw new Error('VALIDATION_ERROR:coordinateAccuracyM must be a non-negative number.');

    return {
      name, locationType, addressLine1, addressLine2: text(x.addressLine2, 255),
      city, district, region, country: text(x.country, 128) || 'Sierra Leone',
      postalCode: text(x.postalCode, 32), latitude: lat, longitude: lng,
      serviceRadiusKm: radius, phone: text(x.phone, 64),
      isPrimary: Boolean(x.isPrimary), isActive: x.isActive !== false,
      locationQualityStatus: x.locationQualityStatus && ['LOW','MEDIUM','HIGH','VERIFIED'].includes(String(x.locationQualityStatus).toUpperCase())
        ? String(x.locationQualityStatus).toUpperCase() : quality,
      locationSource: x.locationSource && ['MANUAL','GPS','GEOCODED','IMPORTED','VERIFIED'].includes(String(x.locationSource).toUpperCase())
        ? String(x.locationSource).toUpperCase() : (lat != null && lng != null ? 'GPS' : 'MANUAL'),
      addressCompletenessScore: addressScore,
      coordinateAccuracyM,
      qualityNotes: text(x.qualityNotes, 1000),
    };
  };

  const fail = (res: Response, err: any) => {
    const raw = String(err?.message || 'Discovery request failed.');
    const code = raw.split(':')[0];
    const status = ['NOT_FOUND','DISCOVERY_BUSINESS_NOT_FOUND'].includes(code) ? 404
      : ['PERMISSION_DENIED','TENANT_ACCESS_DENIED','INACTIVE_ORGANIZATION'].includes(code) ? 403
      : code.startsWith('VALIDATION_ERROR') ? 422
      : ['INVALID_STATE_TRANSITION','DISCOVERY_INVALID_LIFECYCLE','CONFLICT'].includes(code) ? 409
      : 400;
    res.status(status).json({ success: false, error: { code: code || 'DISCOVERY_ERROR', message: raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : raw } });
  };

  // Resource ownership is intentionally delegated to the domain service so route-level
  // authorization cannot drift from the tenant-boundary rules used by lifecycle/update APIs.
  const owned = async (req: Request, businessId: string, permission: DiscoveryBusinessPermission = 'business.listing.manage') => {
    if (!req.auth) return false;
    if (req.auth.role === 'super_admin') return true;
    try {
      await assertBusinessPermission(db, businessId, req.auth.userId, permission);
      return true;
    } catch {
      return false;
    }
  };

  const requireBusinessPermission = async (req: Request, businessId: string, permission: DiscoveryBusinessPermission) => {
    if (!req.auth) throw new Error('UNAUTHORIZED:Authentication required.');
    if (req.auth.role === 'super_admin') return;
    await assertBusinessPermission(db, businessId, req.auth.userId, permission);
  };

  const publicBusiness = async (id: string) => businessService.getPublicProfile(id);
  const trustEvent = async (businessId: string | null, entityType: string, entityId: string, eventType: string, actorUserId: string | null, fromStatus?: string | null, toStatus?: string | null, reason?: string | null, metadata: Record<string, unknown> = {}) => {
    await db.query(
      `INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [`trust_${randomUUID().replace(/-/g,'')}`, businessId, entityType, entityId, eventType, fromStatus || null, toStatus || null, actorUserId, reason || null, metadata],
    );
  };

  // ------------------------------------------------------------------
  // DISC-005/006: onboarding + listing lifecycle
  // ------------------------------------------------------------------
  router.get('/businesses', async (req, res, next) => {
    try {
      const data = await businessService.listPublished({
        city: typeof req.query.city === 'string' ? req.query.city : undefined,
        district: typeof req.query.district === 'string' ? req.query.district : undefined,
        region: typeof req.query.region === 'string' ? req.query.region : undefined,
        businessType: typeof req.query.businessType === 'string' ? req.query.businessType : undefined,
        categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
        limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
        offset: typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined,
      });
      res.json({ success: true, count: data.length, data });
    } catch (err) { next(err); }
  });

  router.get('/businesses/mine', requireAuth(), async (req, res, next) => {
    try {
      const role = req.auth!.role; const values: unknown[] = []; let where = '';
      if (role === 'super_admin') where = 'TRUE';
      else if (['admin', 'manager'].includes(role) && req.auth!.organizationId) { values.push(req.auth!.organizationId); where = 'organization_id=$1'; }
      else { values.push(req.auth!.userId); where = 'created_by_user_id=$1'; }
      const r = await db.query('SELECT * FROM discovery_businesses WHERE ' + where + ' ORDER BY updated_at DESC, created_at DESC LIMIT 100', values);
      res.json({ success: true, count: r.rows.length, data: r.rows });
    } catch (err) { next(err); }
  });

  // ------------------------------------------------------------------
  // DISC-011: authenticated customer favorites
  // ------------------------------------------------------------------
  // Customer ownership-claim workspace. Only the authenticated claimant's own records are exposed.
  router.get('/my-claims', requireAuth(), async (req, res, next) => {
    try {
      const result = await db.query(
        `SELECT c.id,c.business_id,c.claimant_user_id,c.claimant_name,c.claimant_email,c.evidence,
                c.status,c.created_at,c.review_reason,c.reviewed_at,b.name AS business_name
           FROM discovery_business_claims c
           JOIN discovery_businesses b ON b.id=c.business_id
          WHERE c.claimant_user_id=$1
          ORDER BY c.created_at DESC
          LIMIT 100`,
        [req.auth!.userId],
      );
      res.json({ success: true, data: result.rows });
    } catch (err) { next(err); }
  });

  router.get('/favorites', requireAuth(), async (req,res,next)=>{try{
    const r=await db.query(
      `SELECT f.id AS favorite_id,f.created_at AS favorited_at,b.*
       FROM discovery_business_favorites f
       JOIN discovery_businesses b ON b.id=f.business_id
       WHERE f.user_id=$1
         AND b.listing_status='PUBLISHED'
         AND b.is_discoverable=TRUE
         AND (b.organization_id IS NULL OR EXISTS (
           SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
         ))
       ORDER BY f.created_at DESC
       LIMIT 100`,
      [req.auth!.userId],
    );
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.get('/businesses/:id/favorite', requireAuth(), async (req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b || b.listing_status!=='PUBLISHED' || !b.is_discoverable) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
    const r=await db.query('SELECT 1 FROM discovery_business_favorites WHERE business_id=$1 AND user_id=$2',[req.params.id,req.auth!.userId]);
    res.json({success:true,data:{businessId:req.params.id,isFavorite:r.rows.length>0}});
  }catch(err){next(err);}});

  router.post('/businesses/:id/favorite', requireAuth(), async (req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b || b.listing_status!=='PUBLISHED' || !b.is_discoverable) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
    if(b.organization_id){
      const org=await db.query('SELECT is_active FROM organizations WHERE id=$1',[b.organization_id]);
      if(!org.rows[0]?.is_active) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
    }
    await db.query(
      'INSERT INTO discovery_business_favorites(id,business_id,user_id) VALUES($1,$2,$3) ON CONFLICT(business_id,user_id) DO NOTHING',
      [`fav_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId],
    );
    res.status(201).json({success:true,data:{businessId:req.params.id,isFavorite:true}});
  }catch(err){next(err);}});

  router.delete('/businesses/:id/favorite', requireAuth(), async (req,res,next)=>{try{
    await db.query('DELETE FROM discovery_business_favorites WHERE business_id=$1 AND user_id=$2',[req.params.id,req.auth!.userId]);
    res.json({success:true,data:{businessId:req.params.id,isFavorite:false}});
  }catch(err){next(err);}});

  router.get('/businesses/:slug', async (req, res, next) => {
    try {
      const business = await businessService.getBySlug(req.params.slug, true);
      if (!business) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Business listing not found.' } });
      res.json({ success: true, data: await publicBusiness(business.id) });
    } catch (err) { next(err); }
  });

  router.post('/businesses', requireAuth(), async (req, res, next) => {
    try {
      const organizationId = req.body?.organizationId === undefined ? req.auth!.organizationId : String(req.body.organizationId || '');
      if (req.auth!.role !== 'super_admin' && organizationId !== req.auth!.organizationId) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Cross-tenant discovery business creation forbidden.' } });
      const data = await businessService.create({ ...req.body, organizationId: organizationId || null, createdByUserId: req.auth!.userId }, actor(req));
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.post('/businesses/:id/convert-to-store', requireAuth(), async (req, res, next) => {
    try {
      if (!req.auth!.organizationId) return res.status(422).json({success:false,error:{code:'TENANT_REQUIRED',message:'An active organization is required to enable store mode.'}});
      if (!(await owned(req, req.params.id, 'business.store.manage'))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Business conversion forbidden.'}});
      const business = await repo.findById(req.params.id);
      if (!business) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
      if (business.organization_id && business.organization_id !== req.auth!.organizationId) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Business is already bound to another organization.'}});
      const provisioned = await new DiscoveryStoreProvisioningService(db).provisionForDiscoveryBusiness(business.id, req.auth!.organizationId, business.slug, business.name);
      const data = await repo.findById(business.id);
      res.json({success:true,data,store:{provisioned:true,tenantSlug:provisioned.tenantSlug,organizationId:provisioned.organizationId}});
    } catch (err) { next(err); }
  });

  router.patch('/businesses/:id', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Business modification forbidden.' } });
      res.json({ success: true, data: await businessService.update(req.params.id, req.body, actor(req)) });
    } catch (err) { next(err); }
  });

  for (const [path, action] of [
    ['/submit', 'submit'], ['/review', 'review'], ['/approve', 'approve'], ['/publish', 'publish'], ['/pause', 'pause'], ['/suspend', 'suspend'],
  ] as const) {
    router.post(`/businesses/:id${path}`, requireAuth(), async (req, res, next) => {
      try {
        if (!['approve', 'suspend'].includes(action) && !(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Business lifecycle operation forbidden.' } });
        const data = await (businessService as any)[action](req.params.id, actor(req), req.body?.reason);
        res.json({ success: true, data });
      } catch (err) { next(err); }
    });
  }

  router.post('/businesses/:id/archive', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Business lifecycle operation forbidden.' } });
      const data = await (businessService as any).transition(req.params.id, 'ARCHIVED', actor(req), req.body?.reason || 'Listing archived.');
      res.json({ success: true, data });
    } catch (err) { next(err); }
  });

  // ------------------------------------------------------------------
  // DISC-007: locations, service areas, hours and public settings
  // ------------------------------------------------------------------
  router.get('/businesses/:id/locations', async (req, res, next) => {
    try { res.json({ success: true, data: await repo.listLocations(req.params.id, { activeOnly: true }) }); } catch (err) { next(err); }
  });

  router.post('/businesses/:id/locations', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id, 'business.locations.manage'))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Location management forbidden.' } });
      const b = await repo.findById(req.params.id);
      if (!b || b.listing_status === 'ARCHIVED') throw new Error('DISCOVERY_ARCHIVED:Archived businesses cannot add locations.');
      const x = normalizeLocation(req.body);
      const id = `loc_${randomUUID().replace(/-/g, '')}`;
      const data = await db.withTransaction(async (tx) => {
        if (x.isPrimary) await tx.query('UPDATE discovery_business_locations SET is_primary = FALSE WHERE business_id = $1', [req.params.id]);
        const result = await tx.query(`INSERT INTO discovery_business_locations
          (id,business_id,name,location_type,address_line_1,address_line_2,city,district,region,country,postal_code,
           latitude,longitude,service_radius_km,phone,is_primary,is_active,location_quality_status,location_source,
           address_completeness_score,coordinate_accuracy_m,quality_notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
          [id,req.params.id,x.name,x.locationType,x.addressLine1,x.addressLine2,x.city,x.district,x.region,x.country,x.postalCode,
           x.latitude,x.longitude,x.serviceRadiusKm,x.phone,x.isPrimary,x.isActive,x.locationQualityStatus,x.locationSource,
           x.addressCompletenessScore,x.coordinateAccuracyM,x.qualityNotes]);
        return result.rows[0];
      });
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.patch('/businesses/:id/locations/:locationId', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Location management forbidden.' } });
      const existing = await db.query('SELECT * FROM discovery_business_locations WHERE id=$1 AND business_id=$2', [req.params.locationId, req.params.id]);
      if (!existing.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Location not found.'}});
      const merged = { ...existing.rows[0], ...req.body, locationType: req.body?.locationType ?? existing.rows[0].location_type,
        addressLine1: req.body?.addressLine1 ?? existing.rows[0].address_line_1, addressLine2: req.body?.addressLine2 ?? existing.rows[0].address_line_2,
        city: req.body?.city ?? existing.rows[0].city, district: req.body?.district ?? existing.rows[0].district,
        region: req.body?.region ?? existing.rows[0].region, country: req.body?.country ?? existing.rows[0].country,
        postalCode: req.body?.postalCode ?? existing.rows[0].postal_code, latitude: req.body?.latitude ?? existing.rows[0].latitude,
        longitude: req.body?.longitude ?? existing.rows[0].longitude, serviceRadiusKm: req.body?.serviceRadiusKm ?? existing.rows[0].service_radius_km,
        phone: req.body?.phone ?? existing.rows[0].phone, name: req.body?.name ?? existing.rows[0].name,
        isPrimary: req.body?.isPrimary ?? existing.rows[0].is_primary, isActive: req.body?.isActive ?? existing.rows[0].is_active,
        locationSource: req.body?.locationSource ?? existing.rows[0].location_source, coordinateAccuracyM: req.body?.coordinateAccuracyM ?? existing.rows[0].coordinate_accuracy_m,
        qualityNotes: req.body?.qualityNotes ?? existing.rows[0].quality_notes };
      const x = normalizeLocation(merged);
      const result = await db.withTransaction(async (tx) => {
        if (x.isPrimary) await tx.query('UPDATE discovery_business_locations SET is_primary = FALSE WHERE business_id = $1 AND id <> $2', [req.params.id, req.params.locationId]);
        const r = await tx.query(`UPDATE discovery_business_locations SET
          name=$1,location_type=$2,address_line_1=$3,address_line_2=$4,city=$5,district=$6,region=$7,country=$8,postal_code=$9,
          latitude=$10,longitude=$11,service_radius_km=$12,phone=$13,is_primary=$14,is_active=$15,
          location_quality_status=$16,location_source=$17,address_completeness_score=$18,coordinate_accuracy_m=$19,quality_notes=$20,
          location_verified_at=CASE WHEN $16='VERIFIED' THEN COALESCE(location_verified_at,CURRENT_TIMESTAMP) ELSE NULL END,
          updated_at=CURRENT_TIMESTAMP
          WHERE business_id=$21 AND id=$22 RETURNING *`,
          [x.name,x.locationType,x.addressLine1,x.addressLine2,x.city,x.district,x.region,x.country,x.postalCode,x.latitude,x.longitude,
           x.serviceRadiusKm,x.phone,x.isPrimary,x.isActive,x.locationQualityStatus,x.locationSource,x.addressCompletenessScore,x.coordinateAccuracyM,x.qualityNotes,
           req.params.id,req.params.locationId]);
        return r.rows[0];
      });
      if (!result) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Location not found.'}});
      res.json({success:true,data:result});
    } catch (err) { next(err); }
  });

  router.post('/businesses/:id/locations/:locationId/verify', requireAuth(), async (req,res,next)=>{
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Location verification forbidden.'}});
      const r=await db.query(`UPDATE discovery_business_locations
        SET location_quality_status='VERIFIED',location_source='VERIFIED',location_verified_at=CURRENT_TIMESTAMP,
            location_verified_by_user_id=$1,updated_at=CURRENT_TIMESTAMP
        WHERE business_id=$2 AND id=$3 RETURNING *`,[req.auth!.userId,req.params.id,req.params.locationId]);
      if(!r.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Location not found.'}});
      res.json({success:true,data:r.rows[0]});
    }catch(err){next(err);}
  });

  router.put('/businesses/:id/locations/:locationId/hours', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Hours management forbidden.'} });
      const location = await db.query('SELECT id FROM discovery_business_locations WHERE id=$1 AND business_id=$2', [req.params.locationId, req.params.id]);
      if (!location.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Location not found.'}});
      const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
      for (const h of hours) {
        const day = Number(h.dayOfWeek);
        if (day < 1 || day > 7) throw new Error('VALIDATION_ERROR:dayOfWeek must be 1..7.');
        const closed = Boolean(h.isClosed);
        if (!closed && (!h.opensAt || !h.closesAt || h.opensAt === h.closesAt)) throw new Error('VALIDATION_ERROR:open hours require different opensAt and closesAt values.');
        await db.query(`INSERT INTO discovery_business_hours (id,location_id,day_of_week,is_closed,opens_at,closes_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(location_id,day_of_week) DO UPDATE SET is_closed=EXCLUDED.is_closed,opens_at=EXCLUDED.opens_at,closes_at=EXCLUDED.closes_at,updated_at=CURRENT_TIMESTAMP`, [`hrs_${randomUUID().replace(/-/g,'')}`, req.params.locationId, day, closed, closed ? null : h.opensAt, closed ? null : h.closesAt]);
      }
      const result = await db.query('SELECT * FROM discovery_business_hours WHERE location_id=$1 ORDER BY day_of_week', [req.params.locationId]);
      res.json({success:true,data:result.rows});
    } catch (err) { next(err); }
  });

  router.patch('/businesses/:id/settings', requireAuth(), async (req,res,next)=>{
    try {
      if (!(await owned(req, req.params.id, 'business.settings.manage'))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Discovery settings management forbidden.'}});
      const keys = ['show_products','show_prices','show_stock_status','allow_phone_contact','allow_whatsapp_contact','allow_directions','allow_service_requests','allow_reviews','allow_public_store_link'];
      const values: any[] = [];
      const set: string[] = [];
      for (const key of keys) if (typeof req.body?.[key] === 'boolean' || typeof req.body?.[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())] === 'boolean') { const camel = key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()); values.push(req.body[key] ?? req.body[camel]); set.push(`${key}=$${values.length}`); }
      if (set.length) { values.push(req.params.id); await db.query(`UPDATE discovery_business_settings SET ${set.join(',')},updated_at=CURRENT_TIMESTAMP WHERE business_id=$${values.length}`, values); }
      const result = await repo.getSettings(req.params.id); res.json({success:true,data:result});
    } catch(err){next(err);}
  });

  // ------------------------------------------------------------------
  // DISC-008/009/015: unified discovery search + indexed relevance
  // ------------------------------------------------------------------
  router.get('/search/suggestions', discoverySearchRateLimiter, async (req,res,next)=>{
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,160) : '';
      const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 20);
      if (q.length < 2) return res.json({ success: true, query: q, data: [] });

      // Keep SQL candidate generation intentionally cheap and broad, then let the
      // same application-level fuzzy scorer used by search rank the small pool.
      // The two-character prefix improves typo recall (e.g. "phne" -> "phone",
      // "moble" -> "mobile") without requiring pg_trgm in embedded PGlite.
      const normalized = normalizeDiscoverySearchText(q);
      const prefix = normalized.split(' ')[0]?.slice(0, 2) || normalized.slice(0, 2);
      if (prefix.length < 2) return res.json({ success: true, query: q, data: [] });

      const result = await db.query(`
        SELECT label, type
        FROM (
          SELECT b.name AS label, 'business' AS type
          FROM discovery_businesses b
          WHERE b.listing_status='PUBLISHED'
            AND b.is_discoverable=TRUE
            AND (b.organization_id IS NULL OR EXISTS (
              SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
            ))
            AND lower(b.name) LIKE $1 || '%'

          UNION ALL

          SELECT p.name AS label, 'product' AS type
          FROM products p
          JOIN discovery_businesses b
            ON b.organization_id=p.organization_id
           AND b.listing_status='PUBLISHED'
           AND b.is_discoverable=TRUE
           AND EXISTS (
             SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
           )
          WHERE p.status='active'
            AND p.channels_ecommerce=TRUE
            AND lower(p.name) LIKE $1 || '%'

          UNION ALL

          SELECT sa.alias AS label, 'business' AS type
          FROM discovery_search_aliases sa
          JOIN discovery_businesses b ON b.id=sa.entity_id
          WHERE sa.entity_type='BUSINESS'
            AND sa.is_active=TRUE
            AND b.listing_status='PUBLISHED'
            AND b.is_discoverable=TRUE
            AND (b.organization_id IS NULL OR EXISTS (
              SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
            ))
            AND lower(sa.normalized_alias) LIKE $1 || '%'

          UNION ALL

          SELECT sa.alias AS label, 'product' AS type
          FROM discovery_search_aliases sa
          JOIN products p ON p.id=sa.entity_id
          JOIN discovery_businesses b ON b.organization_id=p.organization_id
            AND b.listing_status='PUBLISHED'
            AND b.is_discoverable=TRUE
          WHERE sa.entity_type='PRODUCT'
            AND sa.is_active=TRUE
            AND p.status='active'
            AND p.channels_ecommerce=TRUE
            AND EXISTS (SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE)
            AND lower(sa.normalized_alias) LIKE $1 || '%'

          UNION ALL

          SELECT sa.alias AS label, 'service' AS type
          FROM discovery_search_aliases sa
          JOIN discovery_services s ON s.id=sa.entity_id
          JOIN discovery_businesses b ON b.id=s.business_id
            AND b.listing_status='PUBLISHED'
            AND b.is_discoverable=TRUE
            AND (b.organization_id IS NULL OR EXISTS (
              SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
            ))
          WHERE sa.entity_type='SERVICE'
            AND sa.is_active=TRUE
            AND s.is_active=TRUE
            AND lower(sa.normalized_alias) LIKE $1 || '%'

          UNION ALL

          SELECT s.name AS label, 'service' AS type
          FROM discovery_services s
          JOIN discovery_businesses b
            ON b.id=s.business_id
           AND b.listing_status='PUBLISHED'
           AND b.is_discoverable=TRUE
           AND (b.organization_id IS NULL OR EXISTS (
             SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE
           ))
          WHERE s.is_active=TRUE
            AND lower(s.name) LIKE $1 || '%'
        ) suggestions
        GROUP BY label, type
        LIMIT 200
      `, [prefix]);

      const ranked = rankDiscoveryFuzzy(q, result.rows.map((row:any) => ({
        id: `${row.type}:${row.label}`,
        text: String(row.label),
        label: row.label,
        type: row.type,
      })));

      res.json({
        success: true,
        query: q,
        data: ranked.slice(0, limit).map((entry:any) => ({
          label: entry.item.label,
          type: entry.item.type,
        })),
      });
    } catch (err) { next(err); }
  });

  router.get('/businesses/:id/search-aliases', requireAuth(), async (req,res,next)=>{try{
    if(!(await owned(req,req.params.id,'business.search_aliases.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Search alias access forbidden.'}});
    const r=await db.query("SELECT id,entity_type,entity_id,alias,created_at,updated_at FROM discovery_search_aliases WHERE entity_type='BUSINESS' AND entity_id=$1 AND is_active=TRUE ORDER BY alias",[req.params.id]);
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.post('/businesses/:id/search-aliases', requireAuth(), async (req,res,next)=>{try{
    if(!(await owned(req,req.params.id,'business.search_aliases.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Search alias management forbidden.'}});
    const entityType=String(req.body?.entityType||'BUSINESS').toUpperCase();
    const alias=String(req.body?.alias||'').trim().slice(0,180);
    if(!['BUSINESS','PRODUCT','SERVICE'].includes(entityType))throw new Error('VALIDATION_ERROR:entityType must be BUSINESS, PRODUCT or SERVICE.');
    if(!alias)throw new Error('VALIDATION_ERROR:alias is required.');
    const normalizedAlias=normalizeDiscoverySearchText(alias);
    if(!normalizedAlias)throw new Error('VALIDATION_ERROR:alias must contain searchable characters.');
    let entityId=req.params.id;
    if(entityType==='PRODUCT'){
      const r=await db.query("SELECT p.id FROM products p JOIN discovery_businesses b ON b.organization_id=p.organization_id WHERE p.id=$1 AND b.id=$2",[String(req.body?.entityId||''),req.params.id]);
      if(!r.rows[0])throw new Error('NOT_FOUND:Product does not belong to this business.');
      entityId=String(req.body.entityId);
    } else if(entityType==='SERVICE'){
      const r=await db.query("SELECT s.id FROM discovery_services s WHERE s.id=$1 AND s.business_id=$2",[String(req.body?.entityId||''),req.params.id]);
      if(!r.rows[0])throw new Error('NOT_FOUND:Service does not belong to this business.');
      entityId=String(req.body.entityId);
    }
    const id=`alias_${randomUUID().replace(/-/g,'')}`;
    const r=await db.query("INSERT INTO discovery_search_aliases(id,entity_type,entity_id,alias,normalized_alias) VALUES($1,$2,$3,$4,$5) ON CONFLICT(entity_type,entity_id,normalized_alias) DO UPDATE SET alias=EXCLUDED.alias,is_active=TRUE,updated_at=CURRENT_TIMESTAMP RETURNING id,entity_type,entity_id,alias,created_at,updated_at",[id,entityType,entityId,alias,normalizedAlias]);
    res.status(201).json({success:true,data:r.rows[0]});
  }catch(err){next(err);}});

  router.delete('/businesses/:id/search-aliases/:aliasId', requireAuth(), async (req,res,next)=>{try{
    if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Search alias management forbidden.'}});
    const r=await db.query("UPDATE discovery_search_aliases SET is_active=FALSE,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND ((entity_type='BUSINESS' AND entity_id=$2) OR entity_type IN ('PRODUCT','SERVICE') AND entity_id IN (SELECT p.id FROM products p JOIN discovery_businesses b ON b.organization_id=p.organization_id WHERE b.id=$2 UNION SELECT s.id FROM discovery_services s WHERE s.business_id=$2)) RETURNING id",[req.params.aliasId,req.params.id]);
    if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Search alias not found.'}});
    res.json({success:true});
  }catch(err){next(err);}});

  router.get('/search', discoverySearchRateLimiter, async (req,res,next)=>{
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0,160) : '';
      const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : 'all';
      if (!['all','businesses','products','services'].includes(type)) {
        throw new Error('VALIDATION_ERROR:type must be all, businesses, products or services.');
      }
      const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0,128) : null;
      const district = typeof req.query.district === 'string' ? req.query.district.trim().slice(0,128) : null;
      const region = typeof req.query.region === 'string' ? req.query.region.trim().slice(0,128) : null;
      const lat = req.query.lat != null ? Number(req.query.lat) : null;
      const lng = req.query.lng != null ? Number(req.query.lng) : null;
      const radius = req.query.radiusKm != null ? Number(req.query.radiusKm) : 25;
      const limit = Math.min(Math.max(Number(req.query.limit || 20),1),100);
      const offset = Math.max(Number(req.query.offset || 0),0);
      const openNow = String(req.query.openNow || '').toLowerCase() === 'true';
      const categoryId = typeof req.query.categoryId === 'string' && req.query.categoryId.trim() ? req.query.categoryId.trim() : null;
      const sort = typeof req.query.sort === 'string' && ['relevance','rating','review_count','name_asc','newest','distance'].includes(req.query.sort) ? req.query.sort : 'relevance';
      const searchId = `search_${randomUUID().replace(/-/g,'')}`;
      const rankingRow = (await db.query<any>('SELECT * FROM discovery_search_ranking_config WHERE id=\'default\'')).rows[0];
      const ranking = rankingRow?.is_active ? rankingRow : {
        text_match_weight: 100, exact_match_weight: 40, prefix_match_weight: 25, verified_weight: 20,
        rating_weight: 4, review_count_weight: 2, fuzzy_match_weight: 35, distance_penalty_weight: 0.10,
        availability_weight: 10,
      };
      const weight = (value: any, fallback: number) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
      const rankingWeights = {
        text: weight(ranking.text_match_weight, 100),
        exact: weight(ranking.exact_match_weight, 40),
        prefix: weight(ranking.prefix_match_weight, 25),
        verified: weight(ranking.verified_weight, 20),
        rating: weight(ranking.rating_weight, 4),
        reviewCount: weight(ranking.review_count_weight, 2),
        fuzzy: weight(ranking.fuzzy_match_weight, 35),
        distancePenalty: weight(ranking.distance_penalty_weight, 0.10),
        availability: weight(ranking.availability_weight, 10),
      };
      const fuzzyEnabled = Boolean(q) && sort === 'relevance';
      const fuzzyCandidateLimit = fuzzyEnabled ? 500 : limit;
      const searchTokens = q ? [...new Set(discoverySearchTokens(q))].slice(0, 8) : [];
      const searchPrefixes = [...new Set(searchTokens.filter((token) => token.length >= 2).map((token) => token.slice(0, 3)))].slice(0, 8);
      const normalizedQuery = q ? normalizeDiscoverySearchText(q) : '';

      if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
        throw new Error('VALIDATION_ERROR:latitude and longitude must be valid numbers.');
      }
      if ((lat == null) !== (lng == null)) throw new Error('VALIDATION_ERROR:latitude and longitude must be supplied together.');
      if (lat != null && lng != null && (lat < -90 || lat > 90 || lng < -180 || lng > 180)) {
        throw new Error('VALIDATION_ERROR:latitude/longitude out of range.');
      }
      if (!Number.isFinite(radius) || radius < 0 || radius > 500) throw new Error('VALIDATION_ERROR:radiusKm must be between 0 and 500.');

      const now = new Date();
      const nowDow = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
      const nowTime = now.toISOString().slice(11,19);
      const distanceExpr = lat != null && lng != null
        ? `6371 * acos(LEAST(1,GREATEST(-1,
            cos(radians(${lat}))*cos(radians(l.latitude))*cos(radians(l.longitude)-radians(${lng}))
            + sin(radians(${lat}))*sin(radians(l.latitude))
          )))`
        : null;

      const businessParams:any[] = [];
      const bb=(v:any)=>{businessParams.push(v);return `$${businessParams.length}`;};
      const bQ = q ? bb(q) : null;
      const bConditions:string[] = [
        "b.listing_status='PUBLISHED'",
        "b.is_discoverable=TRUE",
        "(b.organization_id IS NULL OR EXISTS(SELECT 1 FROM organizations bo WHERE bo.id=b.organization_id AND bo.is_active=TRUE))",
      ];
      if (bQ) {
        bConditions.push(`(
          to_tsvector('simple', coalesce(b.name,'') || ' ' || coalesce(b.legal_name,'') || ' ' ||
            coalesce(b.short_description,'') || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.business_type,''))
            @@ plainto_tsquery('simple', ${bQ})
          OR lower(b.name) LIKE '%' || lower(${bQ}) || '%'
          OR lower(coalesce(b.short_description,'')) LIKE '%' || lower(${bQ}) || '%'
          OR EXISTS (
            SELECT 1
            FROM discovery_business_category_map bcm
            JOIN discovery_business_categories bc ON bc.id=bcm.category_id
            WHERE bcm.business_id=b.id
              AND bc.name ILIKE '%' || ${bQ} || '%'
          )
          OR (${fuzzyEnabled} AND ${searchPrefixes.length ? searchPrefixes.map((prefix) => `lower(coalesce(b.name,'') || ' ' || coalesce(b.legal_name,'') || ' ' || coalesce(b.short_description,'') || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.business_type,'')) LIKE '%' || ${bb(prefix)} || '%'`).join(' OR ') : 'FALSE'})
          OR (${fuzzyEnabled} AND EXISTS (SELECT 1 FROM discovery_search_aliases sa WHERE sa.entity_type='BUSINESS' AND sa.entity_id=b.id AND sa.is_active=TRUE AND (sa.normalized_alias LIKE '%' || ${bb(normalizedQuery)} || '%' OR ${searchPrefixes.length ? searchPrefixes.map((prefix) => `sa.normalized_alias LIKE '%' || ${bb(prefix)} || '%'`).join(' OR ') : 'FALSE'})))
        )`);
      }
      if (categoryId) bConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm JOIN discovery_business_categories c ON c.id=bcm.category_id WHERE bcm.business_id=b.id AND bcm.category_id=${bb(categoryId)} AND c.is_active=TRUE)`);
      if (city) bConditions.push(`lower(l.city)=lower(${bb(city)})`);
      if (district) bConditions.push(`lower(l.district)=lower(${bb(district)})`);
      if (region) bConditions.push(`lower(l.region)=lower(${bb(region)})`);
      if (distanceExpr) {
        bConditions.push(`${distanceExpr} <= GREATEST(${bb(radius)}, COALESCE(l.service_radius_km,0)) AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
      }
      if (openNow) {
        bConditions.push(`EXISTS(
          SELECT 1 FROM discovery_business_hours h
          WHERE h.location_id=l.id AND h.day_of_week=${bb(nowDow)}
            AND h.is_closed=FALSE AND h.opens_at<=${bb(nowTime)}::time AND h.closes_at>=${bb(nowTime)}::time
        )`);
      }

      const ratingExpr = "(SELECT COALESCE(AVG(r.rating),0) FROM discovery_reviews r WHERE r.business_id=b.id AND r.status='PUBLISHED')";
      const reviewCountExpr = "(SELECT COUNT(*) FROM discovery_reviews r WHERE r.business_id=b.id AND r.status='PUBLISHED')";
      const businessRank = bQ
        ? `(
            ts_rank_cd(
              to_tsvector('simple', coalesce(b.name,'') || ' ' || coalesce(b.legal_name,'') || ' ' ||
                coalesce(b.short_description,'') || ' ' || coalesce(b.description,'') || ' ' || coalesce(b.business_type,'')),
              plainto_tsquery('simple', ${bQ})
            ) * ${rankingWeights.text}
            + CASE WHEN lower(b.name)=lower(${bQ}) THEN ${rankingWeights.exact} WHEN lower(b.name) LIKE lower(${bQ}) || '%' THEN ${rankingWeights.prefix} ELSE 0 END
            + CASE WHEN b.verification_status='VERIFIED' THEN ${rankingWeights.verified} ELSE 0 END
            + ${ratingExpr} * ${rankingWeights.rating}
            + ln(1 + ${reviewCountExpr}) * ${rankingWeights.reviewCount}
            ${distanceExpr ? `- LEAST(${distanceExpr},100) * ${rankingWeights.distancePenalty}` : ''}
          )`
        : `(
            CASE WHEN b.verification_status='VERIFIED' THEN ${rankingWeights.verified} ELSE 0 END
            + ${ratingExpr} * ${rankingWeights.rating}
            + ln(1 + ${reviewCountExpr}) * ${rankingWeights.reviewCount}
          )`;

      let businessResults:any[]=[];
      let businessCount = 0;
      if (type !== 'products' && type !== 'services') {
        const order = sort === 'rating' ? `${ratingExpr} DESC, b.name ASC, b.id ASC`
          : sort === 'review_count' ? `${reviewCountExpr} DESC, b.name ASC, b.id ASC`
          : sort === 'name_asc' ? 'b.name ASC, b.id ASC'
          : sort === 'newest' ? 'b.published_at DESC NULLS LAST, b.name ASC, b.id ASC'
          : sort === 'distance' && distanceExpr ? `${distanceExpr} ASC, b.name ASC, b.id ASC`
          : `search_rank DESC, b.name ASC, b.id ASC`;
        const r=await db.query(`
          SELECT b.id,b.public_id,b.name,b.slug,b.business_type,b.short_description,b.phone,b.whatsapp,b.website,
                 b.logo_url,b.cover_image_url,b.business_mode,o.slug AS tenant_slug,b.verification_status,
                 l.name AS location_name,l.city,l.district,l.region,l.latitude,l.longitude,l.service_radius_km,l.location_quality_status,l.location_source,
                 c.category_name,c.category_slug,
                 ${distanceExpr ? `${distanceExpr} AS distance_km,` : ''}
                 ${ratingExpr} AS rating,${reviewCountExpr} AS review_count,
                 ${businessRank} AS search_rank,
                 COALESCE((SELECT string_agg(sa.alias,' ' ORDER BY sa.alias) FROM discovery_search_aliases sa WHERE sa.entity_type='BUSINESS' AND sa.entity_id=b.id AND sa.is_active=TRUE),'') AS search_aliases,
                 COUNT(*) OVER() AS total_count
          FROM discovery_businesses b
          LEFT JOIN organizations o ON o.id=b.organization_id
          LEFT JOIN LATERAL (
            SELECT l.* FROM discovery_business_locations l
            WHERE l.business_id=b.id AND l.is_active=TRUE
            ORDER BY l.is_primary DESC,l.created_at ASC LIMIT 1
          ) l ON TRUE
          LEFT JOIN LATERAL (
            SELECT c.name AS category_name,c.slug AS category_slug
            FROM discovery_business_category_map m
            JOIN discovery_business_categories c ON c.id=m.category_id
            WHERE m.business_id=b.id
            ORDER BY m.is_primary DESC LIMIT 1
          ) c ON TRUE
          WHERE ${bConditions.join(' AND ')}
          ORDER BY ${order}
          LIMIT ${bb(fuzzyCandidateLimit)} OFFSET ${fuzzyEnabled ? bb(0) : bb(offset)}
        `,businessParams);
        businessResults=r.rows;
        businessCount = Number(r.rows[0]?.total_count || 0);
        if (fuzzyEnabled) {
          const ranked = businessResults.map((row:any, index:number) => ({
            row,
            fuzzyScore: discoveryFuzzyScore(q, [row.name,row.business_type,row.short_description,row.category_name,row.search_aliases].filter(Boolean).join(' ')),
            index,
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * rankingWeights.fuzzy}))
            .sort((a:any,b:any) => b.combinedRank-a.combinedRank || b.fuzzyScore-a.fuzzyScore || String(a.row.name).localeCompare(String(b.row.name)) || a.index-b.index);
          businessResults = ranked.slice(offset, offset + limit).map((x:any) => ({...x.row, fuzzy_score: Number(x.fuzzyScore.toFixed(4))}));
        }
      }

      const productParams:any[]=[];
      const pb=(v:any)=>{productParams.push(v);return `$${productParams.length}`;};
      const pQ=q?pb(q):null;
      const pConditions:string[]=[
        "p.status='active'",
        "p.channels_ecommerce=TRUE",
        "b.listing_status='PUBLISHED'",
        "b.is_discoverable=TRUE",
        "(b.organization_id IS NULL OR o.is_active=TRUE)",
        "COALESCE(ds.show_products,TRUE)=TRUE"
      ];
      if(pQ) pConditions.push(`(
        to_tsvector('simple',coalesce(p.name,'') || ' ' || coalesce(p.short_description,'') || ' ' ||
          coalesce(p.description,'') || ' ' || coalesce(p.slug,''))
          @@ plainto_tsquery('simple',${pQ})
        OR lower(p.name) LIKE '%' || lower(${pQ}) || '%'
        OR EXISTS(SELECT 1 FROM product_variants pv_search WHERE pv_search.product_id=p.id AND lower(coalesce(pv_search.sku,'')) LIKE '%' || lower(${pQ}) || '%')
        OR (${fuzzyEnabled} AND ${searchPrefixes.length ? searchPrefixes.map((prefix) => `lower(coalesce(p.name,'') || ' ' || coalesce(p.short_description,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.slug,'')) LIKE '%' || ${pb(prefix)} || '%'`).join(' OR ') : 'FALSE'})
        OR (${fuzzyEnabled} AND EXISTS (SELECT 1 FROM discovery_search_aliases sa WHERE sa.entity_type='PRODUCT' AND sa.entity_id=p.id AND sa.is_active=TRUE AND (sa.normalized_alias LIKE '%' || ${pb(normalizedQuery)} || '%' OR ${searchPrefixes.length ? searchPrefixes.map((prefix) => `sa.normalized_alias LIKE '%' || ${pb(prefix)} || '%'`).join(' OR ') : 'FALSE'})))
      )`);
      if(categoryId) pConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm JOIN discovery_business_categories c ON c.id=bcm.category_id WHERE bcm.business_id=b.id AND bcm.category_id=${pb(categoryId)} AND c.is_active=TRUE)`);
      if(city) pConditions.push(`lower(l.city)=lower(${pb(city)})`);
      if(district) pConditions.push(`lower(l.district)=lower(${pb(district)})`);
      if(region) pConditions.push(`lower(l.region)=lower(${pb(region)})`);
      if(distanceExpr) pConditions.push(`${distanceExpr} <= GREATEST(${pb(radius)}, COALESCE(l.service_radius_km,0)) AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
      const productRank=pQ?`(
        ts_rank_cd(to_tsvector('simple',coalesce(p.name,'') || ' ' || coalesce(p.short_description,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.slug,'')),plainto_tsquery('simple',${pQ}))*${rankingWeights.text}
        + CASE WHEN lower(p.name)=lower(${pQ}) THEN ${rankingWeights.exact} WHEN lower(p.name) LIKE lower(${pQ}) || '%' THEN ${rankingWeights.prefix} ELSE 0 END
        + CASE WHEN COALESCE(SUM(ib.available),0)>0 THEN ${rankingWeights.availability} ELSE 0 END
      )`:`CASE WHEN COALESCE(SUM(ib.available),0)>0 THEN ${rankingWeights.availability} ELSE 0 END`;
      let productResults:any[]=[];
      let productCount = 0;
      if(type !== 'businesses' && type !== 'services'){
        const order=sort==='name_asc'?'p.name ASC,p.id ASC':`search_rank DESC,p.name ASC`;
        const r=await db.query(`
          SELECT p.id AS product_id,p.name AS product_name,p.slug AS product_slug,p.short_description,p.description,p.images,
                 p.organization_id,b.id AS business_id,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,
                 l.city,l.district,l.region,l.service_radius_km,l.location_quality_status,l.location_source,v.id AS variant_id,v.sku,v.name AS variant_name,v.retail_price,
                 COALESCE(SUM(ib.available),0) AS available_stock,ds.show_prices,ds.show_stock_status,
                 ${distanceExpr ? `${distanceExpr} AS distance_km,` : ''}
                 ${productRank} AS search_rank,
                 COALESCE((SELECT string_agg(sa.alias,' ' ORDER BY sa.alias) FROM discovery_search_aliases sa WHERE sa.entity_type='PRODUCT' AND sa.entity_id=p.id AND sa.is_active=TRUE),'') AS search_aliases,
                 COUNT(*) OVER() AS total_count
          FROM products p
          JOIN product_variants v ON v.product_id=p.id
          JOIN discovery_businesses b ON b.organization_id=p.organization_id
            AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
          JOIN organizations o ON o.id=b.organization_id AND o.is_active=TRUE
          LEFT JOIN discovery_business_settings ds ON ds.business_id=b.id
          LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE AND l.is_primary=TRUE
          LEFT JOIN inventory_balances ib ON ib.variant_id=v.id
          WHERE ${pConditions.join(' AND ')}
          GROUP BY p.id,v.id,b.id,l.id,ds.show_prices,ds.show_stock_status
          ORDER BY ${sort === 'distance' && distanceExpr ? `${distanceExpr} ASC, p.name ASC, p.id ASC` : order}
          LIMIT ${pb(fuzzyCandidateLimit)} OFFSET ${fuzzyEnabled ? pb(0) : pb(offset)}
        `,productParams);
        productResults=r.rows;
        productCount = Number(r.rows[0]?.total_count || 0);
        if (fuzzyEnabled) {
          const ranked = productResults.map((row:any, index:number) => ({
            row,
            fuzzyScore: discoveryFuzzyScore(q, [row.product_name,row.product_slug,row.short_description,row.description,row.sku,row.search_aliases].filter(Boolean).join(' ')),
            index,
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * rankingWeights.fuzzy}))
            .sort((a:any,b:any) => b.combinedRank-a.combinedRank || b.fuzzyScore-a.fuzzyScore || String(a.row.product_name).localeCompare(String(b.row.product_name)) || a.index-b.index);
          productResults = ranked.slice(offset, offset + limit).map((x:any) => ({...x.row, fuzzy_score: Number(x.fuzzyScore.toFixed(4))}));
        }
      }

      const serviceParams:any[]=[];
      const sb=(v:any)=>{serviceParams.push(v);return `$${serviceParams.length}`;};
      const sQ=q?sb(q):null;
      const sConditions:string[]=[
        "s.is_active=TRUE",
        "b.listing_status='PUBLISHED'",
        "b.is_discoverable=TRUE",
        "(b.organization_id IS NULL OR o.is_active=TRUE)"
      ];
      if(sQ) sConditions.push(`(
        to_tsvector('simple',coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' ||
          coalesce(s.service_type,'') || ' ' || coalesce(s.service_area_text,''))
          @@ plainto_tsquery('simple',${sQ})
        OR lower(s.name) LIKE '%' || lower(${sQ}) || '%'
        OR lower(coalesce(s.service_type,'')) LIKE '%' || lower(${sQ}) || '%'
        OR (${fuzzyEnabled} AND ${searchPrefixes.length ? searchPrefixes.map((prefix) => `lower(coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.service_type,'') || ' ' || coalesce(s.service_area_text,'')) LIKE '%' || ${sb(prefix)} || '%'`).join(' OR ') : 'FALSE'})
        OR (${fuzzyEnabled} AND EXISTS (SELECT 1 FROM discovery_search_aliases sa WHERE sa.entity_type='SERVICE' AND sa.entity_id=s.id AND sa.is_active=TRUE AND (sa.normalized_alias LIKE '%' || ${sb(normalizedQuery)} || '%' OR ${searchPrefixes.length ? searchPrefixes.map((prefix) => `sa.normalized_alias LIKE '%' || ${sb(prefix)} || '%'`).join(' OR ') : 'FALSE'})))
      )`);
      if(categoryId) sConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm JOIN discovery_business_categories c ON c.id=bcm.category_id WHERE bcm.business_id=b.id AND bcm.category_id=${sb(categoryId)} AND c.is_active=TRUE)`);
      if(city) sConditions.push(`lower(l.city)=lower(${sb(city)})`);
      if(district) sConditions.push(`lower(l.district)=lower(${sb(district)})`);
      if(region) sConditions.push(`lower(l.region)=lower(${sb(region)})`);
      if(distanceExpr) sConditions.push(`${distanceExpr} <= GREATEST(${sb(radius)}, COALESCE(l.service_radius_km,0)) AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
      const serviceRank=sQ?`(
        ts_rank_cd(to_tsvector('simple',coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.service_type,'') || ' ' || coalesce(s.service_area_text,'')),plainto_tsquery('simple',${sQ}))*${rankingWeights.text}
        + CASE WHEN lower(s.name)=lower(${sQ}) THEN ${rankingWeights.exact} WHEN lower(s.name) LIKE lower(${sQ}) || '%' THEN ${rankingWeights.prefix} ELSE 0 END
        + CASE WHEN b.verification_status='VERIFIED' THEN ${rankingWeights.verified} ELSE 0 END
      )`:`CASE WHEN b.verification_status='VERIFIED' THEN ${rankingWeights.verified} ELSE 0 END`;
      let serviceResults:any[]=[];
      let serviceCount = 0;
      if(type !== 'businesses' && type !== 'products'){
        const order=sort==='name_asc'?'s.name ASC,s.id ASC':`search_rank DESC,s.name ASC,s.id ASC`;
        const r=await db.query(`
          SELECT s.*,COUNT(*) OVER() AS total_count,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,
                 b.verification_status,l.city,l.district,l.region,l.service_radius_km,l.location_quality_status,l.location_source,
                 ${distanceExpr ? `${distanceExpr} AS distance_km,` : ''}${serviceRank} AS search_rank,
                 COALESCE((SELECT string_agg(sa.alias,' ' ORDER BY sa.alias) FROM discovery_search_aliases sa WHERE sa.entity_type='SERVICE' AND sa.entity_id=s.id AND sa.is_active=TRUE),'') AS search_aliases
          FROM discovery_services s
          JOIN discovery_businesses b ON b.id=s.business_id
            AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
          LEFT JOIN organizations o ON o.id=b.organization_id AND o.is_active=TRUE
          LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE AND l.is_primary=TRUE
          WHERE ${sConditions.join(' AND ')}
          ORDER BY ${sort === 'distance' && distanceExpr ? `${distanceExpr} ASC, s.name ASC, s.id ASC` : order}
          LIMIT ${sb(fuzzyCandidateLimit)} OFFSET ${fuzzyEnabled ? sb(0) : sb(offset)}
        `,serviceParams);
        serviceResults=r.rows;
        serviceCount = Number(r.rows[0]?.total_count || 0);
        if (fuzzyEnabled) {
          const ranked = serviceResults.map((row:any, index:number) => ({
            row,
            fuzzyScore: discoveryFuzzyScore(q, [row.name,row.service_type,row.description,row.service_area_text,row.search_aliases].filter(Boolean).join(' ')),
            index,
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * rankingWeights.fuzzy}))
            .sort((a:any,b:any) => b.combinedRank-a.combinedRank || b.fuzzyScore-a.fuzzyScore || String(a.row.name).localeCompare(String(b.row.name)) || a.index-b.index);
          serviceResults = ranked.slice(offset, offset + limit).map((x:any) => ({...x.row, fuzzy_score: Number(x.fuzzyScore.toFixed(4))}));
        }
      }

      const attachSearchAttribution = (rows: any[], entityType: 'BUSINESS' | 'PRODUCT' | 'SERVICE') => rows.map((row, index) => ({ ...row, searchId, resultPosition: offset + index + 1, attributionEntityType: entityType }));
      businessResults = attachSearchAttribution(businessResults, 'BUSINESS');
      productResults = attachSearchAttribution(productResults, 'PRODUCT');
      serviceResults = attachSearchAttribution(serviceResults, 'SERVICE');

      const analyticsMetadata = {
        queryHash: q ? createHash('sha256').update(q.normalize('NFKC').toLowerCase()).digest('hex') : null,
        queryLength: q.length,
        type,
        zeroResults: businessCount + productCount + serviceCount === 0,
        resultCounts: { businesses: businessCount, products: productCount, services: serviceCount },
        filters: { city, district, region, categoryId, openNow, radiusKm: radius, sort },
        searchId,
      };
      await db.query(
        `INSERT INTO discovery_analytics_events(id,event_type,session_hash,actor_user_id,search_id,metadata) VALUES($1,'SEARCH',$2,$3,$4,$5)`,
        [`evt_${randomUUID().replace(/-/g,'')}`, createHash('sha256').update(`${req.ip}|search|${req.headers['user-agent']||''}`).digest('hex'), req.auth?.userId || null, searchId, analyticsMetadata],
      );

      res.json({
        success:true,query:q,type,searchId,
        filters:{city,district,region,openNow,radiusKm:radius,categoryId,sort},
        data:{businesses:businessResults,products:productResults,services:serviceResults},
        counts:{
          businesses:businessCount,
          products:productCount,
          services:serviceCount
        }
      });
    }catch(err){next(err);}
  });


  // Public, idempotent attribution endpoint. Visibility and target ownership are checked server-side.
  router.post('/search/events', discoveryAttributionRateLimiter, async (req,res,next)=>{try{
    const input = Array.isArray(req.body?.events) ? req.body.events : [req.body];
    if (!input.length || input.length > 25) throw new Error('VALIDATION_ERROR:attribution batch must contain between 1 and 25 events.');
    const results:any[]=[];
    for (const event of input) {
      const eventType=String(event?.eventType||'').trim().toUpperCase();
      const searchId=String(event?.searchId||'').trim();
      const entityType=String(event?.entityType||'').trim().toUpperCase();
      const entityId=String(event?.entityId||'').trim();
      const eventId=String(event?.eventId||'').trim();
      const position=event?.resultPosition==null?null:Number(event.resultPosition);
      const source=String(event?.source||'search_results').trim().slice(0,32)||'search_results';
      if(!SEARCH_ATTRIBUTION_EVENTS.has(eventType)) throw new Error('VALIDATION_ERROR:unsupported search attribution event.');
      if(!/^search_[a-f0-9]{32}$/.test(searchId)) throw new Error('VALIDATION_ERROR:invalid searchId.');
      if(!['BUSINESS','PRODUCT','SERVICE'].includes(entityType)||!entityId) throw new Error('VALIDATION_ERROR:entityType and entityId are required.');
      if(!/^evt_[a-f0-9]{32}$/.test(eventId)) throw new Error('VALIDATION_ERROR:eventId must be a generated attribution id.');
      if(position!=null&&(!Number.isInteger(position)||position<1||position>10000)) throw new Error('VALIDATION_ERROR:resultPosition must be a positive integer.');
      const searchContext = await db.query("SELECT 1 FROM discovery_analytics_events WHERE search_id=$1 AND event_type='SEARCH' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' LIMIT 1", [searchId]);
      if(!searchContext.rows[0])return res.status(409).json({success:false,error:{code:'SEARCH_CONTEXT_EXPIRED',message:'The search context is no longer available for attribution.'}});
      let visible=false;
      if(entityType==='BUSINESS'){
        const r=await db.query("SELECT 1 FROM discovery_businesses b WHERE b.id=$1 AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE AND (b.organization_id IS NULL OR EXISTS (SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE))",[entityId]);
        visible=Boolean(r.rows[0]);
      }else if(entityType==='PRODUCT'){
        const r=await db.query("SELECT 1 FROM products p JOIN discovery_businesses b ON b.organization_id=p.organization_id WHERE p.id=$1 AND p.status='active' AND p.channels_ecommerce=TRUE AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE AND EXISTS (SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE)",[entityId]);
        visible=Boolean(r.rows[0]);
      }else{
        const r=await db.query("SELECT 1 FROM discovery_services s JOIN discovery_businesses b ON b.id=s.business_id WHERE s.id=$1 AND s.is_active=TRUE AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE AND (b.organization_id IS NULL OR EXISTS (SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE))",[entityId]);
        visible=Boolean(r.rows[0]);
      }
      if(!visible)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Search target is not publicly discoverable.'}});
      const metadata={searchId,resultPosition:position,entityType,entityId,attributionSource:source};
      const businessId=entityType==='BUSINESS'?entityId:null;
      const productId=entityType==='PRODUCT'?entityId:null;
      const serviceId=entityType==='SERVICE'?entityId:null;
      const insert=await db.query("INSERT INTO discovery_analytics_events(id,business_id,product_id,service_id,event_type,session_hash,actor_user_id,search_id,result_position,entity_type,entity_id,attribution_source,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING",[eventId,businessId,productId,serviceId,eventType,createHash('sha256').update(`${req.ip}|attribution|${req.headers['user-agent']||''}`).digest('hex'),req.auth?.userId||null,searchId,position,entityType,entityId,source,metadata]);
      results.push({eventId,recorded:insert.rowCount===1});
    }
    res.status(202).json({success:true,data:{accepted:results.length,results}});
  }catch(err){next(err);}});
  router.post('/businesses/:id/reviews/:reviewId/response', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id,'business.reviews.manage'))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Review response forbidden.'}});
    const text=String(req.body?.response||'').trim();
    if(!text||text.length>5000) throw new Error('VALIDATION_ERROR:response is required and must be at most 5000 characters.');
    const review=await db.query("SELECT id,status FROM discovery_reviews WHERE id=$1 AND business_id=$2",[req.params.reviewId,req.params.id]);
    if(!review.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Review not found.'}});
    if(review.rows[0].status!=='PUBLISHED') throw new Error('CONFLICT:Only published reviews can receive a merchant response.');
    const id=`rr_${randomUUID().replace(/-/g,'')}`;
    const r=await db.query(
      `INSERT INTO discovery_review_responses(id,review_id,business_id,responder_user_id,response)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT(review_id) DO UPDATE SET response=EXCLUDED.response,responder_user_id=EXCLUDED.responder_user_id,updated_at=CURRENT_TIMESTAMP
       RETURNING *`,
      [id,req.params.reviewId,req.params.id,req.auth!.userId,text],
    );
    await trustEvent(req.params.id,'REVIEW',req.params.reviewId,'MERCHANT_RESPONSE_UPDATED',req.auth!.userId,null,null,null,{});
    res.json({success:true,data:r.rows[0]});
  }catch(err){next(err);}});

  router.delete('/businesses/:id/reviews/:reviewId/response', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id,'business.reviews.manage'))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Review response deletion forbidden.'}});
    const r=await db.query('DELETE FROM discovery_review_responses WHERE review_id=$1 AND business_id=$2 RETURNING id',[req.params.reviewId,req.params.id]);
    if(!r.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Merchant response not found.'}});
    await trustEvent(req.params.id,'REVIEW',req.params.reviewId,'MERCHANT_RESPONSE_DELETED',req.auth!.userId,null,null,null,{});
    res.json({success:true,data:{deleted:true}});
  }catch(err){next(err);}});


  // ------------------------------------------------------------------
  // DISC-013: customer-to-business contact inquiries
  // ------------------------------------------------------------------
  router.post('/businesses/:id/contact-inquiries', async (req,res,next)=>{try{
    const business=await repo.findById(req.params.id);
    if(!business || business.listing_status!=='PUBLISHED' || !business.is_discoverable) {
      return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
    }
    if(business.organization_id){
      const org=await db.query('SELECT is_active FROM organizations WHERE id=$1',[business.organization_id]);
      if(!org.rows[0]?.is_active) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
    }
    const x=req.body||{};
    const customerName=String(x.customerName||'').trim();
    const message=String(x.message||'').trim();
    const subject=x.subject==null?'':String(x.subject).trim();
    const customerEmail=x.customerEmail==null?'':String(x.customerEmail).trim();
    const customerPhone=x.customerPhone==null?'':String(x.customerPhone).trim();
    if(!customerName||customerName.length>160) throw new Error('VALIDATION_ERROR:customerName is required and must be at most 160 characters.');
    if(!message||message.length>10000) throw new Error('VALIDATION_ERROR:message is required and must be at most 10000 characters.');
    if(subject.length>180) throw new Error('VALIDATION_ERROR:subject must be at most 180 characters.');
    if(customerEmail.length>320) throw new Error('VALIDATION_ERROR:customerEmail must be at most 320 characters.');
    if(customerPhone.length>64) throw new Error('VALIDATION_ERROR:customerPhone must be at most 64 characters.');
    if(req.auth?.userId){
      const recent=await db.query(
        `SELECT COUNT(*)::int AS count FROM discovery_contact_inquiries
         WHERE business_id=$1 AND customer_user_id=$2 AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
        [req.params.id,req.auth.userId],
      );
      if(Number(recent.rows[0]?.count||0)>=10) throw new Error('CONFLICT:Contact inquiry rate limit reached. Please try again later.');
    }
    const id=`inq_${randomUUID().replace(/-/g,'')}`;
    const r=await db.query(
      `INSERT INTO discovery_contact_inquiries(id,business_id,customer_user_id,customer_name,customer_email,customer_phone,subject,message)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,business_id,customer_name,subject,status,created_at`,
      [id,req.params.id,req.auth?.userId||null,customerName,customerEmail||null,customerPhone||null,subject||null,message],
    );
    void db.query(
      `INSERT INTO discovery_analytics_events(id,event_type,session_hash,actor_user_id,business_id,metadata)
       VALUES($1,'CONTACT',$2,$3,$4,$5)`,
      [`evt_${randomUUID().replace(/-/g,'')}`,createHash('sha256').update(`${req.ip}|contact|${req.headers['user-agent']||''}`).digest('hex'),req.auth?.userId||null,req.params.id,{channel:'INQUIRY'}],
    ).catch(()=>undefined);
    res.status(201).json({success:true,data:r.rows[0]});
  }catch(err){next(err);}});

  router.get('/businesses/:id/contact-inquiries', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Contact inquiry access forbidden.'}});
    const status=String(req.query.status||'');
    if(status && !['OPEN','READ','RESPONDED','CLOSED'].includes(status)) throw new Error('VALIDATION_ERROR:invalid contact inquiry status.');
    const r=await db.query(
      `SELECT id,business_id,customer_user_id,customer_name,customer_email,customer_phone,subject,message,status,merchant_note,responded_at,closed_at,created_at,updated_at
       FROM discovery_contact_inquiries
       WHERE business_id=$1 AND ($2='' OR status=$2)
       ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'READ' THEN 1 WHEN 'RESPONDED' THEN 2 ELSE 3 END, created_at DESC
       LIMIT 100`,
      [req.params.id,status],
    );
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.post('/businesses/:id/contact-inquiries/:inquiryId/decision', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Contact inquiry access forbidden.'}});
    const status=String(req.body?.status||'');
    if(!['READ','RESPONDED','CLOSED'].includes(status)) throw new Error('VALIDATION_ERROR:status must be READ, RESPONDED, or CLOSED.');
    const note=req.body?.merchantNote==null?'':String(req.body.merchantNote).trim();
    if(note.length>5000) throw new Error('VALIDATION_ERROR:merchantNote must be at most 5000 characters.');
    const data=await db.withTransaction(async(tx)=>{
      const current=await tx.query('SELECT * FROM discovery_contact_inquiries WHERE id=$1 AND business_id=$2 FOR UPDATE',[req.params.inquiryId,req.params.id]);
      if(!current.rows[0]) throw new Error('NOT_FOUND:Contact inquiry not found.');
      const updates:string[]=['status=$1','updated_at=CURRENT_TIMESTAMP'];
      const values:any[]=[status];
      if(note) { updates.push(`merchant_note=${values.length+1}`); values.push(note); }
      if(status==='RESPONDED') updates.push('responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP)');
      if(status==='CLOSED') updates.push('closed_at=COALESCE(closed_at,CURRENT_TIMESTAMP)');
      values.push(req.params.inquiryId,req.params.id);
      const idPos=values.length-1;
      const businessPos=values.length;
      const r=await tx.query(`UPDATE discovery_contact_inquiries SET ${updates.join(',')} WHERE id=${idPos} AND business_id=${businessPos} RETURNING *`,values);
      return r.rows[0];
    });
    res.json({success:true,data});
  }catch(err){next(err);}});

  router.get('/contact-inquiries', requireAuth(), async(req,res,next)=>{try{
    const status=String(req.query.status||'');
    if(status && !['OPEN','READ','RESPONDED','CLOSED'].includes(status)) throw new Error('VALIDATION_ERROR:invalid contact inquiry status.');
    const r=await db.query(
      `SELECT i.id,i.business_id,b.name AS business_name,i.customer_name,i.customer_email,i.customer_phone,
              i.subject,i.message,i.status,i.responded_at,i.closed_at,i.created_at,i.updated_at
       FROM discovery_contact_inquiries i
       JOIN discovery_businesses b ON b.id=i.business_id
       WHERE i.customer_user_id=$1 AND ($2='' OR i.status=$2)
       ORDER BY i.updated_at DESC,i.created_at DESC
       LIMIT 100`,
      [req.auth!.userId,status],
    );
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  // ------------------------------------------------------------------
  // DISC-010: services + request/quote marketplace
  // ------------------------------------------------------------------
  router.get('/businesses/:id/services', async (req,res,next)=>{try{const r=await db.query(`SELECT * FROM discovery_services WHERE business_id=$1 AND is_active=TRUE ORDER BY name`,[req.params.id]);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/businesses/:id/services', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.services.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service management forbidden.'}});const x=req.body||{};if(!String(x.name||'').trim())throw new Error('VALIDATION_ERROR:name is required.');if(x.bookingMode&&!SERVICE_BOOKING_MODES.has(x.bookingMode))throw new Error('VALIDATION_ERROR:invalid bookingMode.');const slug=String(x.slug||x.name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180)||`service-${randomUUID().slice(0,8)}`;const r=await db.query(`INSERT INTO discovery_services(id,business_id,name,slug,description,service_type,price_from,price_to,currency,duration_minutes,service_area_text,booking_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[`svc_${randomUUID().replace(/-/g,'')}`,req.params.id,String(x.name).trim(),slug,x.description||null,x.serviceType||null,x.priceFrom??null,x.priceTo??null,x.currency||'SLE',x.durationMinutes??null,x.serviceAreaText||null,x.bookingMode||'REQUEST']);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});
  router.patch('/businesses/:id/services/:serviceId', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.services.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service management forbidden.'}});const x=req.body||{};const allowed:Record<string,string>={name:'name',description:'description',serviceType:'service_type',priceFrom:'price_from',priceTo:'price_to',currency:'currency',durationMinutes:'duration_minutes',serviceAreaText:'service_area_text',bookingMode:'booking_mode',isActive:'is_active'};const entries=Object.entries(x).filter(([k])=>allowed[k]);if(!entries.length)return res.status(422).json({success:false,error:{code:'VALIDATION_ERROR',message:'No editable service fields supplied.'}});const vals=entries.map(([,v])=>v);const set=entries.map(([k],i)=>`${allowed[k]}=$${i+1}`).join(',');vals.push(req.params.id,req.params.serviceId);const r=await db.query(`UPDATE discovery_services SET ${set},updated_at=CURRENT_TIMESTAMP WHERE business_id=$${vals.length-1} AND id=$${vals.length} RETURNING *`,vals);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  // ------------------------------------------------------------------
  // DISC-010: service-request lifecycle
  // ------------------------------------------------------------------
  const REQUEST_TRANSITIONS: Record<string, string[]> = {
    OPEN: ['MATCHED', 'CANCELLED', 'CLOSED'],
    MATCHED: ['QUOTED', 'CANCELLED', 'CLOSED'],
    QUOTED: ['ACCEPTED', 'CANCELLED', 'CLOSED'],
    ACCEPTED: ['CLOSED'],
    CANCELLED: [],
    CLOSED: [],
  };

  const transitionRequest = async (requestId: string, toStatus: string, actorUserId: string, note?: string | null) => {
    return db.withTransaction(async (tx) => {
      const current = await tx.query('SELECT * FROM discovery_service_requests WHERE id=$1 FOR UPDATE', [requestId]);
      if (!current.rows[0]) throw new Error('NOT_FOUND:Service request not found.');
      const fromStatus = String(current.rows[0].status);
      if (!(REQUEST_TRANSITIONS[fromStatus] || []).includes(toStatus)) {
        throw new Error(`INVALID_STATE_TRANSITION:Cannot move service request from ${fromStatus} to ${toStatus}.`);
      }
      const updated = await tx.query(
        `UPDATE discovery_service_requests SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,
        [toStatus, requestId],
      );
      await tx.query(
        `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [`req_evt_${randomUUID().replace(/-/g,'')}`, requestId, fromStatus, toStatus, actorUserId, note || null],
      );
      return updated.rows[0];
    });
  };

  router.post('/service-requests', requireAuth(), async(req,res,next)=>{try{
    const x=req.body||{};
    const customerName=String(x.customerName||'').trim();
    const description=String(x.description||'').trim();
    if(!customerName||!description)throw new Error('VALIDATION_ERROR:customerName and description are required.');
    if(description.length>5000)throw new Error('VALIDATION_ERROR:description exceeds 5000 characters.');
    if((x.latitude==null)!==(x.longitude==null))throw new Error('VALIDATION_ERROR:latitude and longitude must be supplied together.');
    const lat=x.latitude==null?null:Number(x.latitude);
    const lng=x.longitude==null?null:Number(x.longitude);
    if(lat!=null&&(!Number.isFinite(lat)||lat<-90||lat>90))throw new Error('VALIDATION_ERROR:latitude must be between -90 and 90.');
    if(lng!=null&&(!Number.isFinite(lng)||lng<-180||lng>180))throw new Error('VALIDATION_ERROR:longitude must be between -180 and 180.');
    if(x.budgetFrom!=null&&(!Number.isFinite(Number(x.budgetFrom))||Number(x.budgetFrom)<0))throw new Error('VALIDATION_ERROR:budgetFrom must be a non-negative number.');
    if(x.budgetTo!=null&&(!Number.isFinite(Number(x.budgetTo))||Number(x.budgetTo)<0))throw new Error('VALIDATION_ERROR:budgetTo must be a non-negative number.');
    if(x.budgetFrom!=null&&x.budgetTo!=null&&Number(x.budgetTo)<Number(x.budgetFrom))throw new Error('VALIDATION_ERROR:budgetTo must be greater than or equal to budgetFrom.');

    const requestedServiceId=x.serviceId?String(x.serviceId).trim():null;
    let requestedServiceType=x.serviceType?String(x.serviceType).trim().slice(0,128):null;
    if(requestedServiceId){
      const requested=await db.query(
        `SELECT s.id,s.service_type,s.name,s.description,b.id AS business_id
           FROM discovery_services s
           JOIN discovery_businesses b ON b.id=s.business_id
          WHERE s.id=$1 AND s.is_active=TRUE
            AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
            AND (b.organization_id IS NULL OR EXISTS(SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE))`,
        [requestedServiceId],
      );
      if(!requested.rows[0])throw new Error('NOT_FOUND:Selected discovery service is no longer available.');
      requestedServiceType=requestedServiceType||requested.rows[0].service_type||requested.rows[0].name||null;
    }

    const requestId=`req_${randomUUID().replace(/-/g,'')}`;
    const data=await db.withTransaction(async(tx)=>{
      const r=await tx.query(
        `INSERT INTO discovery_service_requests(id,customer_user_id,customer_name,customer_phone,customer_email,description,city,district,region,latitude,longitude,preferred_date,budget_from,budget_to,requested_service_id,service_type)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [requestId,req.auth!.userId,customerName,x.customerPhone||null,x.customerEmail||null,description,x.city||null,x.district||null,x.region||null,lat,lng,x.preferredDate||null,x.budgetFrom??null,x.budgetTo??null,requestedServiceId,requestedServiceType],
      );
      await tx.query(
        `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
         VALUES($1,$2,NULL,'OPEN',$3,$4)`,
        [`req_evt_${randomUUID().replace(/-/g,'')}`,requestId,req.auth!.userId,'Request created.'],
      );

      const candidateRows=await tx.query(
        `SELECT s.id AS service_id,s.business_id,s.name AS service_name,s.description AS service_description,s.service_type,
                s.price_from,s.price_to,b.name AS business_name,
                l.latitude,l.longitude,l.city AS location_city,l.district AS location_district,l.region AS location_region,
                l.location_type,l.service_radius_km
           FROM discovery_services s
           JOIN discovery_businesses b ON b.id=s.business_id
           LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE
          WHERE s.is_active=TRUE
            AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
            AND (b.organization_id IS NULL OR EXISTS(SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE))
          LIMIT 300`,
        [requestedServiceId],
      );

      const ranked=rankDiscoveryServiceMatches(
        {
          description,
          serviceType: requestedServiceType,
          requestedServiceId,
          city: x.city||null,
          district: x.district||null,
          region: x.region||null,
          latitude: lat,
          longitude: lng,
          budgetFrom: x.budgetFrom==null?null:Number(x.budgetFrom),
          budgetTo: x.budgetTo==null?null:Number(x.budgetTo),
        },
        candidateRows.rows.map((row:any) => ({
          serviceId: String(row.service_id),
          businessId: String(row.business_id),
          serviceName: row.service_name,
          serviceDescription: row.service_description,
          serviceType: row.service_type,
          priceFrom: row.price_from,
          priceTo: row.price_to,
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.location_city,
          district: row.location_district,
          region: row.location_region,
          locationType: row.location_type,
          serviceRadiusKm: row.service_radius_km,
        })),
      );
      for(const match of ranked){
        await tx.query(
          `INSERT INTO discovery_service_request_matches(request_id,business_id,match_score,match_reason)
           VALUES($1,$2,$3,$4) ON CONFLICT(request_id,business_id) DO NOTHING`,
          [requestId,match.businessId,match.score,match.reason],
        );
      }

      if(ranked.length>0){
        await tx.query(`UPDATE discovery_service_requests SET status='MATCHED',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[requestId]);
        await tx.query(
          `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
           VALUES($1,$2,'OPEN','MATCHED',$3,$4)`,
          [`req_evt_${randomUUID().replace(/-/g,'')}`,requestId,req.auth!.userId,`${ranked.length} relevant provider match(es) found.`],
        );
        r.rows[0].status='MATCHED';
      }
      return r.rows[0];
    });
    res.status(201).json({success:true,data});
  }catch(err){next(err);} });

  router.get('/service-requests', requireAuth(), async(req,res,next)=>{try{
    const status=String(req.query.status||'');
    const r=await db.query(
      `SELECT id,customer_name,customer_phone,customer_email,description,city,district,region,preferred_date,budget_from,budget_to,status,created_at,updated_at
       FROM discovery_service_requests
       WHERE customer_user_id=$1 AND ($2='' OR status=$2)
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 100`,
      [req.auth!.userId,status],
    );
    res.json({success:true,data:r.rows});
  }catch(err){next(err);} });

  router.get('/service-requests/:id', requireAuth(), async(req,res,next)=>{try{
    const r=await db.query(
      `SELECT r.*,COALESCE(json_agg(json_build_object('businessId',m.business_id,'businessName',b.name,'score',m.match_score,'reason',m.match_reason))
        FILTER(WHERE m.business_id IS NOT NULL),'[]'::json) AS matches
       FROM discovery_service_requests r
       LEFT JOIN discovery_service_request_matches m ON m.request_id=r.id
       LEFT JOIN discovery_businesses b ON b.id=m.business_id
       WHERE r.id=$1 AND r.customer_user_id=$2
       GROUP BY r.id`,
      [req.params.id,req.auth!.userId],
    );
    if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service request not found.'}});
    const quotes=await db.query(
      `SELECT q.*,b.name AS business_name,s.name AS service_name
       FROM discovery_service_quotes q JOIN discovery_businesses b ON b.id=q.business_id
       LEFT JOIN discovery_services s ON s.id=q.service_id
       WHERE q.request_id=$1 ORDER BY q.created_at DESC`,
      [req.params.id],
    );
    const events=await db.query(
      `SELECT id,from_status,to_status,actor_user_id,note,created_at
       FROM discovery_service_request_events WHERE request_id=$1 ORDER BY created_at ASC`,
      [req.params.id],
    );
    res.json({success:true,data:{...r.rows[0],quotes:quotes.rows,events:events.rows}});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/cancel', requireAuth(), async(req,res,next)=>{try{
    const current=await db.query('SELECT * FROM discovery_service_requests WHERE id=$1 AND customer_user_id=$2',[req.params.id,req.auth!.userId]);
    if(!current.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service request not found.'}});
    const data=await transitionRequest(req.params.id,'CANCELLED',req.auth!.userId,req.body?.reason||'Cancelled by customer.');
    res.json({success:true,data});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/close', requireAuth(), async(req,res,next)=>{try{
    const current=await db.query('SELECT * FROM discovery_service_requests WHERE id=$1',[req.params.id]);
    if(!current.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service request not found.'}});
    const isCustomer=current.rows[0].customer_user_id===req.auth!.userId;
    let isProvider=false;
    if(!isCustomer&&req.body?.businessId){
      const ownedMatch=await db.query(
        `SELECT 1 FROM discovery_service_request_matches m
         WHERE m.request_id=$1 AND m.business_id=$2`,
        [req.params.id,String(req.body.businessId)],
      );
      isProvider=ownedMatch.rows.length>0 && await owned(req,String(req.body.businessId));
    }
    if(!isCustomer&&!isProvider&&req.auth!.role!=='super_admin')throw new Error('PERMISSION_DENIED:Only the customer, matched provider, or platform administrator may close the request.');
    const data=await transitionRequest(req.params.id,'CLOSED',req.auth!.userId,req.body?.reason||'Request closed.');
    res.json({success:true,data});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/match', requireAuth(), async(req,res,next)=>{try{
    const businessId=String(req.body?.businessId||'');
    if(!businessId)throw new Error('VALIDATION_ERROR:businessId is required.');
    const b=await repo.findById(businessId);
    if(!b||!(await owned(req,businessId)))throw new Error('TENANT_ACCESS_DENIED:Only the business owner may match a service request.');
    const service=await db.query('SELECT 1 FROM discovery_services WHERE business_id=$1 AND is_active=TRUE LIMIT 1',[businessId]);
    if(!service.rows[0])throw new Error('VALIDATION_ERROR:Business must have an active discovery service.');
    const data=await db.withTransaction(async(tx)=>{
      const request=await tx.query('SELECT * FROM discovery_service_requests WHERE id=$1 FOR UPDATE',[req.params.id]);
      if(!request.rows[0])throw new Error('NOT_FOUND:Service request not found.');
      if(!['OPEN','MATCHED'].includes(request.rows[0].status))throw new Error('INVALID_STATE_TRANSITION:Only OPEN or MATCHED requests may be matched.');
      await tx.query('INSERT INTO discovery_service_request_matches(request_id,business_id,match_score) VALUES($1,$2,$3) ON CONFLICT(request_id,business_id) DO NOTHING',[req.params.id,businessId,Number(req.body?.matchScore??1)]);
      if(request.rows[0].status==='OPEN'){
        await tx.query('UPDATE discovery_service_requests SET status=\'MATCHED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id]);
        await tx.query(
          `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
           VALUES($1,$2,'OPEN','MATCHED',$3,$4)`,
          [`req_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,'Business matched to request.'],
        );
      }
      return request.rows[0].status==='OPEN'
        ? {...request.rows[0],status:'MATCHED'}
        : request.rows[0];
    });
    res.json({success:true,data});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/quotes', requireAuth(), async(req,res,next)=>{try{
    const x=req.body||{};
    const businessId=String(x.businessId||'');
    if(!businessId||x.amount==null)throw new Error('VALIDATION_ERROR:businessId and amount are required.');
    const b=await repo.findById(businessId);
    if(!b||!(await owned(req,businessId)))throw new Error('TENANT_ACCESS_DENIED:Only the business owner may quote.');
    const serviceId=x.serviceId?String(x.serviceId):null;
    const amount=Number(x.amount);
    if(!Number.isFinite(amount)||amount<0)throw new Error('VALIDATION_ERROR:amount must be a non-negative number.');
    if(serviceId){
      const s=await db.query('SELECT 1 FROM discovery_services WHERE id=$1 AND business_id=$2 AND is_active=TRUE',[serviceId,businessId]);
      if(!s.rows[0])throw new Error('NOT_FOUND:Service does not belong to the quoting business.');
    }
    const quoteId=`quote_${randomUUID().replace(/-/g,'')}`;
    const result=await db.withTransaction(async(tx)=>{
      const request=await tx.query('SELECT * FROM discovery_service_requests WHERE id=$1 FOR UPDATE',[req.params.id]);
      if(!request.rows[0])throw new Error('NOT_FOUND:Service request not found.');
      if(!['OPEN','MATCHED','QUOTED'].includes(request.rows[0].status))throw new Error('INVALID_STATE_TRANSITION:This request cannot receive a quote.');
      const r=await tx.query(
        `INSERT INTO discovery_service_quotes(id,request_id,business_id,service_id,amount,currency,message,estimated_duration_minutes,valid_until)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [quoteId,req.params.id,businessId,serviceId,amount,x.currency||'SLE',x.message||null,x.estimatedDurationMinutes||null,x.validUntil||null],
      );
      await tx.query('INSERT INTO discovery_service_request_matches(request_id,business_id,match_score) VALUES($1,$2,1) ON CONFLICT(request_id,business_id) DO NOTHING',[req.params.id,businessId]);
      if(request.rows[0].status==='OPEN'||request.rows[0].status==='MATCHED'){
        await tx.query('UPDATE discovery_service_requests SET status=\'QUOTED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id]);
        await tx.query(
          `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
           VALUES($1,$2,$3,'QUOTED',$4,$5)`,
          [`req_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,request.rows[0].status,req.auth!.userId,'Quote submitted.'],
        );
      }
      return r.rows[0];
    });
    res.status(201).json({success:true,data:result});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/quotes/:quoteId/accept', requireAuth(), async(req,res,next)=>{try{
    const result=await db.withTransaction(async(tx)=>{
      const request=await tx.query('SELECT * FROM discovery_service_requests WHERE id=$1 AND customer_user_id=$2 FOR UPDATE',[req.params.id,req.auth!.userId]);
      if(!request.rows[0])throw new Error('NOT_FOUND:Service request not found.');
      if(request.rows[0].status!=='QUOTED')throw new Error('INVALID_STATE_TRANSITION:Only QUOTED requests can accept a quote.');
      const quote=await tx.query(
        `SELECT q.*,b.name AS business_name FROM discovery_service_quotes q
         JOIN discovery_businesses b ON b.id=q.business_id
         WHERE q.id=$1 AND q.request_id=$2 FOR UPDATE`,
        [req.params.quoteId,req.params.id],
      );
      if(!quote.rows[0])throw new Error('NOT_FOUND:Quote not found.');
      if(quote.rows[0].status!=='SUBMITTED')throw new Error('INVALID_STATE_TRANSITION:Quote is no longer available.');
      if(quote.rows[0].valid_until && new Date(String(quote.rows[0].valid_until)) < new Date())throw new Error('CONFLICT:Quote has expired.');
      await tx.query('UPDATE discovery_service_quotes SET status=\'ACCEPTED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.quoteId]);
      await tx.query('UPDATE discovery_service_quotes SET status=\'DECLINED\',updated_at=CURRENT_TIMESTAMP WHERE request_id=$1 AND id<>$2 AND status=\'SUBMITTED\'',[req.params.id,req.params.quoteId]);
      await tx.query('UPDATE discovery_service_requests SET status=\'ACCEPTED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id]);
      await tx.query(
        `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
         VALUES($1,$2,'QUOTED','ACCEPTED',$3,$4)`,
        [`req_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,'Quote accepted by customer.'],
      );
      return {request:{...request.rows[0],status:'ACCEPTED'},quote:{...quote.rows[0],status:'ACCEPTED'}};
    });
    res.json({success:true,data:result.request,quote:result.quote});
  }catch(err){next(err);} });

  router.post('/service-requests/:id/quotes/:quoteId/decline', requireAuth(), async(req,res,next)=>{try{
    const result=await db.withTransaction(async(tx)=>{
      const request=await tx.query('SELECT * FROM discovery_service_requests WHERE id=$1 AND customer_user_id=$2 FOR UPDATE',[req.params.id,req.auth!.userId]);
      if(!request.rows[0])throw new Error('NOT_FOUND:Service request not found.');
      const quote=await tx.query('SELECT * FROM discovery_service_quotes WHERE id=$1 AND request_id=$2 FOR UPDATE',[req.params.quoteId,req.params.id]);
      if(!quote.rows[0])throw new Error('NOT_FOUND:Quote not found.');
      if(quote.rows[0].status!=='SUBMITTED')throw new Error('INVALID_STATE_TRANSITION:Quote is no longer available.');
      await tx.query('UPDATE discovery_service_quotes SET status=\'DECLINED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.quoteId]);
      const remaining=await tx.query("SELECT 1 FROM discovery_service_quotes WHERE request_id=$1 AND status='SUBMITTED' LIMIT 1",[req.params.id]);
      if(!remaining.rows[0]&&request.rows[0].status==='QUOTED'){
        await tx.query('UPDATE discovery_service_requests SET status=\'MATCHED\',updated_at=CURRENT_TIMESTAMP WHERE id=$1',[req.params.id]);
        await tx.query(
          `INSERT INTO discovery_service_request_events(id,request_id,from_status,to_status,actor_user_id,note)
           VALUES($1,$2,'QUOTED','MATCHED',$3,$4)`,
          [`req_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,'All submitted quotes declined; request returned to matched.'],
        );
      }
      return {id:req.params.quoteId,status:'DECLINED'};
    });
    res.json({success:true,data:result});
  }catch(err){next(err);} });

  router.get('/businesses/:id/service-requests', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service request access forbidden.'}});
    const status=String(req.query.status||'');
    const r=await db.query(
      `SELECT DISTINCT r.*,m.match_score
       FROM discovery_service_requests r
       JOIN discovery_service_request_matches m ON m.request_id=r.id AND m.business_id=$1
       WHERE ($2='' OR r.status=$2)
       ORDER BY r.created_at DESC LIMIT 100`,
      [req.params.id,status],
    );
    res.json({success:true,data:r.rows});
  }catch(err){next(err);} });

  // ------------------------------------------------------------------
  // DISC-012: verification, claims, reviews and abuse reports
  // ------------------------------------------------------------------
  router.post('/businesses/:id/claims', requireAuth(), async(req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});
    if(b.listing_status==='ARCHIVED')throw new Error('CONFLICT:Archived businesses cannot be claimed.');
    const evidence=req.body?.evidence??{};
    if(evidence===null||typeof evidence!=='object'||Array.isArray(evidence))throw new Error('VALIDATION_ERROR:evidence must be an object.');
    if(Buffer.byteLength(JSON.stringify(evidence),'utf8')>16384)throw new Error('VALIDATION_ERROR:evidence exceeds 16384 bytes.');
    const r=await db.query(`INSERT INTO discovery_business_claims(id,business_id,claimant_user_id,claimant_name,claimant_email,evidence) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[`claim_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,String(req.body?.claimantName||req.auth!.email||req.auth!.userId),req.body?.claimantEmail||req.auth!.email||null,evidence]);
    await trustEvent(req.params.id,'CLAIM',r.rows[0].id,'CLAIM_SUBMITTED',req.auth!.userId,null,'PENDING',null,{});
    res.status(201).json({success:true,data:r.rows[0]});
  }catch(err){next(err);}});

  router.post('/businesses/:id/reviews', requireAuth(), async(req,res,next)=>{try{const rating=Number(req.body?.rating);if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error('VALIDATION_ERROR:rating must be an integer from 1 to 5.');const b=await repo.findById(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});let verified=false;const orderId=req.body?.orderId?String(req.body.orderId):null;if(orderId&&b.organization_id){const o=await db.query(`SELECT o.id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1 AND o.organization_id=$2 AND c.organization_id=$2 AND c.auth_user_id=$3 AND o.status IN ('Delivered','Completed')`,[orderId,b.organization_id,req.auth!.userId]);verified=o.rows.length>0;}const r=await db.query(`INSERT INTO discovery_reviews(id,business_id,reviewer_user_id,reviewer_name,rating,title,body,order_id,verified_purchase,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING') RETURNING *`,[`rev_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,String(req.body?.reviewerName||req.auth!.email||req.auth!.userId),rating,req.body?.title||null,req.body?.body||null,verified?orderId:null,verified]);await trustEvent(req.params.id,'REVIEW',r.rows[0].id,'REVIEW_SUBMITTED',req.auth!.userId,null,'PENDING',null,{verifiedPurchase:verified});res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/businesses/:id/reviews', async(req,res,next)=>{try{const b=await businessService.getPublicProfile(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});if(!b.settings.allow_reviews)return res.json({success:true,summary:{rating:'0.00',count:0},data:[]});const r=await db.query(`SELECT r.id,r.reviewer_name,r.rating,r.title,r.body,r.verified_purchase,r.created_at,rr.response AS merchant_response,rr.created_at AS merchant_response_created_at FROM discovery_reviews r LEFT JOIN discovery_review_responses rr ON rr.review_id=r.id WHERE business_id=$1 AND status='PUBLISHED' ORDER BY verified_purchase DESC,created_at DESC LIMIT 100`,[req.params.id]);const s=await db.query(`SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS rating,COUNT(*)::int AS count FROM discovery_reviews r WHERE r.business_id=$1 AND r.status='PUBLISHED'`,[req.params.id]);res.json({success:true,summary:s.rows[0],data:r.rows});}catch(err){next(err);}});

  router.post('/reports', async(req,res,next)=>{try{if(!req.body?.businessId&&!req.body?.serviceId)throw new Error('VALIDATION_ERROR:businessId or serviceId is required.');if(!String(req.body?.reasonCode||'').trim())throw new Error('VALIDATION_ERROR:reasonCode is required.');const r=await db.query(`INSERT INTO discovery_reports(id,business_id,service_id,reporter_user_id,reason_code,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at`,[`report_${randomUUID().replace(/-/g,'')}`,req.body.businessId||null,req.body.serviceId||null,req.auth?.userId||null,String(req.body.reasonCode).trim(),req.body.description||null]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/categories', async(req,res,next)=>{try{const r=await db.query(`SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.icon_name,c.display_order,COUNT(DISTINCT bcm.business_id) FILTER (WHERE b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE) AS item_count FROM discovery_business_categories c LEFT JOIN discovery_business_category_map bcm ON bcm.category_id=c.id LEFT JOIN discovery_businesses b ON b.id=bcm.business_id WHERE c.is_active=TRUE GROUP BY c.id ORDER BY c.display_order,c.name`);res.json({success:true,data:r.rows.map((x:any)=>({...x,item_count:Number(x.item_count||0)}))});}catch(err){next(err);}});
  router.put('/businesses/:id/categories', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Category management forbidden.'}});
    const business = await repo.findById(req.params.id);
    if(!business)throw new Error('NOT_FOUND:Discovery business not found.');
    const ids=Array.isArray(req.body?.categoryIds)?Array.from(new Set(req.body.categoryIds.map(String).map((x:string)=>x.trim()).filter(Boolean))):[];
    if(ids.length>20)throw new Error('VALIDATION_ERROR:categoryIds cannot contain more than 20 categories.');
    if(!ids.length && business.listing_status!=='DRAFT')throw new Error('VALIDATION_ERROR:at least one category is required after draft stage.');
    if(ids.length){
      const placeholders=ids.map((_,i)=>`${i+1}`).join(',');
      const activeCats=await db.query(`SELECT id FROM discovery_business_categories WHERE is_active=TRUE AND id IN (${placeholders})`,ids);
      if(activeCats.rows.length!==ids.length)throw new Error('VALIDATION_ERROR:categoryIds may reference active categories only.');
    }
    await db.query('BEGIN');
    try{
      await db.query('DELETE FROM discovery_business_category_map WHERE business_id=$1',[req.params.id]);
      for(let i=0;i<ids.length;i++)await db.query('INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES($1,$2,$3)',[req.params.id,ids[i],i===0]);
      await db.query('COMMIT');
    }catch(e){
      await db.query('ROLLBACK');
      throw e;
    }
    res.json({success:true,data:await repo.listCategories(req.params.id)});
  }catch(err){next(err);}});

  // ------------------------------------------------------------------
  // DISC-014: analytics + moderation endpoints
  // ------------------------------------------------------------------
  router.post('/analytics/events', async(req,res,next)=>{try{
    const type=String(req.body?.eventType||'');
    if(!ANALYTICS_EVENTS.has(type))throw new Error('VALIDATION_ERROR:Unsupported analytics event.');
    const businessId=req.body?.businessId?String(req.body.businessId):null;
    const productId=req.body?.productId?String(req.body.productId):null;
    const serviceId=req.body?.serviceId?String(req.body.serviceId):null;
    const metadata=req.body?.metadata??{};
    if(metadata===null||typeof metadata!=='object'||Array.isArray(metadata))throw new Error('VALIDATION_ERROR:metadata must be an object.');
    if(Buffer.byteLength(JSON.stringify(metadata),'utf8')>8192)throw new Error('VALIDATION_ERROR:metadata exceeds 8192 bytes.');
    if(type!=='SEARCH'&&!businessId)throw new Error('VALIDATION_ERROR:businessId is required for this analytics event.');
    if(businessId&&!(await businessService.getPublicProfile(businessId)))throw new Error('NOT_FOUND:Discovery business not found.');
    if(serviceId){
      const s=await db.query(`SELECT s.id FROM discovery_services s JOIN discovery_businesses b ON b.id=s.business_id WHERE s.id=$1 AND s.is_active=TRUE AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE AND (b.organization_id IS NULL OR EXISTS(SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE))`,[serviceId]);
      if(!s.rows[0])throw new Error('NOT_FOUND:Discovery service not found.');
      if(businessId){const belongs=await db.query('SELECT 1 FROM discovery_services WHERE id=$1 AND business_id=$2',[serviceId,businessId]);if(!belongs.rows[0])throw new Error('VALIDATION_ERROR:serviceId does not belong to businessId.');}
    }
    if((type==='SERVICE_VIEW'||type==='SERVICE_REQUEST')&&!serviceId)throw new Error('VALIDATION_ERROR:serviceId is required for this analytics event.');
    if(type==='PRODUCT_VIEW'&&!productId)throw new Error('VALIDATION_ERROR:productId is required for PRODUCT_VIEW.');
    const raw=`${req.ip}|${req.headers['user-agent']||''}`;
    const sessionHash=createHash('sha256').update(raw).digest('hex');
    await db.query(`INSERT INTO discovery_analytics_events(id,business_id,product_id,service_id,event_type,session_hash,actor_user_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[`evt_${randomUUID().replace(/-/g,'')}`,businessId,productId,serviceId,type,sessionHash,req.auth?.userId||null,metadata]);
    res.status(202).json({success:true});
  }catch(err){next(err);}});
  
  router.get('/businesses/:id/service-requests', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service request access forbidden.'}});
    const status=String(req.query.status||'');
    const r=await db.query("SELECT DISTINCT r.* FROM discovery_service_requests r LEFT JOIN discovery_service_request_matches m ON m.request_id=r.id AND m.business_id=$1 LEFT JOIN discovery_business_locations l ON l.business_id=$1 AND l.is_primary=TRUE AND l.is_active=TRUE WHERE (m.business_id=$1 OR (m.business_id IS NULL AND r.status IN ('OPEN','MATCHED') AND r.city IS NOT NULL AND l.city IS NOT NULL AND lower(r.city)=lower(l.city) AND EXISTS (SELECT 1 FROM discovery_services s WHERE s.business_id=$1 AND s.is_active=TRUE))) AND ($2='' OR r.status=$2) ORDER BY r.created_at DESC LIMIT 100",[req.params.id,status]);
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.get('/businesses/:id/analytics', requireAuth(), async(req,res,next)=>{try{
    if(!(await owned(req,req.params.id,'business.analytics.view')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Analytics access forbidden.'}});
    const days=Math.min(Math.max(Number(req.query.days||30),1),365);
    const r=await db.query("SELECT event_type,COUNT(*)::int AS count,COUNT(DISTINCT session_hash)::int AS unique_sessions FROM discovery_analytics_events WHERE business_id=$1 AND created_at>=CURRENT_TIMESTAMP-($2||' days')::interval GROUP BY event_type ORDER BY count DESC",[req.params.id,String(days)]);
    const counts:Record<string,number>={}; for(const row of r.rows) counts[String(row.event_type)]=Number(row.count)||0;
    const impressions=counts.IMPRESSION||0; const views=counts.VIEW||0; const conversions=(counts.CONTACT||0)+(counts.DIRECTION_CLICK||0)+(counts.SERVICE_REQUEST||0)+(counts.STORE_CLICK||0);
    const summary={business_id:req.params.id,timeframe:String(days)+'d',impressions,profile_views:views,phone_clicks:counts.CONTACT||0,whatsapp_clicks:0,direction_clicks:counts.DIRECTION_CLICK||0,website_clicks:0,service_inquiries:counts.SERVICE_REQUEST||0,store_visits:counts.STORE_CLICK||0,conversion_rate:views>0?conversions/views:0};
    res.json({success:true,periodDays:days,data:summary,events:r.rows});
  }catch(err){next(err);}});

  router.get('/businesses/:id/verification', requireAuth(), async(req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});
    const canManage=await owned(req,req.params.id);
    if(!canManage && req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Verification access forbidden.'}});
    const applications=await db.query(`SELECT * FROM discovery_verification_applications WHERE business_id=$1 ORDER BY created_at DESC LIMIT 20`,[req.params.id]);
    res.json({success:true,data:{businessId:req.params.id,verificationStatus:b.verification_status,applications:applications.rows}});
  }catch(err){next(err);}});

  router.get('/businesses/:id/trust', requireAuth(), async(req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});
    if(!(await owned(req,req.params.id)) && req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Trust center access forbidden.'}});

    const [applications, claims, reviewSummary, reports, events] = await Promise.all([
      db.query(
        `SELECT id,business_id,status,created_at,updated_at,reviewed_at,review_reason
         FROM discovery_verification_applications
         WHERE business_id=$1
         ORDER BY created_at DESC LIMIT 20`,
        [req.params.id],
      ),
      db.query(
        `SELECT id,status,created_at,reviewed_at,review_reason,
                CASE WHEN claimant_user_id=$2 THEN TRUE ELSE FALSE END AS submitted_by_current_user
         FROM discovery_business_claims
         WHERE business_id=$1
         ORDER BY created_at DESC LIMIT 20`,
        [req.params.id, req.auth!.userId],
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status='PUBLISHED')::int AS published_count,
           COUNT(*) FILTER (WHERE status='PENDING')::int AS pending_count,
           COUNT(*) FILTER (WHERE status='REJECTED')::int AS rejected_count,
           COUNT(*) FILTER (WHERE status='HIDDEN')::int AS hidden_count,
           COALESCE(ROUND(AVG(rating) FILTER (WHERE status='PUBLISHED'),2),0) AS published_rating
         FROM discovery_reviews WHERE business_id=$1`,
        [req.params.id],
      ),
      db.query(
        `SELECT id,reason_code,status,resolution_note,created_at,resolved_at,
                CASE WHEN service_id IS NULL THEN 'BUSINESS' ELSE 'SERVICE' END AS target_type
         FROM discovery_reports
         WHERE business_id=$1
         ORDER BY created_at DESC LIMIT 50`,
        [req.params.id],
      ),
      db.query(
        `SELECT id,entity_type,event_type,from_status,to_status,reason,created_at
         FROM discovery_trust_events
         WHERE business_id=$1
         ORDER BY created_at DESC LIMIT 100`,
        [req.params.id],
      ),
    ]);

    const verificationStatus=String(b.verification_status);
    const requiredActions:string[]=[];
    if(verificationStatus==='UNVERIFIED') requiredActions.push('Submit verification evidence.');
    if(verificationStatus==='REJECTED') requiredActions.push('Review the rejection reason and resubmit verification evidence.');
    if(verificationStatus==='SUSPENDED') requiredActions.push('Contact platform support regarding the suspended verification status.');
    if(verificationStatus==='PENDING') requiredActions.push('Wait for platform verification review.');

    res.json({success:true,data:{
      businessId:req.params.id,
      businessName:b.name,
      verificationStatus,
      listingStatus:b.listing_status,
      businessMode:b.business_mode,
      trustCenter:{
        verification:{status:verificationStatus,applications:applications.rows},
        claims:claims.rows,
        reviews:{
          publishedCount:Number(reviewSummary.rows[0]?.published_count||0),
          pendingCount:Number(reviewSummary.rows[0]?.pending_count||0),
          rejectedCount:Number(reviewSummary.rows[0]?.rejected_count||0),
          hiddenCount:Number(reviewSummary.rows[0]?.hidden_count||0),
          publishedRating:Number(reviewSummary.rows[0]?.published_rating||0),
        },
        reports:reports.rows,
        timeline:events.rows,
        requiredActions,
      },
    }});
  }catch(err){next(err);}});

  router.post('/businesses/:id/verification', requireAuth(), async(req,res,next)=>{try{
    const b=await repo.findById(req.params.id);
    if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});
    if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Verification application forbidden.'}});
    const evidence=req.body?.evidence??{};
    if(evidence===null||typeof evidence!=='object'||Array.isArray(evidence))throw new Error('VALIDATION_ERROR:evidence must be an object.');
    if(Buffer.byteLength(JSON.stringify(evidence),'utf8')>16384)throw new Error('VALIDATION_ERROR:evidence exceeds 16384 bytes.');
    const result=await db.withTransaction(async(tx)=>{
      await tx.query(`UPDATE discovery_verification_applications SET status='WITHDRAWN',updated_at=CURRENT_TIMESTAMP WHERE business_id=$1 AND status='PENDING'`,[req.params.id]);
      const applicationId=`ver_${randomUUID().replace(/-/g,'')}`;
      const r=await tx.query(`INSERT INTO discovery_verification_applications(id,business_id,applicant_user_id,evidence) VALUES($1,$2,$3,$4) RETURNING *`,[applicationId,req.params.id,req.auth!.userId,evidence]);
      await tx.query(`UPDATE discovery_businesses SET verification_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[req.params.id]);
      await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'VERIFICATION',$3,'VERIFICATION_SUBMITTED',$4,'PENDING',$5,$6,$7)`,[`trust_${randomUUID().replace(/-/g,'')}`,req.params.id,applicationId,b.verification_status,req.auth!.userId,null,{}]);
      return r.rows[0];
    });
    res.status(201).json({success:true,data:result});
  }catch(err){next(err);}});

  router.get('/moderation/verification', requireAuth(), async(req,res,next)=>{try{
    if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});
    const isSuper=req.auth!.role==='super_admin';
    const r=await db.query(`SELECT v.*,b.name AS business_name,b.organization_id,b.verification_status FROM discovery_verification_applications v JOIN discovery_businesses b ON b.id=v.business_id WHERE v.status='PENDING' AND ($1=TRUE OR b.organization_id=$2) ORDER BY v.created_at ASC LIMIT 100`,[isSuper,req.auth!.organizationId||'']);
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.post('/moderation/verification/:id/decision', requireAuth(), async(req,res,next)=>{try{
    if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});
    const status=String(req.body?.status||'');
    if(!['APPROVED','REJECTED'].includes(status))throw new Error('VALIDATION_ERROR:status must be APPROVED or REJECTED.');
    const reason=String(req.body?.reason||'').trim().slice(0,2000)||null;
    const result=await db.withTransaction(async(tx)=>{
      const current=await tx.query(`SELECT v.*,b.organization_id,b.verification_status FROM discovery_verification_applications v JOIN discovery_businesses b ON b.id=v.business_id WHERE v.id=$1 AND v.status='PENDING' AND ($2=TRUE OR b.organization_id=$3) FOR UPDATE`,[req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);
      if(!current.rows[0])throw new Error('NOT_FOUND:Verification application not found.');
      const row=current.rows[0];
      const v=await tx.query(`UPDATE discovery_verification_applications SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,[status,req.auth!.userId,reason,req.params.id]);
      await tx.query(`UPDATE discovery_businesses SET verification_status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,[status==='APPROVED'?'VERIFIED':'REJECTED',row.business_id]);
      await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'VERIFICATION',$3,'VERIFICATION_DECIDED',$4,$5,$6,$7,$8)`,[`trust_${randomUUID().replace(/-/g,'')}`,row.business_id,req.params.id,row.verification_status,status==='APPROVED'?'VERIFIED':'REJECTED',req.auth!.userId,reason,{}]);
      return v.rows[0];
    });
    res.json({success:true,data:result});
  }catch(err){next(err);}});

  router.get('/moderation/claims', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const isSuper=req.auth!.role==='super_admin';const r=await db.query(`SELECT c.*,b.name AS business_name FROM discovery_business_claims c JOIN discovery_businesses b ON b.id=c.business_id WHERE c.status='PENDING' AND ($1=TRUE OR b.organization_id=$2) ORDER BY c.created_at ASC LIMIT 100`,[isSuper,req.auth!.organizationId||'']);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/claims/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['APPROVED','REJECTED'].includes(status))throw new Error('VALIDATION_ERROR:status must be APPROVED or REJECTED.');const r=await db.query(`UPDATE discovery_business_claims c SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP FROM discovery_businesses b WHERE c.id=$4 AND c.business_id=b.id AND ($5=TRUE OR b.organization_id=$6) RETURNING c.*`,[status,req.auth!.userId,req.body?.reason||null,req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Claim not found.'}});await trustEvent(r.rows[0].business_id,'CLAIM',r.rows[0].id,'CLAIM_DECIDED',req.auth!.userId,'PENDING',status,req.body?.reason||null,{});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/moderation/reviews', requireAuth(), async(req,res,next)=>{try{
    if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});
    const status=String(req.query.status||'PENDING');
    const isSuper=req.auth!.role==='super_admin';
    const r=await db.query(`SELECT r.*,b.name AS business_name,b.organization_id FROM discovery_reviews r JOIN discovery_businesses b ON b.id=r.business_id WHERE ($1='' OR r.status=$1) AND ($2=TRUE OR b.organization_id=$3) ORDER BY r.created_at ASC LIMIT 200`,[status,isSuper,req.auth!.organizationId||'']);
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.post('/moderation/reviews/:id/decision', requireAuth(), async(req,res,next)=>{try{
    if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});
    const status=String(req.body?.status||'');
    if(!['PUBLISHED','REJECTED','HIDDEN'].includes(status))throw new Error('VALIDATION_ERROR:status must be PUBLISHED, REJECTED or HIDDEN.');
    const reason=String(req.body?.reason||'').trim().slice(0,2000)||null;
    const result=await db.withTransaction(async(tx)=>{
      const current=await tx.query(`SELECT r.*,b.organization_id FROM discovery_reviews r JOIN discovery_businesses b ON b.id=r.business_id WHERE r.id=$1 AND ($2=TRUE OR b.organization_id=$3) FOR UPDATE`,[req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);
      if(!current.rows[0])throw new Error('NOT_FOUND:Review not found.');
      const fromStatus=String(current.rows[0].status);
      const updated=await tx.query(`UPDATE discovery_reviews SET status=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING *`,[status,req.params.id]);
      await tx.query(`INSERT INTO discovery_review_moderation_events(id,review_id,from_status,to_status,actor_user_id,reason) VALUES($1,$2,$3,$4,$5,$6)`,[`rev_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,fromStatus,status,req.auth!.userId,reason]);
      await tx.query(`INSERT INTO discovery_trust_events(id,business_id,entity_type,entity_id,event_type,from_status,to_status,actor_user_id,reason,metadata) VALUES($1,$2,'REVIEW',$3,'REVIEW_DECIDED',$4,$5,$6,$7,$8)`,[`trust_${randomUUID().replace(/-/g,'')}`,current.rows[0].business_id,req.params.id,fromStatus,status,req.auth!.userId,reason,{}]);
      return updated.rows[0];
    });
    res.json({success:true,data:result});
  }catch(err){next(err);}});

  router.get('/moderation/reports', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const isSuper=req.auth!.role==='super_admin';const r=await db.query(`SELECT r.*,b.name AS business_name,s.name AS service_name FROM discovery_reports r LEFT JOIN discovery_businesses b ON b.id=r.business_id LEFT JOIN discovery_services s ON s.id=r.service_id LEFT JOIN discovery_businesses sb ON sb.id=s.business_id WHERE ($1='' OR r.status=$1) AND ($2=TRUE OR COALESCE(b.organization_id,sb.organization_id)=$3) ORDER BY r.created_at ASC LIMIT 200`,[String(req.query.status||''),isSuper,req.auth!.organizationId||'']);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/reports/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['RESOLVED','DISMISSED','UNDER_REVIEW'].includes(status))throw new Error('VALIDATION_ERROR:invalid report status.');const current=await db.query(`SELECT * FROM discovery_reports WHERE id=$1`,[req.params.id]);if(!current.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Report not found.'}});const fromStatus=String(current.rows[0].status);const r=await db.query(`UPDATE discovery_reports r SET status=$1,resolved_by_user_id=$2,resolved_at=CASE WHEN $1 IN ('RESOLVED','DISMISSED') THEN CURRENT_TIMESTAMP ELSE NULL END,resolution_note=$3 WHERE r.id=$4 AND ($5=TRUE OR EXISTS (SELECT 1 FROM discovery_businesses bx WHERE bx.id=r.business_id AND bx.organization_id=$6) OR EXISTS (SELECT 1 FROM discovery_services sx JOIN discovery_businesses sbx ON sbx.id=sx.business_id WHERE sx.id=r.service_id AND sbx.organization_id=$6)) RETURNING r.*`,[status,req.auth!.userId,req.body?.note||null,req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Report not found.'}});await db.query(`INSERT INTO discovery_report_events(id,report_id,from_status,to_status,actor_user_id,note) VALUES($1,$2,$3,$4,$5,$6)`,[`rep_evt_${randomUUID().replace(/-/g,'')}`,req.params.id,fromStatus,status,req.auth!.userId,req.body?.note||null]);await trustEvent(r.rows[0].business_id,'REPORT',r.rows[0].id,'REPORT_DECIDED',req.auth!.userId,fromStatus,status,req.body?.note||null,{});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.use((err:any,_req:Request,res:Response,next:NextFunction)=>res.headersSent?next(err):fail(res,err));
  return router;
}
