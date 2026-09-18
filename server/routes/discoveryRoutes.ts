import express, { Request, Response, NextFunction } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requireTenantAccess } from '../middleware/auth.ts';
import { DiscoveryBusinessRepository } from '../repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';

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

  const owned = async (req: Request, businessId: string) => {
    const business = await repo.findById(businessId);
    return !!business && (req.auth?.role === 'super_admin' || business.organization_id === req.auth?.organizationId || business.created_by_user_id === req.auth?.userId);
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

  router.patch('/businesses/:id', requireAuth(), requireTenantAccess(), async (req, res, next) => {
    try {
      if (!(await owned(req, req.params.id))) return res.status(403).json({ success: false, error: { code: 'TENANT_ACCESS_DENIED', message: 'Business modification forbidden.' } });
      res.json({ success: true, data: await businessService.update(req.params.id, req.body, actor(req)) });
    } catch (err) { next(err); }
  });

  for (const [path, action] of [
    ['/submit', 'submit'], ['/approve', 'approve'], ['/publish', 'publish'], ['/pause', 'pause'], ['/suspend', 'suspend'],
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
  // DISC-008/009/015: unified discovery search + product projection
  // ------------------------------------------------------------------
  router.get('/search', async (req,res,next)=>{
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const type = typeof req.query.type === 'string' ? req.query.type.toLowerCase() : 'all';
      if (!['all','businesses','products','services'].includes(type)) throw new Error('VALIDATION_ERROR:type must be all, businesses, products or services.');
      const city = typeof req.query.city === 'string' ? req.query.city.trim() : null;
      const district = typeof req.query.district === 'string' ? req.query.district.trim() : null;
      const region = typeof req.query.region === 'string' ? req.query.region.trim() : null;
      const lat = req.query.lat != null ? Number(req.query.lat) : null;
      const lng = req.query.lng != null ? Number(req.query.lng) : null;
      const radius = req.query.radiusKm != null ? Math.min(Math.max(Number(req.query.radiusKm),0),500) : 25;
      const limit = Math.min(Math.max(Number(req.query.limit || 20),1),100);
      const offset = Math.max(Number(req.query.offset || 0),0);
      const openNow = String(req.query.openNow || '').toLowerCase() === 'true';
      const params:any[] = [];
      const bind=(v:any)=>{params.push(v);return `$${params.length}`;};
      const text = q ? `%${q.replace(/[%_]/g,'') }%` : null;
      const nowDow = new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay();
      const nowTime = new Date().toISOString().slice(11,19);
      const baseBusiness = `FROM discovery_businesses b LEFT JOIN LATERAL (SELECT l.* FROM discovery_business_locations l WHERE l.business_id=b.id AND l.is_active=TRUE ORDER BY l.is_primary DESC,l.created_at ASC LIMIT 1) l ON TRUE LEFT JOIN LATERAL (SELECT c.name AS category_name,c.slug AS category_slug FROM discovery_business_category_map m JOIN discovery_business_categories c ON c.id=m.category_id WHERE m.business_id=b.id ORDER BY m.is_primary DESC LIMIT 1) c ON TRUE LEFT JOIN discovery_business_settings ds ON ds.business_id=b.id WHERE b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE AND (b.organization_id IS NULL OR EXISTS(SELECT 1 FROM organizations o WHERE o.id=b.organization_id AND o.is_active=TRUE)) AND COALESCE(ds.show_products,TRUE)=TRUE`;
      const businessWhere = [text ? `(b.name ILIKE ${bind(text)} OR b.short_description ILIKE ${params.length ? `$${params.length}` : bind(text)})` : null, city ? `l.city ILIKE ${bind(city)}` : null, district ? `l.district ILIKE ${bind(district)}` : null, region ? `l.region ILIKE ${bind(region)}` : null, openNow ? `EXISTS(SELECT 1 FROM discovery_business_hours h WHERE h.location_id=l.id AND h.day_of_week=${bind(nowDow)} AND h.is_closed=FALSE AND h.opens_at<=${bind(nowTime)}::time AND h.closes_at>=${bind(nowTime)}::time)` : null].filter(Boolean).join(' AND ');
      const businessResults = type==='products' || type==='services' ? [] : (await db.query(`SELECT b.id,b.public_id,b.name,b.slug,b.business_type,b.short_description,b.phone,b.whatsapp,b.website,b.logo_url,b.cover_image_url,b.verification_status,l.name AS location_name,l.city,l.district,l.region,l.latitude,l.longitude,c.category_name,c.category_slug,(SELECT COALESCE(AVG(r.rating),0) FROM discovery_reviews r WHERE r.business_id=b.id AND r.status='PUBLISHED') AS rating,(SELECT COUNT(*) FROM discovery_reviews r WHERE r.business_id=b.id AND r.status='PUBLISHED') AS review_count,CASE WHEN ${q ? `b.name ILIKE ${bind(text)}` : 'FALSE'} THEN 30 ELSE 0 END + CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END AS relevance ${baseBusiness}${businessWhere ? ` AND ${businessWhere}`:''} ORDER BY relevance DESC,b.name ASC LIMIT ${bind(limit)} OFFSET ${bind(offset)}`, params)).rows;

      const productParams:any[]=[]; const pbind=(v:any)=>{productParams.push(v);return `$${productParams.length}`;};
      const pText=q?`%${q.replace(/[%_]/g,'')}%`:null;
      const productResults = type==='businesses' || type==='services' ? [] : (await db.query(`SELECT p.id AS product_id,p.name AS product_name,p.slug AS product_slug,p.short_description,p.description,p.images,p.organization_id,b.id AS business_id,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,l.city,l.district,l.region,v.id AS variant_id,v.sku,v.name AS variant_name,v.retail_price,COALESCE(SUM(ib.available),0) AS available_stock,ds.show_prices,ds.show_stock_status FROM products p JOIN product_variants v ON v.product_id=p.id JOIN discovery_businesses b ON b.organization_id=p.organization_id AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE LEFT JOIN discovery_business_settings ds ON ds.business_id=b.id LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE AND l.is_primary=TRUE LEFT JOIN inventory_balances ib ON ib.variant_id=v.id WHERE p.status='active' AND p.channels_ecommerce=TRUE AND COALESCE(ds.show_products,TRUE)=TRUE ${pText?`AND (p.name ILIKE ${pbind(pText)} OR p.description ILIKE ${pbind(pText)} OR v.sku ILIKE ${pbind(pText)})`:''} ${city?`AND l.city ILIKE ${pbind(city)}`:''} GROUP BY p.id,v.id,b.id,l.id,ds.show_prices,ds.show_stock_status ORDER BY CASE WHEN ${q?`p.name ILIKE ${pbind(pText)}`:'FALSE'} THEN 30 ELSE 0 END + CASE WHEN COALESCE(SUM(ib.available),0)>0 THEN 10 ELSE 0 END DESC,p.name ASC LIMIT ${pbind(limit)} OFFSET ${pbind(offset)}`, productParams)).rows;

      const serviceParams:any[]=[]; const sbind=(v:any)=>{serviceParams.push(v);return `$${serviceParams.length}`;};
      const sText=q?`%${q.replace(/[%_]/g,'')}%`:null;
      const serviceResults = type==='businesses' || type==='products' ? [] : (await db.query(`SELECT s.*,b.name AS business_name,b.slug AS business_slug,b.public_id AS business_public_id,b.verification_status,l.city,l.district,l.region FROM discovery_services s JOIN discovery_businesses b ON b.id=s.business_id AND b.listing_status='PUBLISHED' AND b.is_discoverable=TRUE LEFT JOIN discovery_business_locations l ON l.business_id=b.id AND l.is_active=TRUE AND l.is_primary=TRUE WHERE s.is_active=TRUE ${sText?`AND (s.name ILIKE ${sbind(sText)} OR s.description ILIKE ${sbind(sText)} OR s.service_type ILIKE ${sbind(sText)})`:''} ${city?`AND l.city ILIKE ${sbind(city)}`:''} ORDER BY CASE WHEN ${q?`s.name ILIKE ${sbind(sText)}`:'FALSE'} THEN 30 ELSE 0 END + CASE WHEN b.verification_status='VERIFIED' THEN 20 ELSE 0 END DESC,s.name ASC LIMIT ${sbind(limit)} OFFSET ${sbind(offset)}`, serviceParams)).rows;
      res.json({success:true,query:q,type,filters:{city,district,region,openNow,radiusKm:radius},data:{businesses:businessResults,products:productResults,services:serviceResults},counts:{businesses:businessResults.length,products:productResults.length,services:serviceResults.length}});
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

  router.post('/businesses/:id/reviews', requireAuth(), async(req,res,next)=>{try{const rating=Number(req.body?.rating);if(!Number.isInteger(rating)||rating<1||rating>5)throw new Error('VALIDATION_ERROR:rating must be an integer from 1 to 5.');const b=await repo.findById(req.params.id);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business not found.'}});let verified=false;const orderId=req.body?.orderId?String(req.body.orderId):null;if(orderId&&b.organization_id){const o=await db.query(`SELECT id,status,organization_id FROM orders WHERE id=$1 AND organization_id=$2 AND status IN ('Delivered','Completed')`,[orderId,b.organization_id]);verified=o.rows.length>0;}const r=await db.query(`INSERT INTO discovery_reviews(id,business_id,reviewer_user_id,reviewer_name,rating,title,body,order_id,verified_purchase,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLISHED') RETURNING *`,[`rev_${randomUUID().replace(/-/g,'')}`,req.params.id,req.auth!.userId,String(req.body?.reviewerName||req.auth!.email||req.auth!.userId),rating,req.body?.title||null,req.body?.body||null,verified?orderId:null,verified]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/businesses/:id/reviews', async(req,res,next)=>{try{const r=await db.query(`SELECT id,reviewer_name,rating,title,body,verified_purchase,created_at FROM discovery_reviews WHERE business_id=$1 AND status='PUBLISHED' ORDER BY verified_purchase DESC,created_at DESC LIMIT 100`,[req.params.id]);const s=await db.query(`SELECT COALESCE(AVG(rating),0)::numeric(3,2) AS rating,COUNT(*)::int AS count FROM discovery_reviews WHERE business_id=$1 AND status='PUBLISHED'`,[req.params.id]);res.json({success:true,summary:s.rows[0],data:r.rows});}catch(err){next(err);}});

  router.post('/reports', async(req,res,next)=>{try{if(!req.body?.businessId&&!req.body?.serviceId)throw new Error('VALIDATION_ERROR:businessId or serviceId is required.');if(!String(req.body?.reasonCode||'').trim())throw new Error('VALIDATION_ERROR:reasonCode is required.');const r=await db.query(`INSERT INTO discovery_reports(id,business_id,service_id,reporter_user_id,reason_code,description) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,status,created_at`,[`report_${randomUUID().replace(/-/g,'')}`,req.body.businessId||null,req.body.serviceId||null,req.auth?.userId||null,String(req.body.reasonCode).trim(),req.body.description||null]);res.status(201).json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/categories', async(req,res,next)=>{try{const r=await db.query(`SELECT id,parent_id,name,slug,description,icon_name,display_order FROM discovery_business_categories WHERE is_active=TRUE ORDER BY display_order,name`);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.put('/businesses/:id/categories', requireAuth(), async(req,res,next)=>{try{if(!(await owned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Category management forbidden.'}});const ids=Array.isArray(req.body?.categoryIds)?req.body.categoryIds.map(String):[];if(!ids.length)throw new Error('VALIDATION_ERROR:categoryIds must contain at least one category.');await db.query('BEGIN');try{await db.query('DELETE FROM discovery_business_category_map WHERE business_id=$1',[req.params.id]);for(let i=0;i<ids.length;i++)await db.query('INSERT INTO discovery_business_category_map(business_id,category_id,is_primary) VALUES($1,$2,$3)',[req.params.id,ids[i],i===0]);await db.query('COMMIT');}catch(e){await db.query('ROLLBACK');throw e;}res.json({success:true,data:await repo.listCategories(req.params.id)});}catch(err){next(err);}});

  // ------------------------------------------------------------------
  // DISC-014: analytics + moderation endpoints
  // ------------------------------------------------------------------
  router.post('/analytics/events', async(req,res,next)=>{try{const type=String(req.body?.eventType||'');if(!ANALYTICS_EVENTS.has(type))throw new Error('VALIDATION_ERROR:Unsupported analytics event.');const raw=`${req.ip}|${req.headers['user-agent']||''}`;const sessionHash=createHash('sha256').update(raw).digest('hex');await db.query(`INSERT INTO discovery_analytics_events(id,business_id,product_id,service_id,event_type,session_hash,actor_user_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[`evt_${randomUUID().replace(/-/g,'')}`,req.body?.businessId||null,req.body?.productId||null,req.body?.serviceId||null,type,sessionHash,req.auth?.userId||null,req.body?.metadata||{}]);res.status(202).json({success:true});}catch(err){next(err);}});

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

  router.get('/moderation/claims', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const r=await db.query(`SELECT c.*,b.name AS business_name FROM discovery_business_claims c JOIN discovery_businesses b ON b.id=c.business_id WHERE c.status='PENDING' ORDER BY c.created_at ASC LIMIT 100`);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/claims/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['APPROVED','REJECTED'].includes(status))throw new Error('VALIDATION_ERROR:status must be APPROVED or REJECTED.');const r=await db.query(`UPDATE discovery_business_claims SET status=$1,reviewed_by_user_id=$2,reviewed_at=CURRENT_TIMESTAMP,review_reason=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$4 RETURNING *`,[status,req.auth!.userId,req.body?.reason||null,req.params.id]);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Claim not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.get('/moderation/reports', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const r=await db.query(`SELECT r.*,b.name AS business_name,s.name AS service_name FROM discovery_reports r LEFT JOIN discovery_businesses b ON b.id=r.business_id LEFT JOIN discovery_services s ON s.id=r.service_id WHERE ($1='' OR r.status=$1) ORDER BY r.created_at ASC LIMIT 200`,[String(req.query.status||'')]);res.json({success:true,data:r.rows});}catch(err){next(err);}});
  router.post('/moderation/reports/:id/decision', requireAuth(), async(req,res,next)=>{try{if(!['super_admin','admin'].includes(req.auth!.role))return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Administrator authorization required.'}});const status=req.body?.status;if(!['RESOLVED','DISMISSED','UNDER_REVIEW'].includes(status))throw new Error('VALIDATION_ERROR:invalid report status.');const r=await db.query(`UPDATE discovery_reports SET status=$1,resolved_by_user_id=$2,resolved_at=CASE WHEN $1 IN ('RESOLVED','DISMISSED') THEN CURRENT_TIMESTAMP ELSE NULL END,resolution_note=$3 WHERE id=$4 RETURNING *`,[status,req.auth!.userId,req.body?.note||null,req.params.id]);if(!r.rows[0])return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Report not found.'}});res.json({success:true,data:r.rows[0]});}catch(err){next(err);}});

  router.use((err:any,_req:Request,res:Response,next:NextFunction)=>res.headersSent?next(err):fail(res,err));
  return router;
}
