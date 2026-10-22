import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, AppError, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as notifications from './notifications.service.js';
import * as riskAlerts from './risk-alerts.service.js';
import { env } from '../../config/env.js';
import { runReminderSweep } from './reminders.service.js';
import { reconcile as reconcileDiscrepancies } from '../attendance-discrepancies/attendance-discrepancies.service.js';

export const notificationsRouter = Router();

// External Render cron endpoint: no session cookie, only a dedicated deployment secret.
notificationsRouter.post('/sweep',asyncHandler(async(req,res)=>{
  const secret=env.attendanceReconcileSecret;
  if(!secret||req.get('x-attendance-reconcile-secret')!==secret) throw new AppError(403,'FORBIDDEN','A valid scheduler credential is required.');
  const [riskAlertsResult,reminders,attendanceReconciliation]=await Promise.all([
    riskAlerts.runRiskDetectionSweep(),runReminderSweep(),reconcileDiscrepancies(),
  ]);
  ok(res,{riskAlerts:riskAlertsResult,reminders,attendanceReconciliation});
}));
notificationsRouter.use(requireAuth);

notificationsRouter.get('/summary', asyncHandler(async(req,res)=>ok(res,await riskAlerts.alertSummary(req.user))));
notificationsRouter.get('/oversight', asyncHandler(async(req,res)=>ok(res,await notifications.listAuthorizedAlerts(req.user,{
  officeId:req.query.officeId?parseId(req.query.officeId):null,category:req.query.category||null,
  severity:req.query.severity||null,status:req.query.status||'active',limit:req.query.limit===undefined?100:Number(req.query.limit),
  cursor:req.query.cursor?parseId(req.query.cursor):null,
}))));
notificationsRouter.get('/preferences', asyncHandler(async(req,res)=>ok(res,await riskAlerts.getNotificationPreferences(req.user))));
notificationsRouter.put('/preferences', asyncHandler(async(req,res)=>{
  const body=parse(z.object({emailReminders:z.boolean(),upcomingShiftReminders:z.boolean()}),req.body??{});
  ok(res,await riskAlerts.updateNotificationPreferences(req.user,body));
}));
notificationsRouter.get('/policy', asyncHandler(async(req,res)=>{
  if(req.user.role!=='admin') throw new AppError(403,'FORBIDDEN','Only institution administrators can view alert rules.');
  ok(res,{policy:await riskAlerts.getAlertPolicy(req.user)});
}));
notificationsRouter.put('/policy', asyncHandler(async(req,res)=>{
  if(req.user.role!=='admin') throw new AppError(403,'FORBIDDEN','Only institution administrators can update alert rules.');
  const categories=['completion_risk','deadline','upcoming_shift','attendance','missed_shift','recovery','transition','schedule_conflict','dtr','absence','compliance','documents','semester_requirement'];
  const body=parse(z.object({completionRiskWarningDays:z.number().int().min(1).max(180),criticalCompletionRiskDays:z.number().int().min(0).max(30),deadlineReminderDays:z.array(z.number().int().min(0).max(180)).min(1).max(10),
    upcomingShiftReminderHours:z.number().int().min(1).max(168),notificationCooldownHours:z.number().int().min(1).max(720),
    enabledCategories:z.array(z.enum(categories)).min(1).max(categories.length),emailEnabled:z.boolean(),emailMinimumSeverity:z.enum(['informational','warning','critical']),
    escalationAfterHours:z.number().int().min(1).max(720)}),req.body??{});
  ok(res,{policy:await riskAlerts.updateAlertPolicy(req.user,body)});
}));


notificationsRouter.get('/', asyncHandler(async (req, res) => {
  ok(res, await notifications.listNotifications(req.user, req.query.filter ?? 'all',{
    limit:req.query.limit===undefined?50:Number(req.query.limit),cursor:req.query.cursor?parseId(req.query.cursor):null,
  }));
}));

notificationsRouter.patch('/read-all', asyncHandler(async (req, res) => {
  ok(res, await notifications.markAllRead(req.user));
}));

notificationsRouter.patch('/:id/read', asyncHandler(async (req, res) => {
  ok(res, { notification: await notifications.markRead(req.user, parseId(req.params.id)) });
}));

notificationsRouter.patch('/:id/dismiss', asyncHandler(async (req, res) => {
  ok(res, await notifications.dismissNotification(req.user, parseId(req.params.id)));
}));

notificationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  ok(res, await notifications.deleteNotification(req.user, parseId(req.params.id)));
}));
