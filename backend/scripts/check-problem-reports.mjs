// Uses generated data and a rollback transaction; no real reports or accounts are changed.
import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {getPool,closePool} from '../src/db/pool.js';
import {DUMMY_HASH} from '../src/utils/password.js';
import {createReport,myReports,inbox,inboxSummary,attachScreenshot,screenshotFor,updateReport} from '../src/modules/problem-reports/problem-reports.service.js';
const db=await getPool().connect();let sequence=0,checks=0;
const transaction=async fn=>{const name=`bug_check_${++sequence}`;await db.query(`SAVEPOINT ${name}`);try{const value=await fn(db);await db.query(`RELEASE SAVEPOINT ${name}`);return value;}catch(error){await db.query(`ROLLBACK TO SAVEPOINT ${name}`);await db.query(`RELEASE SAVEPOINT ${name}`);throw error;}};
try{
 await db.query('BEGIN');const tag=crypto.randomUUID();const {rows:[school]}=await db.query('INSERT INTO institutions(name) VALUES($1) RETURNING id',[`Problem report rollback ${tag}`]);
 const actors={};for(const role of ['admin','supervisor','student','superadmin']){const id=crypto.randomUUID();await db.query('INSERT INTO users(id,email,password_hash,full_name,role,institution_id) VALUES($1,$2,$3,$4,$5,$6)',[id,`${id}@example.invalid`,DUMMY_HASH,'Rollback reporter',role,role==='superadmin'?null:school.id]);actors[role]={id,role,institutionId:role==='superadmin'?null:school.id};}
 const before=(await inboxSummary(actors.superadmin,db)).new;
 const input={category:'calculation',title:'Rollback hours issue',description:'A calculation looks wrong after saving.',expected:'The correct total should appear.',pagePath:'/student/attendance?password=secret#qr-secret'};
 let report;for(const role of ['admin','supervisor','student']){report=await createReport({actor:actors[role],input:{...input,pagePath:`/${role}/attendance?token=secret`},userAgent:'Chrome/123 Edg/123'},{transaction});assert.match(report.reference,/^BUG-\d+$/);checks++;}
 const mine=await myReports(actors.student,db);assert.equal(mine.reports.length,1);assert.equal(mine.reports[0].pagePath,'/student/attendance');checks++;
 const other=await myReports(actors.admin,db);assert.equal(other.reports.some(row=>row.id===report.id),false);checks++;
 assert.equal((await inboxSummary(actors.superadmin,db)).new,before+3);checks++;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a54kAAAAASUVORK5CYII=','base64');
 await attachScreenshot({actor:actors.student,id:report.id,buffer:png,fileName:'screenshot.png'},{transaction});
 assert.deepEqual((await screenshotFor(actors.student,report.id,db)).buffer,png);checks++;
 await assert.rejects(()=>screenshotFor(actors.admin,report.id,db),{status:404});checks++;
 await assert.rejects(()=>screenshotFor({...actors.student,institutionId:crypto.randomUUID()},report.id,db),{status:404});checks++;
 assert.deepEqual((await screenshotFor(actors.superadmin,report.id,db)).buffer,png);checks++;
 await assert.rejects(()=>attachScreenshot({actor:actors.student,id:report.id,buffer:png,fileName:'screenshot.png'},{transaction}),{status:409});checks++;
 await assert.rejects(()=>attachScreenshot({actor:actors.student,id:report.id,buffer:Buffer.from('<svg/>'),fileName:'bad.svg'},{transaction}),{status:400});checks++;
 await updateReport({actor:actors.superadmin,id:report.id,input:{status:'investigating',response:'Checking the duty totals.'}},{transaction});
 assert.equal((await myReports(actors.student,db)).reports[0].status,'investigating');checks++;
 await updateReport({actor:actors.superadmin,id:report.id,input:{status:'resolved',response:'Fixed the calculation. Please reload.'}},{transaction});
 const updated=(await myReports(actors.student,db)).reports[0];assert.equal(updated.status,'resolved');assert.ok(updated.response.includes('Fixed'));checks++;
 const filtered=await inbox(actors.superadmin,{status:'resolved',search:report.reference,page:1},db);assert.equal(filtered.reports[0].id,report.id);checks++;
 const {rows:[audit]}=await db.query("SELECT count(*)::int AS count FROM audit_logs WHERE target_id=$1 AND after_data::text LIKE '%secret%'",[report.id]);assert.equal(audit.count,0);checks++;
 console.log(JSON.stringify({checks,records:'rolled back',scope:'reporter + institution enforced',screenshots:'private',realReportsCreated:false}));
}finally{await db.query('ROLLBACK');db.release();await closePool();}
