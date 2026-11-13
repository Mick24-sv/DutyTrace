import express,{Router} from 'express';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {requireAuth,requireRole} from '../../middleware/auth.js';
import {asyncHandler,ok,AppError} from '../../utils/response.js';
import {parse,parseId} from '../../utils/validate.js';
import {reportInput,updateInput} from './problem-reports.rules.js';
import * as reports from './problem-reports.service.js';
export const problemReportsRouter=Router();
problemReportsRouter.use(requireAuth);
problemReportsRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const reporters=requireRole('admin','supervisor','student');
const limiter=rateLimit({windowMs:15*60*1000,limit:10,keyGenerator:req=>req.user.id,standardHeaders:'draft-7',legacyHeaders:false,
 handler:(_req,_res,next)=>next(new AppError(429,'RATE_LIMITED','Too many reports. Please wait before submitting another.'))});
problemReportsRouter.get('/mine',reporters,asyncHandler(async(req,res)=>ok(res,await reports.myReports(req.user))));
problemReportsRouter.post('/',reporters,limiter,asyncHandler(async(req,res)=>ok(res,await reports.createReport({actor:req.user,input:parse(reportInput,req.body),userAgent:req.get('user-agent'),ip:req.ip}),201)));
problemReportsRouter.get('/summary',requireRole('superadmin'),asyncHandler(async(req,res)=>ok(res,await reports.inboxSummary(req.user))));
problemReportsRouter.get('/',requireRole('superadmin'),asyncHandler(async(req,res)=>{
 const input=parse(z.object({status:z.enum(['','new','investigating','resolved']).default(''),search:z.string().max(100).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}),req.query);
 ok(res,await reports.inbox(req.user,input));
}));
problemReportsRouter.patch('/:id',requireRole('superadmin'),asyncHandler(async(req,res)=>ok(res,await reports.updateReport({actor:req.user,id:parseId(req.params.id),input:parse(updateInput,req.body),ip:req.ip}))));
problemReportsRouter.post('/:id/screenshot',reporters,limiter,express.raw({type:'application/octet-stream',limit:reports.MAX_SCREENSHOT,inflate:false}),asyncHandler(async(req,res)=>{
 const fileName=parse(z.string().min(1).max(255),req.query.filename);
 ok(res,await reports.attachScreenshot({actor:req.user,id:parseId(req.params.id),buffer:req.body,fileName,ip:req.ip}),201);
}));
problemReportsRouter.get('/:id/screenshot',requireRole('admin','supervisor','student','superadmin'),asyncHandler(async(req,res)=>{
 const file=await reports.screenshotFor(req.user,parseId(req.params.id));res.set('X-Content-Type-Options','nosniff');res.set('Content-Disposition','inline');res.type(file.mime).send(file.buffer);
}));
