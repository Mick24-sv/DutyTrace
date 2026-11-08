import {query,withTransaction} from '../../db/pool.js';
import {AppError} from '../../utils/response.js';
import {recordAudit} from '../audit/audit.service.js';
import {revokeAllSessions} from '../auth/auth.service.js';

const quote=name=>'"'+name.replaceAll('"','""')+'"';
async function target(db,actor,id){
 if(actor.role!=='admin')throw new AppError(403,'FORBIDDEN','Only administrators can manage accounts.');
 if(actor.id===id)throw new AppError(400,'SELF_LOCKOUT','You cannot archive or delete your own account.');
 const {rows:[user]}=await db.query('SELECT id,email,full_name,status,archived_at,archive_previous_status,last_login_at FROM users WHERE id=$1 AND institution_id=$2 FOR UPDATE',[id,actor.institutionId]);
 if(!user)throw new AppError(404,'NOT_FOUND','User not found.');
 return user;
}
export async function archiveAccount(actor,id,restore=false){
 return withTransaction(async db=>{
  const user=await target(db,actor,id);
  if(restore?!user.archived_at:Boolean(user.archived_at))return;
  if(restore)await db.query('UPDATE users SET status=archive_previous_status,archived_at=NULL,archive_previous_status=NULL WHERE id=$1',[id]);
  else{
   await db.query("UPDATE users SET archive_previous_status=status,status='disabled',archived_at=now() WHERE id=$1",[id]);
   await revokeAllSessions(id,db);
  }
  await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:restore?'user.restored':'user.archived',targetType:'user',targetId:id,before:{status:user.status,archivedAt:user.archived_at},after:{archived:!restore}},db);
 });
}
async function unusedBlockers(db,user){
 if(user.last_login_at)return ['Previous sign-in activity'];
 // Inspect every FK, including SET NULL/CASCADE references, so new features
 // cannot silently erase linked official records when an account is deleted.
 const {rows:references}=await db.query(`SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name
 FROM pg_constraint fk JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ANY(fk.conkey)
 WHERE fk.contype='f' AND fk.confrelid='public.users'::regclass
 AND NOT (n.nspname='public' AND c.relname='duty_assignments')`);
 const blockers=[];
 for(const ref of references){
  const {rowCount}=await db.query(`SELECT 1 FROM ${quote(ref.schema_name)}.${quote(ref.table_name)} WHERE ${quote(ref.column_name)}=$1 LIMIT 1`,[user.id]);
  if(rowCount)blockers.push(ref.table_name);
 }
 return [...new Set(blockers)];
}
export async function deletionEligibility(actor,id){
 return withTransaction(async db=>{
  const user=await target(db,actor,id);const blockers=await unusedBlockers(db,user);
  return {canDelete:blockers.length===0,blockers};
 });
}
export async function deleteUnusedAccount(actor,id,confirmation){
 try{return await withTransaction(async db=>{
  const user=await target(db,actor,id);
  if(confirmation!==user.email)throw new AppError(400,'CONFIRMATION_REQUIRED','Type the account email exactly to confirm permanent deletion.');
  const blockers=await unusedBlockers(db,user);
  if(blockers.length)throw new AppError(409,'USER_HAS_RECORDS','This account has sign-in activity or linked records. Archive it instead.');
  // Assignments alone are setup data, not proof that an account was used.
  await db.query('DELETE FROM duty_assignments WHERE user_id=$1',[id]);
  await db.query('DELETE FROM users WHERE id=$1 AND institution_id=$2',[id,actor.institutionId]);
  await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'user.deleted',targetType:'user',targetId:id,before:{fullName:user.full_name,email:user.email}},db);
 });}catch(error){
  if(error.code==='23503')throw new AppError(409,'USER_HAS_RECORDS','This account now has linked records. Archive it instead.');
  throw error;
 }
}
