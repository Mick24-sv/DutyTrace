import crypto from 'node:crypto';
import {query,withTransaction} from '../../db/pool.js';
import {AppError} from '../../utils/response.js';
import {hashPassword} from '../../utils/password.js';
import {recordAudit} from '../audit/audit.service.js';
import {appUrl,sendInstitutionInvitation,emailConfigured} from '../auth/email.service.js';
import {institutionInput,invitationInput,acceptInput,tokenInput,tokenHash,requireSuperadmin,validateInvitation} from './platform.rules.js';

const conflict=message=>new AppError(409,'ONBOARDING_CONFLICT',message);
const notFound=()=>new AppError(404,'NOT_FOUND','Institution not found.');
const publicInvite=row=>({id:row.id,email:row.email,fullName:row.full_name,expiresAt:row.expires_at,
  acceptedAt:row.accepted_at,revokedAt:row.revoked_at,deliveryStatus:row.delivery_status,createdAt:row.created_at});

export async function listInstitutions(actor,db={query}) {
  requireSuperadmin(actor);
  const {rows}=await db.query(`SELECT i.id,i.name,i.short_name AS "shortName",i.institution_type AS type,
    i.address,i.city,i.contact_email AS "contactEmail",i.timezone,i.created_at AS "createdAt",
    admins.count AS "adminCount",admins.names AS "adminNames",
    invitation.id AS invitation_id,invitation.email,invitation.full_name,invitation.expires_at,
    invitation.accepted_at,invitation.revoked_at,invitation.delivery_status,invitation.created_at AS invitation_created_at
    FROM institutions i LEFT JOIN LATERAL (
      SELECT count(*)::int, string_agg(full_name,', ' ORDER BY full_name) AS names
      FROM users WHERE institution_id=i.id AND role='admin' AND status='active'
    ) admins ON true LEFT JOIN LATERAL (
      SELECT * FROM institution_admin_invitations WHERE institution_id=i.id ORDER BY created_at DESC,id DESC LIMIT 1
    ) invitation ON true ORDER BY i.created_at DESC,i.id`);
  const institutions=rows.map(row=>{
    const invitation=row.invitation_id?publicInvite({...row,id:row.invitation_id,created_at:row.invitation_created_at}):null;
    const status=row.adminCount>0?'active':invitation?.deliveryStatus==='failed'?'delivery_failed':!invitation||invitation.revokedAt?'setup_needed':
      new Date(invitation.expiresAt)<=new Date()?'expired':
      invitation.deliveryStatus==='manual'?'link_ready':'invited';
    return {id:row.id,name:row.name,shortName:row.shortName,type:row.type,address:row.address,city:row.city,
      contactEmail:row.contactEmail,timezone:row.timezone,createdAt:row.createdAt,adminCount:row.adminCount,
      adminNames:row.adminNames,status,invitation};
  });
  return {institutions,emailConfigured:emailConfigured(),summary:{total:institutions.length,
    active:institutions.filter(row=>row.status==='active').length,
    awaitingSetup:institutions.filter(row=>row.status!=='active').length}};
}

async function issueInvitation(db,{actor,institution,input,ip}) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`institution-admin-email:${input.email}`]);
  const {rows:existing}=await db.query('SELECT id FROM users WHERE email=$1',[input.email]);
  if(existing.length) throw conflict('This email already has a DutyTrace account. Use a separate email for the new institution administrator.');
  await db.query(`UPDATE institution_admin_invitations SET revoked_at=now()
    WHERE institution_id=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,[institution.id]);
  // Release expired reservations for the same address; live invitations stay exclusive.
  await db.query(`UPDATE institution_admin_invitations SET revoked_at=now()
    WHERE email=$1 AND expires_at<=now() AND accepted_at IS NULL AND revoked_at IS NULL`,[input.email]);
  const {rows:reserved}=await db.query(`SELECT id FROM institution_admin_invitations
    WHERE email=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,[input.email]);
  if(reserved.length) throw conflict('This email already has an outstanding invitation to another institution.');
  const rawToken=crypto.randomBytes(32).toString('base64url');
  const {rows:[row]}=await db.query(`INSERT INTO institution_admin_invitations
    (institution_id,email,full_name,token_hash,expires_at,created_by,created_at)
    VALUES($1,$2,$3,$4,now()+interval '48 hours',$5,clock_timestamp()) RETURNING *`,
  [institution.id,input.email,input.fullName,tokenHash(rawToken),actor.id]);
  await recordAudit({actorId:actor.id,institutionId:institution.id,action:'institution.admin_invited',
    targetType:'institution_admin_invitation',targetId:row.id,after:{email:input.email,fullName:input.fullName},ip},db);
  return {row,institution,rawToken};
}

async function deliverInvitation(issued,{send=sendInstitutionInvitation,db={query}}={}) {
  const inviteUrl=`${appUrl}/accept-invitation#token=${issued.rawToken}`;
  let deliveryStatus;
  try {
    const result=await send({to:issued.row.email,fullName:issued.row.full_name,institutionName:issued.institution.name,inviteUrl});
    deliveryStatus=result.sent?'sent':'manual';
  } catch {
    deliveryStatus='failed';
  }
  await db.query(`UPDATE institution_admin_invitations SET delivery_status=$2,
    revoked_at=CASE WHEN $2='failed' THEN now() ELSE revoked_at END
    WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL`,[issued.row.id,deliveryStatus]);
  return {institutionId:issued.institution.id,invitation:publicInvite({...issued.row,delivery_status:deliveryStatus}),
    deliveryStatus,...(deliveryStatus==='manual'?{inviteUrl}:{}),
    message:deliveryStatus==='sent'?'Invitation handed to the email provider. The link expires in 48 hours.':
      deliveryStatus==='manual'?'Email delivery is not configured. Share this one-time invitation link privately with the designated administrator.':
        'The institution was saved, but the invitation email could not be sent. Its link was disabled. Try issuing a new invitation.'};
}

export async function createInstitution({actor,input,ip},{transaction=withTransaction,send=sendInstitutionInvitation,db={query}}={}) {
  requireSuperadmin(actor);input=institutionInput.parse(input);
  let issued;
  try {
    issued=await transaction(async client=>{
      const {rows:[institution]}=await client.query(`INSERT INTO institutions
        (name,short_name,institution_type,address,city,contact_email,timezone,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name`,
      [input.name,input.shortName,input.type,input.address,input.city,input.contactEmail,input.timezone,actor.id]);
      // New institutions receive independent defaults, never another school's settings.
      await client.query('INSERT INTO institution_dtr_policies(institution_id) VALUES($1)',[institution.id]);
      await client.query('INSERT INTO institution_duty_requirement_settings(institution_id) VALUES($1)',[institution.id]);
      await recordAudit({actorId:actor.id,institutionId:institution.id,action:'institution.create',targetType:'institution',
        targetId:institution.id,after:{name:input.name,type:input.type,city:input.city},ip},client);
      return issueInvitation(client,{actor,institution,input:input.admin,ip});
    });
  } catch(error) {
    if(error.code==='23505') throw conflict('An institution with this name or an invitation for this email already exists.');
    throw error;
  }
  return deliverInvitation(issued,{send,db});
}

export async function inviteInstitutionAdmin({actor,institutionId,input,ip},{transaction=withTransaction,send=sendInstitutionInvitation,db={query}}={}) {
  requireSuperadmin(actor);input=invitationInput.parse(input);
  const issued=await transaction(async client=>{
    const {rows:[institution]}=await client.query('SELECT id,name FROM institutions WHERE id=$1 FOR UPDATE',[institutionId]);
    if(!institution) throw notFound();
    const {rows:admins}=await client.query(`SELECT id FROM users WHERE institution_id=$1 AND role='admin' AND status='active'`,[institutionId]);
    if(admins.length) throw conflict('This institution already has an active administrator. Its admin can manage additional school accounts.');
    return issueInvitation(client,{actor,institution,input,ip});
  });
  return deliverInvitation(issued,{send,db});
}

export async function revokeInvitation({actor,invitationId,ip},{transaction=withTransaction}={}) {
  requireSuperadmin(actor);
  return transaction(async db=>{
    const {rows:[row]}=await db.query(`UPDATE institution_admin_invitations SET revoked_at=now()
      WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING institution_id`,[invitationId]);
    if(!row) throw conflict('This invitation is already accepted or revoked.');
    await recordAudit({actorId:actor.id,institutionId:row.institution_id,action:'institution.invitation_revoked',targetType:'institution_admin_invitation',targetId:invitationId,ip},db);
    return {revoked:true};
  });
}

export async function inspectInvitation(rawToken,db={query}) {
  tokenInput.parse({token:rawToken});
  const {rows:[row]}=await db.query(`SELECT invitation.*,i.name AS institution_name FROM institution_admin_invitations invitation
    JOIN institutions i ON i.id=invitation.institution_id WHERE token_hash=$1`,[tokenHash(rawToken)]);
  validateInvitation(row);
  return {institutionName:row.institution_name,fullName:row.full_name,
    maskedEmail:row.email.replace(/^(.{1,2})(.*)(@.*)$/,'$1***$3'),expiresAt:row.expires_at};
}

export async function acceptInvitation({input,ip},{transaction=withTransaction}={}) {
  input=acceptInput.parse(input);
  const passwordHash=await hashPassword(input.password);
  return transaction(async db=>{
    const {rows:[candidate]}=await db.query('SELECT institution_id,email FROM institution_admin_invitations WHERE token_hash=$1',[tokenHash(input.token)]);
    if(!candidate) validateInvitation(null);
    await db.query('SELECT id FROM institutions WHERE id=$1 FOR UPDATE',[candidate.institution_id]);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`institution-admin-email:${candidate.email}`]);
    const {rows:[row]}=await db.query('SELECT * FROM institution_admin_invitations WHERE token_hash=$1 FOR UPDATE',[tokenHash(input.token)]);
    validateInvitation(row);
    const {rows:existing}=await db.query('SELECT id FROM users WHERE email=$1',[row.email]);
    if(existing.length) throw conflict('This email already has an account. Contact the DutyTrace maintainer.');
    const {rows:[user]}=await db.query(`INSERT INTO users(email,password_hash,full_name,role,institution_id)
      VALUES($1,$2,$3,'admin',$4) RETURNING id`,[row.email,passwordHash,row.full_name,row.institution_id]);
    await db.query('UPDATE institution_admin_invitations SET accepted_at=now(),accepted_by=$2 WHERE id=$1',[row.id,user.id]);
    await recordAudit({actorId:user.id,institutionId:row.institution_id,action:'institution.invitation_accepted',
      targetType:'institution_admin_invitation',targetId:row.id,after:{role:'admin'},ip},db);
    return {accepted:true};
  });
}
