import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../../db/pool.js';
import { requireAuth } from '../../middleware/auth.js';
import { AppError, asyncHandler, ok } from '../../utils/response.js';
import { parse, parseId } from '../../utils/validate.js';
import { createNotification } from '../notifications/notifications.service.js';
import { recordAudit } from '../audit/audit.service.js';

export const concernsRouter=Router();
concernsRouter.use(requireAuth);
const fail=()=>new AppError(403,'FORBIDDEN','This conversation is private to its participants.');
const text=(min,max)=>z.string().trim().min(min).max(max);
const recipientSql=`SELECT DISTINCT u.id,u.full_name,u.role FROM users u
 LEFT JOIN duty_assignments a ON a.user_id=u.id AND a.ends_on IS NULL
 WHERE u.institution_id=$1 AND u.status='active' AND u.id<>$2 AND (
 ($3='admin' AND u.role IN ('student','supervisor')) OR
 ($3='student' AND (u.role='admin' OR (u.role='supervisor' AND a.office_id=$4))) OR
 ($3='supervisor' AND (u.role='admin' OR (u.role='student' AND a.office_id=$4))))`;
const recipientParams=user=>[user.institutionId,user.id,user.role,user.office?.id??null];
async function access(db,user,id,lock=false){
 const {rows:[item]}=await db.query(`SELECT c.* FROM concerns c WHERE c.id=$1 AND c.institution_id=$2
 AND EXISTS(SELECT 1 FROM concern_participants p WHERE p.concern_id=c.id AND p.user_id=$3) ${lock?'FOR UPDATE OF c':''}`,[id,user.institutionId,user.id]);
 if(!item) throw fail();
 return item;
}
async function message(db,user,id,body,kind='message'){
 const {rows:[saved]}=await db.query('INSERT INTO concern_messages(concern_id,author_id,body,kind) VALUES($1,$2,$3,$4) RETURNING id',[id,user.id,body,kind]);
 await db.query('UPDATE concerns SET updated_at=now() WHERE id=$1',[id]);
 const {rows}=await db.query('SELECT u.id,u.role FROM concern_participants p JOIN users u ON u.id=p.user_id WHERE p.concern_id=$1 AND u.id<>$2',[id,user.id]);
 for(const recipient of rows) await createNotification(db,{recipientId:recipient.id,institutionId:user.institutionId,type:'concern_updated',title:kind==='forward'?'Concern forwarded':'Concern update',message:`${user.fullName}: ${body.slice(0,180)}`,relatedType:'concern',relatedId:id,dedupeKey:`concern:${saved.id}:${recipient.id}`,actionUrl:`/${recipient.role}/concerns?id=${id}`});
 await recordAudit({actorId:user.id,institutionId:user.institutionId,action:`concern.${kind}`,targetType:'concern',targetId:id,after:{messageId:saved.id}},db);
}
concernsRouter.get('/recipients',asyncHandler(async(req,res)=>{
 const search=parse(z.string().trim().max(100).default(''),req.query.search);
 const role=parse(z.enum(['admin','student','supervisor']).optional(),req.query.role);
 const userId=parse(z.uuid().optional(),req.query.userId);
 const {rows}=await query(`${recipientSql} AND (u.full_name ILIKE $5 OR u.email ILIKE $5)
 AND ($6::text IS NULL OR u.role::text=$6) AND ($7::uuid IS NULL OR u.id=$7)
 ORDER BY u.full_name LIMIT 50`,[...recipientParams(req.user),`%${search}%`,role??null,userId??null]);
 ok(res,{recipients:rows});
}));
concernsRouter.get('/',asyncHandler(async(req,res)=>{
 const page=parse(z.coerce.number().int().min(1).max(100000).default(1),req.query.page);
 const status=parse(z.enum(['open','under_review','resolved']).optional(),req.query.status);
 const {rows}=await query(`SELECT c.*,s.full_name AS sender_name,r.full_name AS recipient_name,count(*) OVER()::int AS total
 FROM concerns c JOIN users s ON s.id=c.sender_id JOIN users r ON r.id=c.recipient_id
 WHERE c.institution_id=$1 AND EXISTS(SELECT 1 FROM concern_participants p WHERE p.concern_id=c.id AND p.user_id=$2)
 AND ($3::text IS NULL OR c.status=$3) ORDER BY c.updated_at DESC,c.id LIMIT 20 OFFSET $4`,[req.user.institutionId,req.user.id,status??null,(page-1)*20]);
 ok(res,{items:rows,total:rows[0]?.total??0,page});
}));
concernsRouter.post('/',asyncHandler(async(req,res)=>{
 const b=parse(z.object({recipientId:z.uuid(),subject:text(3,160),message:text(5,4000)}).strict(),req.body);
 const item=await withTransaction(async db=>{
  const allowed=await db.query(`${recipientSql} AND u.id=$5`,[...recipientParams(req.user),b.recipientId]);
  if(!allowed.rowCount) throw fail();
  const {rows:[item]}=await db.query('INSERT INTO concerns(institution_id,sender_id,recipient_id,subject) VALUES($1,$2,$3,$4) RETURNING id',[req.user.institutionId,req.user.id,b.recipientId,b.subject]);
  await db.query('INSERT INTO concern_participants(concern_id,user_id) VALUES($1,$2),($1,$3)',[item.id,req.user.id,b.recipientId]);
  await message(db,req.user,item.id,b.message);
  return item;
 });ok(res,item,201);
}));
concernsRouter.get('/:id',asyncHandler(async(req,res)=>{
 const id=parseId(req.params.id);const item=await access({query},req.user,id);
 const {rows:participants}=await query('SELECT u.id,u.full_name,u.role FROM concern_participants p JOIN users u ON u.id=p.user_id WHERE p.concern_id=$1 ORDER BY u.full_name',[id]);
 const before=parse(z.string().regex(/^\d{1,19}$/).optional(),req.query.before);
 const {rows:messages}=await query(`SELECT m.*,u.full_name AS author_name,u.role AS author_role FROM concern_messages m JOIN users u ON u.id=m.author_id
 WHERE m.concern_id=$1 AND ($2::bigint IS NULL OR m.seq<$2::bigint) ORDER BY m.seq DESC LIMIT 51`,[id,before??null]);
 const hasMore=messages.length>50;messages.splice(50);
 ok(res,{item,participants,messages:messages.reverse(),hasMore});
}));
concernsRouter.post('/:id/replies',asyncHandler(async(req,res)=>{
 const b=parse(z.object({message:text(1,4000)}).strict(),req.body);const id=parseId(req.params.id);
 await withTransaction(async db=>{const item=await access(db,req.user,id,true);if(item.status==='resolved') throw new AppError(409,'CONCERN_RESOLVED','Ask the staff participant to reopen this concern before replying.');await message(db,req.user,id,b.message);});ok(res,{sent:true});
}));
concernsRouter.patch('/:id/status',asyncHandler(async(req,res)=>{
 if(!['admin','supervisor'].includes(req.user.role)) throw fail();
 const b=parse(z.object({status:z.enum(['open','under_review','resolved'])}).strict(),req.body);const id=parseId(req.params.id);
 await withTransaction(async db=>{const item=await access(db,req.user,id,true);if(item.status===b.status)return;await db.query('UPDATE concerns SET status=$2 WHERE id=$1',[id,b.status]);await message(db,req.user,id,`Status changed to ${b.status.replaceAll('_',' ')}.`,'status');});ok(res,{updated:true});
}));
concernsRouter.post('/:id/forward',asyncHandler(async(req,res)=>{
 if(req.user.role!=='supervisor')throw fail();
 const b=parse(z.object({adminId:z.uuid(),message:text(5,2000)}).strict(),req.body);const id=parseId(req.params.id);
 await withTransaction(async db=>{
  const item=await access(db,req.user,id,true);
  const {rows:[sender]}=await db.query('SELECT role FROM users WHERE id=$1',[item.sender_id]);
  if(sender?.role!=='student'||item.recipient_id!==req.user.id||item.status==='resolved')throw fail();
  const {rows:[admin]}=await db.query("SELECT id,full_name FROM users WHERE id=$1 AND institution_id=$2 AND role='admin' AND status='active'",[b.adminId,req.user.institutionId]);
  if(!admin)throw fail();
  await db.query('INSERT INTO concern_participants(concern_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,admin.id]);
  await message(db,req.user,id,`Forwarded to ${admin.full_name} (Administrator). They can read this conversation and reply. ${b.message}`,'forward');
 });ok(res,{forwarded:true});
}));
