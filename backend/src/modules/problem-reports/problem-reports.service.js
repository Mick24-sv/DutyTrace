import {query,withTransaction} from '../../db/pool.js';
import {createRequire} from 'node:module';
import {AppError} from '../../utils/response.js';
import {recordAudit} from '../audit/audit.service.js';
import {requireSuperadmin} from '../platform/platform.rules.js';
import {validateUpload} from '../documents/files.js';
import {reportInput,updateInput,requireReporter,safePagePath,browserLabel,canReadReport} from './problem-reports.rules.js';
export const MAX_SCREENSHOT=2*1024*1024;
const appVersion=createRequire(import.meta.url)('../../../package.json').version;
const missing=()=>new AppError(404,'NOT_FOUND','Problem report not found.');
const referenceSql="'BUG-'||lpad(r.report_number::text,greatest(6,length(r.report_number::text)),'0')";
const columns=`r.id,${referenceSql} AS reference,r.category,r.title,r.description,r.expected,
 r.page_path AS "pagePath",r.browser,r.app_version AS "appVersion",r.status,r.response,
 r.created_at AS "createdAt",r.updated_at AS "updatedAt",(r.screenshot IS NOT NULL) AS "hasScreenshot",
 u.full_name AS "reporterName",r.reporter_role AS "reporterRole",i.name AS "institutionName"`;
const joined='FROM problem_reports r JOIN users u ON u.id=r.reporter_id JOIN institutions i ON i.id=r.institution_id';
export async function createReport({actor,input,userAgent,ip},{transaction=withTransaction}={}) {
 requireReporter(actor);input=reportInput.parse(input);
 return transaction(async db=>{
  const {rows:[row]}=await db.query(`INSERT INTO problem_reports(institution_id,reporter_id,reporter_role,category,title,description,expected,page_path,browser,app_version)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,'BUG-'||lpad(report_number::text,greatest(6,length(report_number::text)),'0') AS reference`,
  [actor.institutionId,actor.id,actor.role,input.category,input.title,input.description,input.expected,safePagePath(input.pagePath,actor.role),browserLabel(userAgent),appVersion]);
  await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'problem_report.created',targetType:'problem_report',targetId:row.id,after:{reference:row.reference,category:input.category},ip},db);
  return row;
 });
}
export async function myReports(actor,db={query}) {
 requireReporter(actor);const {rows}=await db.query(`SELECT ${columns} ${joined} WHERE r.reporter_id=$1 AND r.institution_id=$2 ORDER BY r.created_at DESC,r.id LIMIT 50`,[actor.id,actor.institutionId]);return {reports:rows};
}
export async function inboxSummary(actor,db={query}) {
 requireSuperadmin(actor);const {rows:[summary]}=await db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='new')::int AS new,
 count(*) FILTER(WHERE status='investigating')::int AS investigating,count(*) FILTER(WHERE status='resolved')::int AS resolved FROM problem_reports`);
 return summary;
}
export async function inbox(actor,{status='',search='',page=1}={},db={query}) {
 requireSuperadmin(actor);const values=[status,`%${search}%`];
 const filter=`WHERE ($1='' OR r.status=$1) AND (r.title ILIKE $2 OR i.name ILIKE $2 OR (${referenceSql}) ILIKE $2)`;
 const {rows:[count]}=await db.query(`SELECT count(*)::int AS total ${joined} ${filter}`,values);
 const totalPages=Math.max(1,Math.ceil(count.total/12));const currentPage=Math.min(page,totalPages);
 const {rows}=await db.query(`SELECT ${columns} ${joined} ${filter} ORDER BY r.created_at DESC,r.id LIMIT 12 OFFSET $3`,[...values,(currentPage-1)*12]);
 return {reports:rows,page:currentPage,totalPages,total:count.total};
}
export async function screenshotFor(actor,id,db={query}) {
 const {rows:[row]}=await db.query('SELECT reporter_id,institution_id,screenshot,screenshot_mime FROM problem_reports WHERE id=$1',[id]);
 if(!canReadReport(actor,row)||!row.screenshot)throw missing();return {buffer:row.screenshot,mime:row.screenshot_mime};
}
export async function attachScreenshot({actor,id,buffer,fileName,ip},{transaction=withTransaction}={}) {
 requireReporter(actor);const file=validateUpload(buffer,fileName,MAX_SCREENSHOT);
 if(!['image/png','image/jpeg'].includes(file.mime))throw new AppError(400,'INVALID_SCREENSHOT','Choose a PNG or JPEG screenshot.');
 return transaction(async db=>{
  const {rows:[row]}=await db.query('SELECT reporter_id,institution_id,status,screenshot,created_at FROM problem_reports WHERE id=$1 FOR UPDATE',[id]);
  if(!canReadReport(actor,row))throw missing();
  if(row.status!=='new'||row.screenshot||Date.now()-new Date(row.created_at).getTime()>10*60*1000)throw new AppError(409,'SCREENSHOT_LOCKED','Screenshots can only be attached once, within ten minutes of a new report.');
  await db.query('UPDATE problem_reports SET screenshot=$2,screenshot_mime=$3 WHERE id=$1',[id,buffer,file.mime]);
  await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'problem_report.screenshot_added',targetType:'problem_report',targetId:id,ip},db);return {attached:true};
 });
}
export async function updateReport({actor,id,input,ip},{transaction=withTransaction}={}) {
 requireSuperadmin(actor);input=updateInput.parse(input);
 return transaction(async db=>{
  const {rows:[row]}=await db.query('SELECT institution_id,status FROM problem_reports WHERE id=$1 FOR UPDATE',[id]);if(!row)throw missing();
  await db.query('UPDATE problem_reports SET status=$2,response=$3,updated_at=clock_timestamp(),updated_by=$4 WHERE id=$1',[id,input.status,input.response,actor.id]);
  await recordAudit({actorId:actor.id,institutionId:row.institution_id,action:'problem_report.updated',targetType:'problem_report',targetId:id,before:{status:row.status},after:{status:input.status},ip},db);return {updated:true};
 });
}
