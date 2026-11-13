import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {requireAuth,requireRole} from '../../middleware/auth.js';
import {AppError,asyncHandler,ok} from '../../utils/response.js';
import {parse,parseId} from '../../utils/validate.js';
import {institutionInput,invitationInput,tokenInput,acceptInput} from './platform.rules.js';
import * as platform from './platform.service.js';
import * as account from './account.service.js';

export const platformRouter=Router();
platformRouter.use(requireAuth,requireRole('superadmin'));
platformRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const accountLimiter=rateLimit({windowMs:15*60*1000,limit:10,keyGenerator:req=>req.user.id,standardHeaders:'draft-7',legacyHeaders:false,
  handler:(_req,_res,next)=>next(new AppError(429,'RATE_LIMITED','Too many account change attempts. Please wait and try again.'))});
platformRouter.get('/account',asyncHandler(async(req,res)=>ok(res,await account.accountSettings(req.user))));
platformRouter.post('/account/password',accountLimiter,asyncHandler(async(req,res)=>ok(res,await account.changePassword({actor:req.user,input:parse(account.passwordChangeSchema,req.body),sessionToken:req.sessionToken,ip:req.ip}))));
platformRouter.post('/account/email',accountLimiter,asyncHandler(async(req,res)=>ok(res,await account.requestEmailChange({actor:req.user,input:parse(account.emailChangeSchema,req.body),ip:req.ip}))));
platformRouter.post('/account/email/confirm',accountLimiter,asyncHandler(async(req,res)=>ok(res,await account.confirmEmailChange({actor:req.user,input:parse(account.emailConfirmSchema,req.body),sessionToken:req.sessionToken,ip:req.ip}))));
platformRouter.post('/account/email/cancel',accountLimiter,asyncHandler(async(req,res)=>ok(res,await account.cancelEmailChange(req.user,{ip:req.ip}))));
platformRouter.get('/institutions',asyncHandler(async(req,res)=>ok(res,await platform.listInstitutions(req.user))));
platformRouter.post('/institutions',asyncHandler(async(req,res)=>ok(res,await platform.createInstitution({actor:req.user,input:parse(institutionInput,req.body),ip:req.ip}),201)));
platformRouter.post('/institutions/:institutionId/invitations',asyncHandler(async(req,res)=>ok(res,await platform.inviteInstitutionAdmin({actor:req.user,institutionId:parseId(req.params.institutionId),input:parse(invitationInput,req.body),ip:req.ip}),201)));
platformRouter.post('/invitations/:invitationId/revoke',asyncHandler(async(req,res)=>ok(res,await platform.revokeInvitation({actor:req.user,invitationId:parseId(req.params.invitationId),ip:req.ip}))));

export const invitationsRouter=Router();
invitationsRouter.use(rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,
  handler:(_req,_res,next)=>next(new AppError(429,'RATE_LIMITED','Too many invitation attempts. Please wait and try again.'))}));
invitationsRouter.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('Referrer-Policy','no-referrer');next();});
invitationsRouter.post('/verify',asyncHandler(async(req,res)=>{const {token}=parse(tokenInput,req.body);ok(res,await platform.inspectInvitation(token));}));
invitationsRouter.post('/accept',asyncHandler(async(req,res)=>{
  if(req.user) throw new AppError(409,'SIGN_OUT_REQUIRED','Sign out of your current account before accepting this invitation.');
  ok(res,await platform.acceptInvitation({input:parse(acceptInput,req.body),ip:req.ip}),201);
}));
