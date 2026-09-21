import express, { Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { DiscoveryBusinessRepository } from '../repositories/discoveryBusinessRepository.ts';
import { DiscoveryBusinessService } from '../services/discoveryBusinessService.ts';
import { requireAuth } from '../middleware/auth.ts';
import { assertBusinessPermission, type DiscoveryBusinessPermission } from '../services/discoveryBusinessAccess.ts';
import { AuditRepository } from '../repositories/auditRepository.ts';

export function createDiscoveryBusinessRouter(db: DatabaseClient) {
  const router = express.Router(); const repo = new DiscoveryBusinessRepository(db); const service = new DiscoveryBusinessService(repo, db);
  const actor=(req:Request)=>({userId:req.auth!.userId,role:req.auth!.role,organizationId:req.auth!.organizationId});
  const auditRepository = new AuditRepository(db);
  const owned=async(req:Request,id:string,permission:DiscoveryBusinessPermission='business.listing.manage')=>{if(req.auth?.role==='super_admin')return true;try{await assertBusinessPermission(db,id,req.auth!.userId,permission);return true;}catch(error){try{await auditRepository.recordEvent({organization_id:req.auth!.organizationId,actor_id:req.auth!.userId,actor_name:req.auth!.email||req.auth!.userId,actor_role:req.auth!.role,action:'DISCOVERY_AUTHORIZATION_DENIED',entity_type:'DISCOVERY_BUSINESS',entity_id:id,metadata:{permission,path:req.originalUrl,method:req.method,reason:String((error as Error)?.message||'PERMISSION_DENIED')},severity:'High',result:'DENIED'});}catch(auditError){console.warn('[Audit] Discovery authorization denial log failed:',auditError);}return false;}};
  const fail=(res:Response,err:any)=>{const message=String(err?.message||'Discovery request failed.');const code=message.split(':')[0];const status=['NOT_FOUND','DISCOVERY_BUSINESS_NOT_FOUND'].includes(code)?404:['PERMISSION_DENIED','INACTIVE_ORGANIZATION','TENANT_ACCESS_DENIED'].includes(code)?403:code.startsWith('VALIDATION_ERROR')?422:['INVALID_STATE_TRANSITION','DISCOVERY_INVALID_LIFECYCLE'].includes(code)?409:400;return res.status(status).json({success:false,error:{code,message:message.includes(':')?message.slice(message.indexOf(':')+1).trim():message}});};
  router.get('/businesses',async(req,res,next)=>{try{const data=await service.listPublished({city:typeof req.query.city==='string'?req.query.city:undefined,district:typeof req.query.district==='string'?req.query.district:undefined,region:typeof req.query.region==='string'?req.query.region:undefined,businessType:typeof req.query.businessType==='string'?req.query.businessType:undefined,categoryId:typeof req.query.categoryId==='string'?req.query.categoryId:undefined,limit:typeof req.query.limit==='string'?Number(req.query.limit):undefined,offset:typeof req.query.offset==='string'?Number(req.query.offset):undefined});res.json({success:true,count:data.length,data});}catch(e){next(e);}});
  router.get('/businesses/my',requireAuth(),async(req,res,next)=>{try{const result=await db.query(`SELECT b.*,m.role AS membership_role FROM discovery_businesses b JOIN discovery_business_memberships m ON m.business_id=b.id WHERE m.user_id=$1 AND m.is_active=TRUE ORDER BY b.created_at DESC`,[req.auth!.userId]);res.json({success:true,count:result.rows.length,data:result.rows});}catch(e){next(e);}});
  router.get('/businesses/:slug',async(req,res,next)=>{try{const b=await service.getBySlug(req.params.slug,true);if(!b)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Business listing not found.'}});res.json({success:true,data:await service.getPublicProfile(b.id)});}catch(e){next(e);}});
  router.post('/businesses',requireAuth(),async(req,res,next)=>{try{
    const businessMode=req.body?.businessMode==='DISCOVERY_AND_STORE'?'DISCOVERY_AND_STORE':'DISCOVERY_ONLY';
    const requestedOrganizationId=req.body?.organizationId===undefined?null:String(req.body.organizationId||'').trim()||null;
    if(businessMode==='DISCOVERY_ONLY'){
      if(requestedOrganizationId && req.auth!.role!=='super_admin'){
        return res.status(422).json({success:false,error:{code:'VALIDATION_ERROR',message:'Discovery-only businesses cannot be attached to an organization.'}});
      }
    }else{
      const organizationId=req.auth!.organizationId;
      if(!organizationId)return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'An active organization is required for Discovery + Store businesses.'}});
      if(requestedOrganizationId && requestedOrganizationId!==organizationId && req.auth!.role!=='super_admin'){
        return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant discovery business creation forbidden.'}});
      }
    }
    const organizationId=businessMode==='DISCOVERY_AND_STORE' ? (req.auth!.organizationId || requestedOrganizationId) : null;
    const data=await service.create({...req.body,businessMode,organizationId,createdByUserId:req.auth!.userId},actor(req));
    res.status(201).json({
      success: true,
      data: {
        ...data,
        organization_id: data.organization_id ?? null,
        organizationId: data.organization_id ?? null,
      },
    });
  }catch(e){next(e);}});
  // Discovery-only listings have no tenant, so tenant middleware must not block their owner from editing.
  // The service remains authoritative for ownership and organization-attachment authorization.
  router.patch('/businesses/:id',requireAuth(),async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.listing.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant discovery business modification forbidden.'}});res.json({success:true,data:await service.update(req.params.id,req.body,actor(req))});}catch(e){next(e);}});
  router.post('/businesses/:id/submit',requireAuth(),async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.listing.submit')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant submission forbidden.'}});res.json({success:true,data:await service.submit(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.get('/businesses/:id/management',requireAuth(),async(req,res,next)=>{try{res.json({success:true,data:await service.getListingManagementWorkspace(req.params.id,actor(req))});}catch(e){next(e);}});
  router.post('/businesses/:id/resubmit',requireAuth(),async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.listing.submit')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant resubmission forbidden.'}});res.json({success:true,data:await service.resubmit(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});

  router.post('/businesses/:id/approve',requireAuth(),async(req,res,next)=>{try{res.json({success:true,data:await service.approve(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.post('/businesses/:id/publish',requireAuth(),async(req,res,next)=>{try{res.json({success:true,data:await service.publish(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.post('/businesses/:id/pause',requireAuth(),async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.listing.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant operation forbidden.'}});res.json({success:true,data:await service.pause(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.post('/businesses/:id/suspend',requireAuth(),async(req,res,next)=>{try{res.json({success:true,data:await service.suspend(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.post('/businesses/:id/archive',requireAuth(),async(req,res,next)=>{try{if(!(await owned(req,req.params.id,'business.listing.manage')))return res.status(403).json({success:false,error:{code:'TENANT_ACCESS_DENIED',message:'Cross-tenant operation forbidden.'}});res.json({success:true,data:await service.archive(req.params.id,actor(req),req.body?.reason)});}catch(e){next(e);}});
  router.use((err:any,_req:Request,res:Response,next:NextFunction)=>res.headersSent?next(err):fail(res,err)); return router;
}
