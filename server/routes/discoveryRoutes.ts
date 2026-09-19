import express, { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requireTenantAccess } from '../middleware/auth.ts';
import { DiscoveryBusinessRepository } from '../repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';
import { DiscoveryStoreProvisioningService } from '../services/discoveryStoreProvisioningService.ts';
import { discoveryFuzzyScore, discoverySearchTokens, normalizeDiscoverySearchText, rankDiscoveryFuzzy } from '../utils/discoverySearch.ts';

const SERVICE_BOOKING_MODES = new Set(['REQUEST', 'BOOKING', 'QUOTE']);
const ANALYTICS_EVENTS = new Set(['SEARCH','IMPRESSION','VIEW','CONTACT','DIRECTION_CLICK','STORE_CLICK','PRODUCT_VIEW','SERVICE_VIEW','SERVICE_REQUEST','ORDER_CLICK']);

export function createDiscoveryRouter(db: DatabaseClient) {
  const router = express.Router();
  const repo = new DiscoveryBusinessRepository(db);
  const businessService = new DiscoveryBusinessService(repo, db);

  const actor = (req: Request) => ({
    userId: req.auth!.userId,
    role: req.auth!.role,
    organizationId: req.auth!.organizationId,
  });

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
  const owned = async (req: Request, businessId: string) => {
    const business = await repo.findById(businessId);
    if (!business || !req.auth) return false;
    try {
      businessService.assertCanManage(business, actor(req));
      return true;
    } catch {
      return false;
    }
  };

  const publicBusiness = async (id: string) => businessService.getPublicProfile(id);

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
      if (!(await owned(req, req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Business conversion forbidden.'}});
      const business = await repo.findById(req.params.id);
      if (!business) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});
      if (business.organization_id && business.organization_id !== req.auth!.organizationId) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Business is already bound to another organization.'}});
      const provisioned = await new DiscoveryStoreProvisioningService(db).provisionForDiscoveryBusiness(business.id, req.auth!.organizationId, business.slug, business.name);
      const data = await repo.findById(business.id);
      res.json({success:true,data,store:{provisioned:true,tenantSlug:provisioned.tenantSlug,organizationId:provisioned.organizationId}});
    } catch (err) { next(err); }
  });

  router.patch('/businesses/:id', requireAuth(), requireTenantAccess(), async (req, res, next) => {
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
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Location management forbidden.' } });
      const b = await repo.findById(req.params.id);
      if (!b || b.listing_status === 'ARCHIVED') throw new Error('DISCOVERY_ARCHIVED:Archived businesses cannot add locations.');
      const x = req.body || {};
      if (!String(x.name || '').trim()) throw new Error('VALIDATION_ERROR:name is required.');
      if ((x.latitude == null) !== (x.longitude == null)) throw new Error('VALIDATION_ERROR:latitude and longitude must be provided together.');
      const id = `loc_${randomUUID().replace(/-/g, '')}`;
      if (x.isPrimary) await db.query('UPDATE discovery_business_locations SET is_primary = FALSE WHERE business_id = $1', [req.params.id]);
      const result = await db.query(`INSERT INTO discovery_business_locations (id,business_id,name,location_type,address_line_1,address_line_2,city,district,region,country,postal_code,latitude,longitude,service_radius_km,phone,is_primary,is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE) RETURNING *`, [
        id, req.params.id, String(x.name).trim(), x.locationType || 'STORE', x.addressLine1 || null, x.addressLine2 || null, x.city || null, x.district || null, x.region || null, x.country || 'Sierra Leone', x.postalCode || null, x.latitude ?? null, x.longitude ?? null, x.serviceRadiusKm ?? null, x.phone || null, Boolean(x.isPrimary),
      ]);
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (err) { next(err); }
  });

  router.patch('/businesses/:id/locations/:locationId', requireAuth(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Location management forbidden.' } });
      const x = req.body || {};
      if (x.isPrimary) await db.query('UPDATE discovery_business_locations SET is_primary = FALSE WHERE business_id = $1', [req.params.id]);
      const allowed: Record<string,string> = { name:'name', locationType:'location_type', addressLine1:'address_line_1', addressLine2:'address_line_2', city:'city', district:'district', region:'region', country:'country', postalCode:'postal_code', latitude:'latitude', longitude:'longitude', serviceRadiusKm:'service_radius_km', phone:'phone', isPrimary:'is_primary', isActive:'is_active' };
      const fields = Object.entries(x).filter(([k]) => allowed[k]).map(([k,v],i) => ({ column: allowed[k], value:v, idx:i+1 }));
      if (!fields.length) return res.status(422).json({ success:false,error:{code:'VALIDATION_ERROR',message:'No editable location fields supplied.'} });
      const set = fields.map(f => `${f.column} = $${f.idx}`).join(', ');
      const values = fields.map(f => f.value);
      values.push(req.params.id, req.params.locationId);
      const result = await db.query(`UPDATE discovery_business_locations SET ${set}, updated_at=CURRENT_TIMESTAMP WHERE business_id=$${values.length-1} AND id=$${values.length} RETURNING *`, values);
      if (!result.rows[0]) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Location not found.'}});
      res.json({success:true,data:result.rows[0]});
    } catch (err) { next(err); }
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
      if (!(await owned(req, req.params.id))) return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Discovery settings management forbidden.'}});
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
  router.get('/search/suggestions', async (req,res,next)=>{
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
    if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Search alias access forbidden.'}});
    const r=await db.query("SELECT id,entity_type,entity_id,alias,created_at,updated_at FROM discovery_search_aliases WHERE entity_type='BUSINESS' AND entity_id=$1 AND is_active=TRUE ORDER BY alias",[req.params.id]);
    res.json({success:true,data:r.rows});
  }catch(err){next(err);}});

  router.post('/businesses/:id/search-aliases', requireAuth(), async (req,res,next)=>{try{
    if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Search alias management forbidden.'}});
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

  router.get('/search', async (req,res,next)=>{
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
      if (categoryId) bConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm WHERE bcm.business_id=b.id AND bcm.category_id=${bb(categoryId)})`);
      if (city) bConditions.push(`lower(l.city)=lower(${bb(city)})`);
      if (district) bConditions.push(`lower(l.district)=lower(${bb(district)})`);
      if (region) bConditions.push(`lower(l.region)=lower(${bb(region)})`);
      if (distanceExpr) {
        bConditions.push(`${distanceExpr} <= ${bb(radius)} AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
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
            ) * 100
            + CASE WHEN lower(b.name)=lower(${bQ}) THEN 40 WHEN lower(b.name) LIKE lower(${bQ}) || '%' THEN 25 ELSE 0 END
            + CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END
            + ${ratingExpr} * 4
            + ln(1 + ${reviewCountExpr}) * 2
            ${distanceExpr ? `- LEAST(${distanceExpr},100) * 0.10` : ''}
          )`
        : `(
            CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END
            + ${ratingExpr} * 4
            + ln(1 + ${reviewCountExpr}) * 2
          )`;

      let businessResults:any[]=[];
      let businessCount = 0;
      if (type !== 'products' && type !== 'services') {
        const order = sort === 'rating' ? `${ratingExpr} DESC, b.name ASC`
          : sort === 'review_count' ? `${reviewCountExpr} DESC, b.name ASC`
          : sort === 'name_asc' ? 'b.name ASC'
          : sort === 'newest' ? 'b.published_at DESC NULLS LAST, b.name ASC'
          : sort === 'distance' && distanceExpr ? `${distanceExpr} ASC, b.name ASC`
          : `search_rank DESC, b.name ASC`;
        const r=await db.query(`
          SELECT b.id,b.public_id,b.name,b.slug,b.business_type,b.short_description,b.phone,b.whatsapp,b.website,
                 b.logo_url,b.cover_image_url,b.business_mode,o.slug AS tenant_slug,b.verification_status,
                 l.name AS location_name,l.city,l.district,l.region,l.latitude,l.longitude,
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
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * 35}))
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
        "o.is_active=TRUE",
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
      if(categoryId) pConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm WHERE bcm.business_id=b.id AND bcm.category_id=${pb(categoryId)})`);
      if(city) pConditions.push(`lower(l.city)=lower(${pb(city)})`);
      if(district) pConditions.push(`lower(l.district)=lower(${pb(district)})`);
      if(region) pConditions.push(`lower(l.region)=lower(${pb(region)})`);
      if(distanceExpr) pConditions.push(`${distanceExpr.replaceAll('l.','l.')} <= ${pb(radius)} AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
      const productRank=pQ?`(
        ts_rank_cd(to_tsvector('simple',coalesce(p.name,'') || ' ' || coalesce(p.short_description,'') || ' ' || coalesce(p.description,'') || ' ' || coalesce(p.slug,'')),plainto_tsquery('simple',${pQ}))*100
        + CASE WHEN lower(p.name)=lower(${pQ}) THEN 40 WHEN lower(p.name) LIKE lower(${pQ}) || '%' THEN 25 ELSE 0 END
        + CASE WHEN COALESCE(SUM(ib.available),0)>0 THEN 10 ELSE 0 END
      )`:`CASE WHEN COALESCE(SUM(ib.available),0)>0 THEN 10 ELSE 0 END`;
      let productResults:any[]=[];
      let productCount = 0;
      if(type !== 'businesses' && type !== 'services'){
        const order=sort==='name_asc'?'p.name ASC':`search_rank DESC,p.name ASC`;
        const r=await db.query(`
          SELECT p.id AS product_id,p.name AS product_name,p.slug AS product_slug,p.short_description,p.description,p.images,
                 p.organization_id,b.id AS business_id,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,
                 l.city,l.district,l.region,v.id AS variant_id,v.sku,v.name AS variant_name,v.retail_price,
                 COALESCE(SUM(ib.available),0) AS available_stock,ds.show_prices,ds.show_stock_status,
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
          ORDER BY ${order}
          LIMIT ${pb(fuzzyCandidateLimit)} OFFSET ${fuzzyEnabled ? pb(0) : pb(offset)}
        `,productParams);
        productResults=r.rows;
        productCount = Number(r.rows[0]?.total_count || 0);
        if (fuzzyEnabled) {
          const ranked = productResults.map((row:any, index:number) => ({
            row,
            fuzzyScore: discoveryFuzzyScore(q, [row.product_name,row.product_slug,row.short_description,row.description,row.sku,row.search_aliases].filter(Boolean).join(' ')),
            index,
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * 35}))
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
        "o.is_active=TRUE"
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
      if(categoryId) sConditions.push(`EXISTS(SELECT 1 FROM discovery_business_category_map bcm WHERE bcm.business_id=b.id AND bcm.category_id=${sb(categoryId)})`);
      if(city) sConditions.push(`lower(l.city)=lower(${sb(city)})`);
      if(district) sConditions.push(`lower(l.district)=lower(${sb(district)})`);
      if(region) sConditions.push(`lower(l.region)=lower(${sb(region)})`);
      if(distanceExpr) sConditions.push(`${distanceExpr} <= ${sb(radius)} AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`);
      const serviceRank=sQ?`(
        ts_rank_cd(to_tsvector('simple',coalesce(s.name,'') || ' ' || coalesce(s.description,'') || ' ' || coalesce(s.service_type,'') || ' ' || coalesce(s.service_area_text,'')),plainto_tsquery('simple',${sQ}))*100
        + CASE WHEN lower(s.name)=lower(${sQ}) THEN 40 WHEN lower(s.name) LIKE lower(${sQ}) || '%' THEN 25 ELSE 0 END
        + CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END
      )`:`CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END`;
      let serviceResults:any[]=[];
      let serviceCount = 0;
      if(type !== 'businesses' && type !== 'products'){
        const order=sort==='name_asc'?'s.name ASC':`search_rank DESC,s.name ASC`;
        const r=await db.query(`
          SELECT s.*,COUNT(*) OVER() AS total_count,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,
                 b.verification_status,l.city,l.district,l.region,${serviceRank} AS search_rank,
                 COALESCE((SELECT string_agg(sa.alias,' ' ORDER BY sa.alias) FROM discovery_search_aliases sa WHERE sa.entity_type='SERVICE' AND sa.entity_id=s.id AND sa.is_active=TRUE),'') AS search_aliases
          FROM discovery_services s
          JOIN discovery_businesses b ON b.id=s.business_id
            AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE
          JOIN organizations o ON o.id=b.organization_id AND o.is_active=TRUE
          LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE AND l.is_primary=TRUE
          WHERE ${sConditions.join(' AND ')}
          ORDER BY ${order}
          LIMIT ${sb(fuzzyCandidateLimit)} OFFSET ${fuzzyEnabled ? sb(0) : sb(offset)}
        `,serviceParams);
        serviceResults=r.rows;
        serviceCount = Number(r.rows[0]?.total_count || 0);
        if (fuzzyEnabled) {
          const ranked = serviceResults.map((row:any, index:number) => ({
            row,
            fuzzyScore: discoveryFuzzyScore(q, [row.name,row.service_type,row.description,row.service_area_text,row.search_aliases].filter(Boolean).join(' ')),
            index,
          })).map((x:any) => ({...x, combinedRank: Number(x.row.search_rank || 0) + x.fuzzyScore * 35}))
            .sort((a:any,b:any) => b.combinedRank-a.combinedRank || b.fuzzyScore-a.fuzzyScore || String(a.row.name).localeCompare(String(b.row.name)) || a.index-b.index);
          serviceResults = ranked.slice(offset, offset + limit).map((x:any) => ({...x.row, fuzzy_score: Number(x.fuzzyScore.toFixed(4))}));
        }
      }

      if (q) {
        const analyticsMetadata = {
          queryHash: createHash('sha256').update(q.normalize('NFKC').toLowerCase()).digest('hex'),
          queryLength: q.length,
          type,
          zeroResults: businessCount + productCount + serviceCount === 0,
          resultCounts: { businesses: businessCount, products: productCount, services: serviceCount },
          filters: { city, district, region, categoryId, openNow, radiusKm: radius, sort },
        };
        void db.query(
          `INSERT INTO discovery_analytics_events(id,event_type,session_hash,actor_user_id,metadata) VALUES($1,'SEARCH',$2,$3,$4)`,
          [`evt_${randomUUID().replace(/-/g,'')}`, createHash('sha256').update(`${req.ip}|search|${req.headers['user-agent']||''}`).digest('hex'), req.auth?.userId || null, analyticsMetadata],
        ).catch(() => undefined);
      }

      res.json({
        success:true,query:q,type,
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

  // ------------------------------------------------------------------
  // DISC-010: services + request/quote marketplace
  // ------------------------------------------------------------------
  router.get('/businesses/:id/services', async (req,res,next)=>{try{const r=await db.query(`SELECT * FROM discovery_services WHERE business_id=$1 AND is_active=TRUE ORDER BY name`,[req.params.id]);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/businesses/:id/services', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service management forbidden.'}});const x=req.body||{};if(!String(x.name||'').trim())throw new Error('VALIDATION_ERROR:name is required.');if(x.bookingMode&&!SERVICE_BOOKING_MODES.has(x.bookingMode))throw new Error('VALIDATION_ERROR:invalid bookingMode.');const slug=String(x.slug||x.name).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,180)||`service-${randomUUID().slice(0,8)}`;const r=await db.query(`INSERT INTO discovery_services(id,business_id,name,slug,description,service_type,price_from,price_to,currency,duration_minutes,service_area_text,booking_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[`svc_${randomUUID().replace(/-/g,'')}`,req.params.id,String(x.name).trim(),slug,x.description||null,x.serviceType||null,x.priceFrom??null,x.priceTo??null,x.currency||'SLE',x.durationMinutes??null,x.serviceAreaText||null,x.bookingMode||'REQUEST']);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});
  router.patch('/businesses/:id/services/:serviceId', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Service management forbidden.'}});const x=req.body||{};const allowed:Record<string,string>={name:'name',description:'description',serviceType:'service_type',priceFrom:'price_from',priceTo:'price_to',currency:'currency',durationMinutes:'duration_minutes',serviceAreaText:'service_area_text',bookingMode:'booking_mode',isActive:'is_active'};const entries=Object.entries(x).filter(([k])=>allowed[k]);if(!entries.length)return res.status(422).json({success:false,error:{code:'VALIDATION_ERROR',message:'No editable service fields supplied.'}});const vals=entries.map(([,v])=>v);const set=entries.map(([k],i)=>`${allowed[k]}=$${i+1}`).join(',');vals.push(req.params.id,req.params.serviceId);const r=await db.query(`UPDATE discovery_services SET ${set},updated_at=CURRENT_TIMESTAMP WHERE business_id=$${vals.length-1} AND id=$${vals.length} RETURNING *`,vals);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.post('/service-requests', async(req,res,next)=>{try{const x=req.body||{};if(!String(x.customerName||'').trim()||!String(x.description||'').trim())throw new Error('VALIDATION_ERROR:customerName and description are required.');if((x.latitude==null)!==(x.longitude==null))throw new Error('VALIDATION_ERROR:latitude and longitude must be supplied together.');const r=await db.query(`INSERT INTO discovery_service_requests(id,customer_user_id,customer_name,customer_phone,customer_email,description,city,district,region,latitude,longitude,preferred_date,budget_from,budget_to) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[`req_${randomUUID().replace(/-/g,'')}`,req.auth?.userId||null,String(x.customerName).trim(),x.customerPhone||null,x.customerEmail||null,String(x.description).trim(),x.city||null,x.district||null,x.region||null,x.latitude??null,x.longitude??null,x.preferredDate||null,x.budgetFrom??null,x.budgetTo??null]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/service-requests/:id', requireAuth(), async(req,res,next)=>{try{const r=await db.query(`SELECT r.*,json_agg(json_build_object('businessId',m.business_id,'businessName',b.name,'score',m.match_score)) FILTER(WHERE m.business_id IS NOT NULL) AS matches FROM discovery_service_requests r LEFT JOIN discovery_service_request_matches m ON m.request_id=r.id LEFT JOIN discovery_businesses b ON b.id=m.business_id WHERE r.id=$1 AND (r.customer_user_id=$2 OR $2='super_admin') GROUP BY r.id`,[req.params.id,req.auth!.userId]);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Service request not found.'}});const quotes=await db.query(`SELECT q.*,b.name AS business_name,s.name AS service_name FROM discovery_service_quotes q JOIN discovery_businesses b ON b.id=q.business_id LEFT JOIN discovery_services s ON s.id=q.service_id WHERE q.request_id=$1 ORDER BY q.created_at DESC`,[req.params.id]);res.json({success:true,data:{...r.rows[0],quotes:quotes.rows}});}catch(err){next(err);}});

  router.post('/service-requests/:id/quotes', requireAuth(), async(req,res,next)=>{try{const x=req.body||{};if(!x.businessId||x.amount==null)throw new Error('VALIDATION_ERROR:businessId and amount are required.');const b=await repo.findById(String(x.businessId));if(!b||!(await owned(req,b.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Only the business owner may quote.'}});const request=await db.query('SELECT * FROM discovery_service_requests WHERE id=$1 AND status IN (\'OPEN\',\'MATCHED\',\'QUOTED\')',[req.params.id]);if(!request.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Open service request not found.'}});const r=await db.query(`INSERT INTO discovery_service_quotes(id,request_id,business_id,service_id,amount,currency,message,estimated_duration_minutes,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[`quote_${randomUUID().replace(/-/g,'')}`,req.params.id,x.businessId,x.serviceId||null,x.amount,x.currency||'SLE',x.message||null,x.estimatedDurationMinutes||null,x.validUntil||null]);await db.query(`INSERT INTO discovery_service_request_matches(request_id,business_id,match_score) VALUES($1,$2,1) ON CONFLICT(request_id,business_id) DO NOTHING`,[req.params.id,x.businessId]);await db.query(`UPDATE discovery_service_requests SET status='QUOTED',updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[req.params.id]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  // ------------------------------------------------------------------
  // DISC-012: verification, claims, reviews and abuse reports
  // ------------------------------------------------------------------
  router.post('/businesses/:id/claims', requireAuth(), async(req,res,next)=>{try{const b=await repo.findById(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});const r=await db.query(`INSERT INTO discovery_business_claims(id,business_id,claimant_user_id,claimant_name,claimant_email,evidence) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[`claim_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,String(req.body?.claimantName||req.auth!.email||req.auth!.userId),req.body?.claimantEmail||req.auth!.email||null,req.body?.evidence||{}]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.post('/businesses/:id/reviews', requireAuth(), async(req,res,next)=>{try{const rating=Number(req.body?.rating);if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error('VALIDATION_ERROR:rating must be an integer from 1 to 5.');const b=await repo.findById(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});let verified=false;const orderId=req.body?.orderId?String(req.body.orderId):null;if(orderId&&b.organization_id){const o=await db.query(`SELECT o.id FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1 AND o.organization_id=$2 AND c.organization_id=$2 AND c.auth_user_id=$3 AND o.status IN ('Delivered','Completed')`,[orderId,b.organization_id,req.auth!.userId]);verified=o.rows.length>0;}const r=await db.query(`INSERT INTO discovery_reviews(id,business_id,reviewer_user_id,reviewer_name,rating,title,body,order_id,verified_purchase,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLISHED') RETURNING *`,[`rev_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,String(req.body?.reviewerName||req.auth!.email||req.auth!.userId),rating,req.body?.title||null,req.body?.body||null,verified?orderId:null,verified]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/businesses/:id/reviews', async(req,res,next)=>{try{const b=await businessService.getPublicProfile(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});if(!b.settings.allow_reviews)return res.json({success:true,summary:{rating:'0.00',count:0},data:[]});const r=await db.query(`SELECT id,reviewer_name,rating,title,body,verified_purchase,created_at FROM discovery_reviews WHERE business_id=$1 AND status='PUBLISHED' ORDER BY verified_purchase DESC,created_at DESC LIMIT 100`,[req.params.id]);const s=await db.query(`SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS rating,COUNT(*)::int AS count FROM discovery_reviews WHERE business_id=$1 AND status='PUBLISHED'`,[req.params.id]);res.json({success:true,summary:s.rows[0],data:r.rows});}catch(err){next(err);}});

  router.post('/reports', async(req,res,next)=>{try{if(!req.body?.businessId&&!req.body?.serviceId)throw new Error('VALIDATION_ERROR:businessId or serviceId is required.');if(!String(req.body?.reasonCode||'').trim())throw new Error('VALIDATION_ERROR:reasonCode is required.');const r=await db.query(`INSERT INTO discovery_reports(id,business_id,service_id,reporter_user_id,reason_code,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at`,[`report_${randomUUID().replace(/-/g,'')}`,req.body.businessId||null,req.body.serviceId||null,req.auth?.userId||null,String(req.body.reasonCode).trim(),req.body.description||null]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/categories', async(req,res,next)=>{try{const r=await db.query(`SELECT c.id,c.parent_id,c.name,c.slug,c.description,c.icon_name,c.display_order,COUNT(DISTINCT bcm.business_id) FILTER (WHERE b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE) AS item_count FROM discovery_business_categories c LEFT JOIN discovery_business_category_map bcm ON bcm.category_id=c.id LEFT JOIN discovery_businesses b ON b.id=bcm.business_id WHERE c.is_active=TRUE GROUP BY c.id ORDER BY c.display_order,c.name`);res.json({success:true,data:r.rows.map((x:any)=>({...x,item_count:Number(x.item_count||0)}))});}catch(err){next(err);}});
  router.put('/businesses/:id/categories', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Category management forbidden.'}});const ids=Array.isArray(req.body?.categoryIds)?req.body.categoryIds.map(String):[];if(!ids.length)throw new Error('VALIDATION_ERROR:categoryIds must contain at least one category.');await db.query('BEGIN');try{await db.query('DELETE FROM discovery_business_category_map WHERE business_id=$1',[req.params.id]);for(let i=0;i<ids.length;i++)await db.query('INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES($1,$2,$3)',[req.params.id,ids[i],i===0]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}res.json({success:true,data:await repo.listCategories(req.params.id)});}catch(err){next(err);}});

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
    if(!(await owned(req,req.params.id))&&req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Analytics access forbidden.'}});
    const days=Math.min(Math.max(Number(req.query.days||30),1),365);
    const r=await db.query("SELECT event_type,COUNT(*)::int AS count,COUNT(DISTINCT session_hash)::int AS unique_sessions FROM discovery_analytics_events WHERE business_id=$1 AND created_at>=CURRENT_TIMESTAMP-($2||' days')::interval GROUP BY event_type ORDER BY count DESC",[req.params.id,String(days)]);
    const counts:Record<string,number>={}; for(const row of r.rows) counts[String(row.event_type)]=Number(row.count)||0;
    const impressions=counts.IMPRESSION||0; const views=counts.VIEW||0; const conversions=(counts.CONTACT||0)+(counts.DIRECTION_CLICK||0)+(counts.SERVICE_REQUEST||0)+(counts.STORE_CLICK||0);
    const summary={business_id:req.params.id,timeframe:String(days)+'d',impressions,profile_views:views,phone_clicks:counts.CONTACT||0,whatsapp_clicks:0,direction_clicks:counts.DIRECTION_CLICK||0,website_clicks:0,service_inquiries:counts.SERVICE_REQUEST||0,store_visits:counts.STORE_CLICK||0,conversion_rate:views>0?conversions/views:0};
    res.json({success:true,periodDays:days,data:summary,events:r.rows});
  }catch(err){next(err);}});

  router.get('/moderation/claims', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const isSuper=req.auth!.role==='super_admin';const r=await db.query(`SELECT c.*,b.name AS business_name FROM discovery_business_claims c JOIN discovery_businesses b ON b.id=c.business_id WHERE c.status='PENDING' AND ($1=TRUE OR b.organization_id=$2) ORDER BY c.created_at ASC LIMIT 100`,[isSuper,req.auth!.organizationId||'']);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/claims/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['APPROVED','REJECTED'].includes(status))throw new Error('VALIDATION_ERROR:status must be APPROVED or REJECTED.');const r=await db.query(`UPDATE discovery_business_claims c SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP FROM discovery_businesses b WHERE c.id=$4 AND c.business_id=b.id AND ($5=TRUE OR b.organization_id=$6) RETURNING c.*`,[status,req.auth!.userId,req.body?.reason||null,req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Claim not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/moderation/reports', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const isSuper=req.auth!.role==='super_admin';const r=await db.query(`SELECT r.*,b.name AS business_name,s.name AS service_name FROM discovery_reports r LEFT JOIN discovery_businesses b ON b.id=r.business_id LEFT JOIN discovery_services s ON s.id=r.service_id LEFT JOIN discovery_businesses sb ON sb.id=s.business_id WHERE ($1='' OR r.status=$1) AND ($2=TRUE OR COALESCE(b.organization_id,sb.organization_id)=$3) ORDER BY r.created_at ASC LIMIT 200`,[String(req.query.status||''),isSuper,req.auth!.organizationId||'']);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/reports/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['RESOLVED','DISMISSED','UNDER_REVIEW'].includes(status))throw new Error('VALIDATION_ERROR:invalid report status.');const r=await db.query(`UPDATE discovery_reports r SET status=$1,resolved_by_user_id=$2,resolved_at=CASE WHEN $1 IN ('RESOLVED','DISMISSED') THEN CURRENT_TIMESTAMP ELSE NULL END,resolution_note=$3 WHERE r.id=$4 AND ($5=TRUE OR EXISTS (SELECT 1 FROM discovery_businesses bx WHERE bx.id=r.business_id AND bx.organization_id=$6) OR EXISTS (SELECT 1 FROM discovery_services sx JOIN discovery_businesses sbx ON sbx.id=sx.business_id WHERE sx.id=r.service_id AND sbx.organization_id=$6)) RETURNING r.*`,[status,req.auth!.userId,req.body?.note||null,req.params.id,req.auth!.role==='super_admin',req.auth!.organizationId||'']);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Report not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.use((err:any,_req:Request,res:Response,next:NextFunction)=>res.headersSent?next(err):fail(res,err));
  return router;
}
