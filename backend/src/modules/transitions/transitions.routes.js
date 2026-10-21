import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import * as transitions from './transitions.service.js';

export const transitionsRouter=Router();
transitionsRouter.use(requireAuth,requireRole('admin'));
transitionsRouter.get('/overview',asyncHandler(async(req,res)=>{
  const input=parse(z.object({termId:z.string().uuid(),destinationTermId:z.string().uuid().optional(),page:z.coerce.number().int().min(1).optional(),limit:z.coerce.number().int().min(1).max(50).optional(),search:z.string().trim().max(100).optional()}),req.query);
  ok(res,await transitions.overview({actor:req.user,...input}));
}));
transitionsRouter.get('/history',asyncHandler(async(req,res)=>ok(res,{transitions:await transitions.history({actor:req.user})})));
transitionsRouter.put('/policy',asyncHandler(async(req,res)=>{
  const body=parse(z.object({policy:z.literal('keep_original')}),req.body??{});
  ok(res,{policy:await transitions.setPolicy({actor:req.user,...body,ip:req.ip})});
}));
transitionsRouter.post('/preview',asyncHandler(async(req,res)=>{
  const body=parse(z.object({sourceTermId:z.string().uuid(),destinationTermId:z.string().uuid(),studentIds:z.array(z.string().uuid()).max(100)}),req.body??{});
  ok(res,{preview:await transitions.preview({actor:req.user,...body,ip:req.ip})},201);
}));
transitionsRouter.post('/:transitionId/finalize',asyncHandler(async(req,res)=>ok(res,{transition:await transitions.finalize({actor:req.user,id:parseId(req.params.transitionId),ip:req.ip})})));
transitionsRouter.post('/:transitionId/cancel',asyncHandler(async(req,res)=>ok(res,{transition:await transitions.cancel({actor:req.user,id:parseId(req.params.transitionId),ip:req.ip})})));
