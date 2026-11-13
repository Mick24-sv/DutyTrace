import crypto from 'node:crypto';
import {z} from 'zod';
import {query,withTransaction} from '../../db/pool.js';
import {AppError} from '../../utils/response.js';
import {hashPassword,verifyPassword,MIN_PASSWORD_LENGTH} from '../../utils/password.js';
import {recordAudit} from '../audit/audit.service.js';
import {appUrl,emailConfigured,sendAccountEmailVerification} from '../auth/email.service.js';
import {requireSuperadmin,tokenHash} from './platform.rules.js';

const password=z.string().min(1).max(200);
export const passwordChangeSchema=z.object({currentPassword:password,newPassword:z.string().min(MIN_PASSWORD_LENGTH).max(200)}).strict();
export const emailChangeSchema=z.object({currentPassword:password,newEmail:z.string().trim().toLowerCase().pipe(z.email())}).strict();
export const emailConfirmSchema=z.object({currentPassword:password,token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
const invalid=()=>new AppError(400,'INVALID_VERIFICATION','This verification link is expired, replaced, or already used. Request a new email change.');
async function authenticatedRow(db,actor,currentPassword) {
  requireSuperadmin(actor);
  const {rows:[user]}=await db.query("SELECT * FROM users WHERE id=$1 AND role='superadmin' AND status='active' FOR UPDATE",[actor.id]);
  if(!user||!await verifyPassword(currentPassword,user.password_hash)) throw new AppError(400,'INCORRECT_PASSWORD','Your current password is incorrect.');
  return user;
}
async function revokeOtherSessions(db,userId,sessionToken) {
  if(!sessionToken) throw new AppError(401,'UNAUTHENTICATED','Please sign in again.');
  await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL',[userId,tokenHash(sessionToken)]);
}
export async function accountSettings(actor,db={query}) {
  requireSuperadmin(actor);
  const {rows:[pending]}=await db.query(`SELECT new_email AS "newEmail",expires_at AS "expiresAt",sent_at AS "sentAt"
    FROM account_email_changes WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,[actor.id]);
  return {email:actor.email,fullName:actor.fullName,emailConfigured:emailConfigured(),pendingEmail:pending??null};
}
export async function changePassword({actor,input,sessionToken,ip},{transaction=withTransaction}={}) {
  requireSuperadmin(actor);input=passwordChangeSchema.parse(input);
  return transaction(async db=>{
    const user=await authenticatedRow(db,actor,input.currentPassword);
    if(await verifyPassword(input.newPassword,user.password_hash)) throw new AppError(400,'SAME_PASSWORD','Choose a password different from your current password.');
    await db.query('UPDATE users SET password_hash=$2,failed_login_count=0,locked_until=NULL WHERE id=$1',[user.id,await hashPassword(input.newPassword)]);
    await db.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await db.query('UPDATE account_email_changes SET revoked_at=now() WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL',[user.id]);
    await revokeOtherSessions(db,user.id,sessionToken);
    await recordAudit({actorId:user.id,action:'platform.password_changed',targetType:'user',targetId:user.id,ip},db);
    return {changed:true};
  });
}
export async function requestEmailChange({actor,input,ip},{transaction=withTransaction,db={query},send=sendAccountEmailVerification,configured=emailConfigured()}={}) {
  requireSuperadmin(actor);input=emailChangeSchema.parse(input);
  if(!configured) throw new AppError(503,'EMAIL_NOT_CONFIGURED','Email delivery must be configured before changing your email address.');
  const rawToken=crypto.randomBytes(32).toString('base64url');
  const issued=await transaction(async client=>{
    const user=await authenticatedRow(client,actor,input.currentPassword);
    if(user.email===input.newEmail) throw new AppError(400,'SAME_EMAIL','Enter a different email address.');
    const {rows:existing}=await client.query('SELECT id FROM users WHERE email=$1',[input.newEmail]);
    if(existing.length) throw new AppError(409,'EMAIL_IN_USE','This email is already used by another account.');
    const {rows:reserved}=await client.query(`SELECT id FROM institution_admin_invitations WHERE email=$1
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,[input.newEmail]);
    if(reserved.length) throw new AppError(409,'EMAIL_IN_USE','This email has an outstanding institution invitation.');
    await client.query('UPDATE account_email_changes SET revoked_at=now() WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL',[user.id]);
    const {rows:[row]}=await client.query(`INSERT INTO account_email_changes(user_id,new_email,token_hash,credential_fingerprint,expires_at)
      VALUES($1,$2,$3,$4,now()+interval '30 minutes') RETURNING id`,[user.id,input.newEmail,tokenHash(rawToken),tokenHash(user.password_hash)]);
    await recordAudit({actorId:user.id,action:'platform.email_change_requested',targetType:'user',targetId:user.id,after:{newEmail:input.newEmail},ip},client);
    return row;
  });
  try {
    await send({to:input.newEmail,verifyUrl:`${appUrl}/superadmin/account#verify=${rawToken}`});
  } catch {
    await db.query('UPDATE account_email_changes SET revoked_at=now() WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL',[issued.id]);
    throw new AppError(503,'EMAIL_DELIVERY_FAILED','The verification email could not be sent. Your current email is unchanged. Please try again.');
  }
  await db.query('UPDATE account_email_changes SET sent_at=now() WHERE id=$1 AND revoked_at IS NULL AND used_at IS NULL',[issued.id]);
  return {sent:true,newEmail:input.newEmail};
}
export async function confirmEmailChange({actor,input,sessionToken,ip},{transaction=withTransaction}={}) {
  requireSuperadmin(actor);input=emailConfirmSchema.parse(input);
  try{return await transaction(async db=>{
    const user=await authenticatedRow(db,actor,input.currentPassword);
    const {rows:[request]}=await db.query(`SELECT * FROM account_email_changes WHERE user_id=$1 AND token_hash=$2
      AND used_at IS NULL AND revoked_at IS NULL AND sent_at IS NOT NULL AND expires_at>now() FOR UPDATE`,[user.id,tokenHash(input.token)]);
    if(!request||request.credential_fingerprint!==tokenHash(user.password_hash)) throw invalid();
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`institution-admin-email:${request.new_email}`]);
    const {rows:reserved}=await db.query(`SELECT id FROM institution_admin_invitations WHERE email=$1
      AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()`,[request.new_email]);
    if(reserved.length) throw new AppError(409,'EMAIL_IN_USE','This email has an outstanding institution invitation.');
    await db.query('UPDATE users SET email=$2 WHERE id=$1',[user.id,request.new_email]);
    await db.query('UPDATE account_email_changes SET used_at=now() WHERE id=$1',[request.id]);
    await db.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[user.id]);
    await revokeOtherSessions(db,user.id,sessionToken);
    await recordAudit({actorId:user.id,action:'platform.email_changed',targetType:'user',targetId:user.id,before:{email:user.email},after:{email:request.new_email},ip},db);
    return {changed:true,email:request.new_email};
  });}catch(error){if(error.code==='23505') throw new AppError(409,'EMAIL_IN_USE','This email is already used by another account.');throw error;}
}
export async function cancelEmailChange(actor,{transaction=withTransaction,ip}={}) {
  requireSuperadmin(actor);
  return transaction(async db=>{
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[actor.id]);
    await db.query('UPDATE account_email_changes SET revoked_at=now() WHERE user_id=$1 AND used_at IS NULL AND revoked_at IS NULL',[actor.id]);
    await recordAudit({actorId:actor.id,action:'platform.email_change_cancelled',targetType:'user',targetId:actor.id,ip},db);
    return {cancelled:true};
  });
}
