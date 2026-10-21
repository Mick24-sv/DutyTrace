import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as recovery from './recovery.service.js';

const route = Router(); route.use(requireAuth);
route.get('/mine', requireRole('student'), asyncHandler(async(req,res)=>ok(res,{plans:await recovery.mine(req.user)})));
route.get('/suggestions', requireRole('student'), asyncHandler(async(req,res)=>ok(res,await recovery.suggestions({user:req.user,termId:req.query.termId?parseId(req.query.termId):null}))));
route.post('/', requireRole('student'), asyncHandler(async(req,res)=>{
  const body=parse(z.object({termId:z.string().uuid(),slots:z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),startsAt:z.string().regex(/^\d{2}:\d{2}$/),endsAt:z.string().regex(/^\d{2}:\d{2}$/)})).min(1).max(40)}).refine(({slots})=>new Set(slots.map(s=>`${s.date}|${s.startsAt}|${s.endsAt}`)).size===slots.length,'Recovery shifts must be unique.'),req.body??{});
  ok(res,{plan:await recovery.submit({user:req.user,...body,ip:req.ip})},201);
}));
route.post('/:planId/withdraw',requireRole('student'),asyncHandler(async(req,res)=>ok(res,{plan:await recovery.withdraw({user:req.user,id:parseId(req.params.planId),ip:req.ip})})));
route.get('/review',requireRole('admin','supervisor'),asyncHandler(async(req,res)=>ok(res,{plans:await recovery.queue(req.user)})));
route.post('/review/:planId/decision',requireRole('admin','supervisor'),asyncHandler(async(req,res)=>{
  const body=parse(z.object({decision:z.enum(['approve','reject']),reason:z.string().trim().max(1000).optional()}),req.body??{});
  ok(res,{plan:await recovery.decide({actor:req.user,id:parseId(req.params.planId),...body,ip:req.ip})});
}));
export const recoveryRouter=route;
