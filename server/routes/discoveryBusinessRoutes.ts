import express, { Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { DiscoveryBusinessRepository } from '../repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';
import { requireAuth, requireTenantAccess } from '../middleware/auth.ts';

export function createDiscoveryBusinessRouter(db: DatabaseClient) {
  const router = express.Router();
  const repo = new DiscoveryBusinessRepository(db);
  const service = new DiscoveryBusinessService(repo);
  const tenantOwned = async (req: Request, id: string) => {
    const b = await repo.findById(id);
    return b && (req.auth?.role === 'super_admin' || b.organization_id === req.auth?.organizationId);
  };
  const fail = (res: Response, err: any) => {
    const message = String(err?.message || 'Discovery request failed.');
    const code = message.split(':')[0];
    const status = code === 'DISCOVERY_BUSINESS_NOT_FOUND' ? 404 : code === 'INACTIVE_ORGANIZATION' ? 403 : code === 'VALIDATION_ERROR' ? 422 : code === 'DISCOVERY_INVALID_LIFECYCLE' ? 409 : 400;
    return res.status(status).json({ success: false, error: { code, message: message.includes(':') ? message.slice(message.indexOf(':') + 1).trim() : message } });
  };

  router.get('/businesses', async (req, res, next) => {
    try { res.json({ success:true, count:(await repo.listPublished({ city: typeof req.query.city==='string'?req.query.city:undefined, district: typeof req.query.district==='string'?req.query.district:undefined, region: typeof req.query.region==='string'?req.query.region:undefined, businessType: typeof req.query.businessType==='string'?req.query.businessType:undefined, categoryId: typeof req.query.categoryId==='string'?req.query.categoryId:undefined, limit: typeof req.query.limit==='string'?Number(req.query.limit):undefined, offset: typeof req.query.offset==='string'?Number(req.query.offset):undefined })).length, data: await repo.listPublished({ city: typeof req.query.city==='string'?req.query.city:undefined, district: typeof req.query.district==='string'?req.query.district:undefined, region: typeof req.query.region==='string'?req.query.region:undefined, businessType: typeof req.query.businessType==='string'?req.query.businessType:undefined, categoryId: typeof req.query.categoryId==='string'?req.query.categoryId:undefined, limit: typeof req.query.limit==='string'?Number(req.query.limit):undefined, offset: typeof req.query.offset==='string'?Number(req.query.offset):undefined }) }); } catch(e){next(e);} });
  router.get('/businesses/:slug', async (req,res,next)=>{ try { const b=await repo.findBySlug(req.params.slug,{publicOnly:true}); if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}}); const [locations,categories,settings]=await Promise.all([repo.listLocations(b.id),repo.listCategories(b.id),repo.getSettings(b.id)]); res.json({success:true,data:{...b,locations,categories,settings}}); } catch(e){next(e);} });
  router.post('/businesses',requireAuth(),async(req,res,next)=>{try{const org=req.body?.organizationId===undefined?req.auth!.organizationId:String(req.body.organizationId||'');if(req.auth!.role!=='super_admin'&&org!==req.auth!.organizationId)return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant discovery business creation forbidden.'}});res.status(201).json({success:true,data:await service.create({...req.body,organizationId:org||null,createdByUserId:req.auth!.userId})});}catch(e){next(e);}});
  router.patch('/businesses/:id',requireAuth(),requireTenantAccess(),async(req,res,next)=>{try{if(!(await tenantOwned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant discovery business modification forbidden.'}});res.json({success:true,data:await service.update(req.params.id,req.body)});}catch(e){next(e);}});
  router.post('/businesses/:id/submit',requireAuth(),async(req,res,next)=>{try{if(!(await tenantOwned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant submission forbidden.'}});res.json({success:true,data:await service.submit(req.params.id)});}catch(e){next(e);}});
  router.post('/businesses/:id/approve',requireAuth(),async(req,res,next)=>{try{if(req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Only platform administrators can approve listings.'}});res.json({success:true,data:await service.approve(req.params.id)});}catch(e){next(e);}});
  router.post('/businesses/:id/publish',requireAuth(),async(req,res,next)=>{try{if(req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Only platform administrators can publish listings.'}});res.json({success:true,data:await service.publish(req.params.id)});}catch(e){next(e);}});
  router.post('/businesses/:id/pause',requireAuth(),async(req,res,next)=>{try{if(!(await tenantOwned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant operation forbidden.'}});res.json({success:true,data:await service.pause(req.params.id)});}catch(e){next(e);}});
  router.post('/businesses/:id/suspend',requireAuth(),async(req,res,next)=>{try{if(req.auth!.role!=='super_admin')return res.status(403).json({success:false,error:{code:'PERMISSION_DENIED',message:'Only platform administrators can suspend listings.'}});res.json({success:true,data:await service.suspend(req.params.id)});}catch(e){next(e);}});
  router.post('/businesses/:id/archive',requireAuth(),async(req,res,next)=>{try{if(!(await tenantOwned(req,req.params.id)))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant operation forbidden.'}});res.json({success:true,data:await service.archive(req.params.id)});}catch(e){next(e);}});
  router.use((err:any,_req:Request,res:Response,next:NextFunction)=>res.headersSent?next(err):fail(res,err));
  return router;
}
