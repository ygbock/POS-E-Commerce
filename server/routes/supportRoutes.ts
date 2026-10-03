import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseClient } from '../db/client.ts';
import { requireAuth, requirePermission, requirePlatformPermission, requireTenantAccess } from '../middleware/auth.ts';
import { PERMISSIONS } from '../auth/roles.ts';
import { SupportService } from '../services/supportService.ts';

function responseError(res: Response, err: any) {
  const message = String(err?.message || '');
  const map: Record<string, { status: number; code: string; message: string }> = {
    INVALID_TICKET_PAYLOAD: { status: 422, code: 'INVALID_TICKET_PAYLOAD', message: 'Subject and description are required.' },
    INVALID_TICKET_PRIORITY: { status: 422, code: 'INVALID_TICKET_PRIORITY', message: 'Invalid support ticket priority.' },
    INVALID_TICKET_MESSAGE: { status: 422, code: 'INVALID_TICKET_MESSAGE', message: 'Message body is required.' },
    INVALID_TICKET_STATUS: { status: 422, code: 'INVALID_TICKET_STATUS', message: 'Invalid support ticket status.' },
    TICKET_NOT_FOUND: { status: 404, code: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' },
    NOTIFICATION_NOT_FOUND: { status: 404, code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found.' },
  };
  const mapped = map[message];
  if (mapped) return res.status(mapped.status).json({ success: false, error: { code: mapped.code, message: mapped.message } });
  return res.status(500).json({ success: false, error: { code: 'SUPPORT_ERROR', message: 'Unable to process support request.' } });
}

export function createSupportRouter(db: DatabaseClient): Router {
  const router = Router();
  const service = new SupportService(db);

  router.get('/tickets', requireAuth(), requireTenantAccess(), requirePermission(PERMISSIONS.SUPPORT_VIEW), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await service.listTickets({ organizationId: req.auth!.organizationId, status: typeof req.query.status === 'string' ? req.query.status : undefined, assignedToUserId: typeof req.query.assignedToUserId === 'string' ? req.query.assignedToUserId : undefined, limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 });
      return res.json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.post('/tickets', requireAuth(), requireTenantAccess(), requirePermission(PERMISSIONS.SUPPORT_CREATE), async (req: Request, res: Response) => {
    try {
      const data = await service.createTicket({ organizationId: req.auth!.organizationId, createdByUserId: req.auth!.userId, subject: req.body?.subject, description: req.body?.description, category: req.body?.category, priority: req.body?.priority, metadata: req.body?.metadata });
      return res.status(201).json({ success: true, data });
    } catch (err) { return responseError(res, err); }
  });

  router.get('/tickets/:ticketId', requireAuth(), requireTenantAccess(), requirePermission(PERMISSIONS.SUPPORT_VIEW), async (req: Request, res: Response) => {
    try {
      const data = await service.getTicket(req.params.ticketId, req.auth!.organizationId);
      if (!data) return res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' } });
      return res.json({ success: true, data });
    } catch (err) { return responseError(res, err); }
  });

  router.post('/tickets/:ticketId/messages', requireAuth(), requireTenantAccess(), requirePermission(PERMISSIONS.SUPPORT_REPLY), async (req: Request, res: Response) => {
    try {
      const ticket = await service.getTicket(req.params.ticketId, req.auth!.organizationId);
      if (!ticket) return res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' } });
      if (ticket.created_by_user_id !== req.auth!.userId) return res.status(403).json({ success: false, error: { code: 'SUPPORT_REPLY_DENIED', message: 'Only the ticket creator can reply from the tenant workspace.' } });
      return res.status(201).json({ success: true, data: await service.addMessage(req.params.ticketId, req.auth!.userId, req.body?.body, false) });
    } catch (err) { return responseError(res, err); }
  });

  router.get('/platform/tickets', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await service.listTickets({ organizationId: typeof req.query.organizationId === 'string' ? req.query.organizationId : undefined, status: typeof req.query.status === 'string' ? req.query.status : undefined, assignedToUserId: typeof req.query.assignedToUserId === 'string' ? req.query.assignedToUserId : undefined, limit: Number(req.query.limit) || 50, offset: Number(req.query.offset) || 0 });
      return res.json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.get('/platform/tickets/:ticketId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (req: Request, res: Response) => {
    try {
      const data = await service.getTicket(req.params.ticketId);
      if (!data) return res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' } });
      return res.json({ success: true, data });
    } catch (err) { return responseError(res, err); }
  });

  router.patch('/platform/tickets/:ticketId', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (req: Request, res: Response) => {
    try {
      const data = await service.updateTicket(req.params.ticketId, { status: req.body?.status, priority: req.body?.priority, assignedToUserId: req.body?.assignedToUserId }, req.auth!.userId);
      return res.json({ success: true, data });
    } catch (err) { return responseError(res, err); }
  });

  router.post('/platform/tickets/:ticketId/messages', requireAuth(), requirePlatformPermission(PERMISSIONS.PLATFORM_SUPPORT), async (req: Request, res: Response) => {
    try {
      const ticket = await service.getTicket(req.params.ticketId);
      if (!ticket) return res.status(404).json({ success: false, error: { code: 'TICKET_NOT_FOUND', message: 'Support ticket not found.' } });
      return res.status(201).json({ success: true, data: await service.addMessage(req.params.ticketId, req.auth!.userId, req.body?.body, false) });
    } catch (err) { return responseError(res, err); }
  });

  router.get('/notifications', requireAuth(), async (req: Request, res: Response, next: NextFunction) => {
    try { return res.json({ success: true, data: await service.listNotifications(req.auth!.userId, { unreadOnly: String(req.query.unreadOnly).toLowerCase() === 'true', limit: Number(req.query.limit) || 50 }) }); }
    catch (err) { next(err); }
  });

  router.post('/notifications/:notificationId/read', requireAuth(), async (req: Request, res: Response) => {
    try { return res.json({ success: true, data: await service.markNotificationRead(req.auth!.userId, req.params.notificationId) }); }
    catch (err) { return responseError(res, err); }
  });

  router.post('/notifications/read-all', requireAuth(), async (req: Request, res: Response) => {
    try { return res.json({ success: true, data: await service.markAllNotificationsRead(req.auth!.userId) }); }
    catch (err) { return responseError(res, err); }
  });

  return router;
}
