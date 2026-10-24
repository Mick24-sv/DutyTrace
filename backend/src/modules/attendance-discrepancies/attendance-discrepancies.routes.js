import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { asyncHandler, AppError, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as discrepancies from './attendance-discrepancies.service.js';

export const attendanceDiscrepanciesRouter=Router();
// External scheduled job runs without a browser session and authenticates with a
// dedicated server secret. It reconciles every institution and accepts no scope from the caller.
attendanceDiscrepanciesRouter.post('/reconcile',asyncHandler(async(req,res)=>{
  const secret=env.attendanceReconcileSecret;
  if(!secret||req.get('x-attendance-reconcile-secret')!==secret) throw new AppError(403,'FORBIDDEN','A valid reconciliation credential is required.');
  ok(res,await discrepancies.reconcile());
}));
attendanceDiscrepanciesRouter.use(requireAuth);
const text=(max)=>z.string().trim().min(1).max(max);
const status=z.enum(['open','explanation_submitted','under_review','approved_correction','rejected','resolved','cancelled','superseded']).optional();
const type=z.enum(['scheduled_no_attendance','missing_clock_out','outside_assigned_shift','duplicate_or_overlap']).optional();
const querySchema=z.object({status,type,date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),search:z.string().trim().max(120).optional(),limit:z.coerce.number().int().min(1).max(200).optional(),page:z.coerce.number().int().min(1).max(100000).optional()});
const event=z.object({eventType:z.enum(['time_in','time_out']),recordedAt:z.string().datetime({offset:true}),officeId:z.string().uuid().optional()});
const id=req=>parseId(req.params.id);
const correctionLimiter=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false,
  handler:(_req,_res,next)=>next(new AppError(429,'RATE_LIMITED','Too many attendance submissions. Please try again later.'))});

attendanceDiscrepanciesRouter.get('/summary',requireRole('student','supervisor','admin'),asyncHandler(async(req,res)=>ok(res,await discrepancies.summary(req.user))));
attendanceDiscrepanciesRouter.get('/',requireRole('student','supervisor','admin'),asyncHandler(async(req,res)=>{
  const f=parse(querySchema,req.query);ok(res,await discrepancies.list({user:req.user,...f}));
}));
attendanceDiscrepanciesRouter.get('/:id',requireRole('student','supervisor','admin'),asyncHandler(async(req,res)=>ok(res,await discrepancies.detail({user:req.user,id:id(req)}))));
attendanceDiscrepanciesRouter.post('/clear-pre-qr',requireRole('supervisor','admin'),asyncHandler(async(req,res)=>
  ok(res,await discrepancies.clearPreQrDiscrepancies({user:req.user,ip:req.ip}))));
attendanceDiscrepanciesRouter.post('/:id/explanation',requireRole('student'),correctionLimiter,asyncHandler(async(req,res)=>{
  const b=parse(z.object({explanation:text(3000)}),req.body??{});
  ok(res,await discrepancies.explain({user:req.user,id:id(req),explanation:b.explanation,ip:req.ip}));
}));
attendanceDiscrepanciesRouter.post('/:id/correction-request',requireRole('student'),correctionLimiter,asyncHandler(async(req,res)=>{
  const b=parse(z.object({explanation:text(3000),events:z.array(event).length(2),replacesEventIds:z.array(z.string().uuid()).max(4).default([])}),req.body??{});
  ok(res,await discrepancies.explain({user:req.user,id:id(req),explanation:b.explanation,correction:{events:b.events,replacesEventIds:b.replacesEventIds},ip:req.ip}),201);
}));
attendanceDiscrepanciesRouter.post('/:id/start-review',requireRole('supervisor'),asyncHandler(async(req,res)=>{
  const b=parse(z.object({remarks:z.string().trim().max(2000).optional()}),req.body??{});
  ok(res,await discrepancies.startReview({user:req.user,id:id(req),remarks:b.remarks??'',ip:req.ip}));
}));
attendanceDiscrepanciesRouter.post('/:id/clarification',requireRole('supervisor'),asyncHandler(async(req,res)=>{
  const b=parse(z.object({remarks:text(2000)}),req.body??{});
  ok(res,await discrepancies.requestClarification({user:req.user,id:id(req),remarks:b.remarks,ip:req.ip}));
}));
attendanceDiscrepanciesRouter.post('/:id/approve',requireRole('supervisor'),asyncHandler(async(req,res)=>{
  const b=parse(z.object({remarks:text(2000)}),req.body??{});
  ok(res,await discrepancies.approve({user:req.user,id:id(req),remarks:b.remarks,ip:req.ip}));
}));
attendanceDiscrepanciesRouter.post('/:id/reject',requireRole('supervisor'),asyncHandler(async(req,res)=>{
  const b=parse(z.object({remarks:text(2000)}),req.body??{});
  ok(res,await discrepancies.reject({user:req.user,id:id(req),remarks:b.remarks,ip:req.ip}));
}));
attendanceDiscrepanciesRouter.post('/:id/resolve',requireRole('supervisor'),asyncHandler(async(req,res)=>{
  const b=parse(z.object({remarks:text(2000)}),req.body??{});
  ok(res,await discrepancies.resolve({user:req.user,id:id(req),remarks:b.remarks,ip:req.ip}));
}));

