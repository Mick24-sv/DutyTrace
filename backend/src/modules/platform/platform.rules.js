import { z } from 'zod';
import crypto from 'node:crypto';
import { AppError } from '../../utils/response.js';
import { MIN_PASSWORD_LENGTH } from '../../utils/password.js';

export const invitationInput = z.object({
  fullName:z.string().trim().min(1).max(120),
  email:z.string().trim().toLowerCase().pipe(z.email()),
}).strict();
export const institutionInput = z.object({
  name:z.string().trim().min(2).max(160),
  shortName:z.string().trim().max(30).default(''),
  type:z.enum(['university','college']),
  address:z.string().trim().min(3).max(500),
  city:z.string().trim().min(2).max(100).default('Naga City'),
  contactEmail:z.string().trim().toLowerCase().pipe(z.email()),
  timezone:z.string().refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Choose a valid timezone.').default('Asia/Manila'),
  admin:invitationInput,
}).strict();
export const tokenInput=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/,'This invitation link is invalid.')}).strict();
export const acceptInput=tokenInput.extend({password:z.string().min(MIN_PASSWORD_LENGTH).max(200)});
export const tokenHash=token=>crypto.createHash('sha256').update(token).digest('hex');
export function requireSuperadmin(actor) {
  if(actor?.role!=='superadmin') throw new AppError(403,'FORBIDDEN','Only the platform maintainer can manage institutions.');
}
export function validateInvitation(invitation,now=new Date()) {
  if(!invitation||invitation.accepted_at||invitation.revoked_at||new Date(invitation.expires_at)<=now) {
    throw new AppError(400,'INVALID_INVITATION','This invitation is invalid, expired, or already used. Ask the DutyTrace maintainer for a new invitation.');
  }
}
