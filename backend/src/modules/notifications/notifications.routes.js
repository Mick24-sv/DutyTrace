import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parseId } from '../../utils/validate.js';
import * as notifications from './notifications.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, await notifications.listNotifications(req.user, req.query.filter ?? 'all'));
}));

notificationsRouter.patch('/read-all', asyncHandler(async (req, res) => {
  ok(res, await notifications.markAllRead(req.user));
}));

notificationsRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  ok(res, { notification: await notifications.markRead(req.user, parseId(req.params.id)) });
}));

notificationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  ok(res, await notifications.deleteNotification(req.user, parseId(req.params.id)));
}));
