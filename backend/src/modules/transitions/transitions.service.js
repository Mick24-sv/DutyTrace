import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { buildSessions } from '../attendance/calc.js';
import { getStudentForecast, getInstitutionForecasts } from '../forecast/forecast.service.js';
import { termRequirementForStudent } from '../duty-requirements/duty-requirements.service.js';
import { effectiveEvents } from '../attendance-discrepancies/attendance-discrepancies.service.js';
import { createNotification } from '../notifications/notifications.service.js';

const POLICY = 'keep_original';
const forbidden = () => new AppError(403, 'FORBIDDEN', 'You do not have permission to access this transition.');
const termRow = async (id, institutionId, db, lock=false) => (await db.query(
  `SELECT * FROM academic_terms WHERE id=$1 AND institution_id=$2${lock?' FOR UPDATE':''}`, [id,institutionId])).rows[0] ?? null;
const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function policyFor(institutionId, db = { query }) {
  const { rows: [row] } = await db.query(`SELECT semester_transition_policy FROM institution_duty_requirement_settings WHERE institution_id=$1`,[institutionId]);
  return row?.semester_transition_policy ?? null;
}

async function sourceDtrIssues(studentIds, term, db) {
  if (!studentIds.length) return new Map();
  const { rows } = await db.query(
    `SELECT d.user_id, count(*)::int AS count
       FROM monthly_dtrs d JOIN users u ON u.id=d.user_id
      WHERE d.user_id=ANY($1::uuid[]) AND u.institution_id=$2
        AND d.month >= to_char($3::date,'YYYY-MM') AND d.month <= to_char($4::date,'YYYY-MM')
        AND d.status <> 'approved' GROUP BY d.user_id`,
    [studentIds,term.institution_id,term.starts_on,term.ends_on]);
  return new Map(rows.map(r=>[r.user_id,Number(r.count)]));
}

async function institutionIncompleteSessions(institutionId,term,db){
  const {rows:students}=await db.query(`SELECT id FROM users WHERE institution_id=$1 AND role='student'`,[institutionId]);
  const ids=students.map(s=>s.id); if(!ids.length)return 0;
  const events=await effectiveEvents(ids,{startDate:term.starts_on,nextDate:term.ends_on,timezone:term.timezone,db});
  const now=(await db.query('SELECT now() AS now')).rows[0].now;
  let count=0;
  for(const id of ids)count+=buildSessions(events.get(id),{now,timeZone:term.timezone,maxSessionSeconds:env.maxSessionHours*3600})
    .filter(s=>!s.counted&&s.date>=term.starts_on&&s.date<=term.ends_on).length;
  return count;
}

async function institutionOpenIssues(institutionId,term,db){
  const {rows:[row]}=await db.query(`SELECT
    (SELECT count(*) FROM monthly_dtrs d JOIN users u ON u.id=d.user_id WHERE u.institution_id=$1 AND u.role='student' AND d.month>=to_char($2::date,'YYYY-MM') AND d.month<=to_char($3::date,'YYYY-MM') AND d.status<>'approved')::int AS dtrs,
    (SELECT count(*) FROM duty_recovery_shifts WHERE institution_id=$1 AND shift_date BETWEEN $2::date AND $3::date AND status='pending_review')::int AS recoveries`,[institutionId,term.starts_on,term.ends_on]);
  return {pendingDtr:Number(row.dtrs),pendingRecovery:Number(row.recoveries),incompleteSessions:await institutionIncompleteSessions(institutionId,term,db)};
}

async function transitionRows({actor,sourceTerm,destinationTerm,studentIds,db}) {
  const ids=[...new Set(studentIds)];
  if (ids.length>100) throw new AppError(400,'VALIDATION_ERROR','Select no more than 100 Student Assistants per transition.');
  const {rows:students}=await db.query(
    `SELECT u.id,u.full_name,u.email,u.status,o.id AS office_id,o.name AS office_name
       FROM users u LEFT JOIN duty_assignments d ON d.user_id=u.id AND d.ends_on IS NULL
       LEFT JOIN offices o ON o.id=d.office_id
      WHERE u.id=ANY($1::uuid[]) AND u.institution_id=$2 AND u.role='student'`,[ids,actor.institutionId]);
  if(students.length!==ids.length) throw forbidden();
  const dtrIssues=await sourceDtrIssues(ids,sourceTerm,db);
  const eventsByStudent=await effectiveEvents(ids,{startDate:sourceTerm.starts_on,nextDate:sourceTerm.ends_on,timezone:sourceTerm.timezone,db});
  const eventFingerprint=ids.flatMap(studentId=>(eventsByStudent.get(studentId)??[]).map(e=>[studentId,e.id,e.eventType,e.recordedAt]));
  const now=(await db.query('SELECT now() AS now')).rows[0].now;
  const sessionIssues=new Map();
  for(const studentId of ids){
    const sessions=buildSessions(eventsByStudent.get(studentId),{now,timeZone:sourceTerm.timezone,maxSessionSeconds:env.maxSessionHours*3600});
    sessionIssues.set(studentId,sessions.filter(s=>!s.counted&&s.date>=sourceTerm.starts_on&&s.date<=sourceTerm.ends_on).length);
  }
  const {rows:recovery}=await db.query(
    `SELECT student_id,id,shift_date::text,starts_at::text,ends_at::text FROM duty_recovery_shifts
      WHERE student_id=ANY($1::uuid[]) AND status='pending_review'
        AND shift_date BETWEEN $2::date AND $3::date ORDER BY student_id,shift_date,starts_at`,[ids,sourceTerm.starts_on,sourceTerm.ends_on]);
  const pendingRecovery=new Map();
  for(const r of recovery)pendingRecovery.set(r.student_id,(pendingRecovery.get(r.student_id)??0)+1);
  const {rows:openDtrDetails}=await db.query(`SELECT d.id,d.user_id,d.status,d.updated_at FROM monthly_dtrs d
    WHERE d.user_id=ANY($1::uuid[]) AND d.month>=to_char($2::date,'YYYY-MM') AND d.month<=to_char($3::date,'YYYY-MM') AND d.status<>'approved'
    ORDER BY d.user_id,d.month`,[ids,sourceTerm.starts_on,sourceTerm.ends_on]);
  const forecasts=await Promise.all(students.map(student=>getStudentForecast(student.id,{termId:sourceTerm.id,actor,db})));
  const byForecast=new Map(forecasts.map(f=>[f.student.id,f]));
  const requirements=await Promise.all(students.map(async student=>{
    const [sourceRequirement,destinationRequirement]=await Promise.all([
      termRequirementForStudent({studentId:student.id,termId:sourceTerm.id,institutionId:actor.institutionId,officeId:student.office_id,db}),
      termRequirementForStudent({studentId:student.id,termId:destinationTerm.id,institutionId:actor.institutionId,officeId:student.office_id,db}),
    ]);
    return [student.id,{source:sourceRequirement,destination:destinationRequirement}];
  }));
  const requirementByStudent=new Map(requirements);
  const rows=students.map(student=>{
    const f=byForecast.get(student.id),resolved=requirementByStudent.get(student.id);
    const requiredHours=resolved?.source?.requiredHours??null;
    const remaining=requiredHours==null?null:Math.max(0,round(requiredHours-round(f?.completedHours)));
    const unresolvedDtr=dtrIssues.get(student.id)??0,incomplete=sessionIssues.get(student.id)??0,pending=pendingRecovery.get(student.id)??0;
    const issues=[];
    if(student.status!=='active')issues.push('Student account is not active; continuation requires review.');
    if(requiredHours==null)issues.push('No current-term requirement is assigned.');
    if(resolved?.destination?.requiredHours==null)issues.push('No destination-term requirement is configured; configure it in Academic Terms first.');
    if(unresolvedDtr)issues.push(`${unresolvedDtr} DTR(s) are not approved.`);
    if(incomplete)issues.push(`${incomplete} attendance session(s) are incomplete or uncounted.`);
    if(pending)issues.push(`${pending} recovery shift(s) are pending supervisor review.`);
    const needsReview=issues.length>0;
    return {
      student:{id:student.id,fullName:student.full_name,email:student.email,status:student.status,officeId:student.office_id,officeName:student.office_name},
      current:{requiredHours,completedHours:round(f?.completedHours),remainingHours:remaining,
        completionPercentage:requiredHours>0?Math.min(100,round((f.completedHours/requiredHours)*100)):null,
        deadline:f?.deadline??sourceTerm.completion_deadline,
        forecastStatus:f?.requiredHours===requiredHours?f?.status:null,
        forecastLabel:f?.requiredHours===requiredHours?f?.statusLabel:'Unavailable (requirement policy differs from forecast input)',
        forecastNote:f?.requiredHours===requiredHours?null:'Feature 1 does not use this term policy requirement; the transition uses the configured policy value.'},
      destination:{requiredHours:resolved?.destination?.requiredHours??null},
      pendingRecoveryShifts:pending,unresolvedDtrCount:unresolvedDtr,incompleteSessionCount:incomplete,
      explanationWorkflowSupported:false,issues,transitionStatus:needsReview?'review_required':'continued',
    };
  });
  const fingerprintData={source:{id:sourceTerm.id,updatedAt:sourceTerm.updated_at,finalizedAt:sourceTerm.finalized_at},destination:{id:destinationTerm.id,updatedAt:destinationTerm.updated_at,finalizedAt:destinationTerm.finalized_at},policy:await policyFor(actor.institutionId,db),rows,attendanceEvents:eventFingerprint,pendingDtrReviews:openDtrDetails.map(d=>[d.id,d.user_id,d.status,d.updated_at]),pendingRecoveryShifts:recovery.map(r=>[r.id,r.student_id,r.shift_date,r.starts_at,r.ends_at])};
  return {rows,fingerprint:fingerprint(fingerprintData),fingerprintData};
}

export async function setPolicy({actor,policy,ip}){
  if(actor.role!=='admin')throw forbidden();
  await withTransaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`semester-transition-policy:${actor.institutionId}`]);
    const before=await policyFor(actor.institutionId,db);
    await db.query(`INSERT INTO institution_duty_requirement_settings(institution_id,semester_transition_policy,updated_by)
      VALUES($1,$2,$3) ON CONFLICT(institution_id) DO UPDATE SET semester_transition_policy=EXCLUDED.semester_transition_policy,updated_by=EXCLUDED.updated_by,updated_at=now()`,[actor.institutionId,policy,actor.id]);
    await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'semester_transition.policy_updated',targetType:'institution',targetId:actor.institutionId,before:{policy:before},after:{policy},ip},db);
  });
  return {policy};
}

export async function overview({actor,termId,destinationTermId=null,page=1,limit=25,search=''}){
  if(actor.role!=='admin')throw forbidden();
  const term=await termRow(termId,actor.institutionId,{query}); if(!term)throw forbidden();
  const safeLimit=Math.min(50,Math.max(1,Number(limit)||25)),safePage=Math.max(1,Number(page)||1),offset=(safePage-1)*safeLimit;
  const params=[actor.institutionId]; let searchSql='';
  if(search.trim()){params.push(`%${search.trim().toLowerCase()}%`);searchSql=` AND lower(u.full_name||' '||u.email) LIKE $${params.length}`;}
  const count=(await query(`SELECT count(*)::int AS total FROM users u WHERE u.institution_id=$1 AND u.role='student'${searchSql}`,params)).rows[0].total;
  params.push(safeLimit,offset);
  const {rows:students}=await query(`SELECT u.id FROM users u WHERE u.institution_id=$1 AND u.role='student'${searchSql}
    ORDER BY u.full_name LIMIT $${params.length-1} OFFSET $${params.length}`,params);
  const destinationCandidates=(await query(`SELECT id,academic_year,semester,starts_on::text,ends_on::text,finalized_at
    FROM academic_terms WHERE institution_id=$1 AND starts_on>$2::date ORDER BY starts_on`,[actor.institutionId,term.ends_on])).rows;
  if(destinationTermId&&!destinationCandidates.some(t=>t.id===destinationTermId))throw new AppError(400,'INVALID_DESTINATION_TERM','Choose a later term in this institution.');
  const history=(await query(`SELECT id,status,source_term_id,destination_term_id,previewed_at,finalized_at,preview_data
    FROM semester_transitions WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 20`,[actor.institutionId])).rows;
  const selectedStudents=await query(`SELECT u.id,d.office_id FROM users u LEFT JOIN duty_assignments d ON d.user_id=u.id AND d.ends_on IS NULL WHERE u.id=ANY($1::uuid[])`,[students.map(s=>s.id)]);
  const officeByStudent=new Map(selectedStudents.rows.map(s=>[s.id,s.office_id]));
  const forecasts=await Promise.all(students.map(({id})=>getStudentForecast(id,{termId:term.id,actor})));
  const requirementResults=await Promise.all(students.map(async ({id})=>{
    const [source,destination]=await Promise.all([
      termRequirementForStudent({studentId:id,termId:term.id,institutionId:actor.institutionId,officeId:officeByStudent.get(id),db:{query}}),
      destinationTermId?termRequirementForStudent({studentId:id,termId:destinationTermId,institutionId:actor.institutionId,officeId:officeByStudent.get(id),db:{query}}):null,
    ]);
    return [id,{source,destination}];
  }));
  const requirementByStudent=new Map(requirementResults);
  const pageIds=students.map(s=>s.id);
  const {rows:pendingRecoveries}=await query(`SELECT student_id,count(*)::int AS count FROM duty_recovery_shifts WHERE student_id=ANY($1::uuid[]) AND status='pending_review' AND shift_date BETWEEN $2::date AND $3::date GROUP BY student_id`,[pageIds,term.starts_on,term.ends_on]);
  const recoveryByStudent=new Map(pendingRecoveries.map(r=>[r.student_id,Number(r.count)]));
  const dtrByStudent=await sourceDtrIssues(pageIds,term,{query});
  const items=forecasts.map(f=>{
    const resolved=requirementByStudent.get(f.student.id),requiredHours=resolved?.source?.requiredHours??null;
    const remainingHours=requiredHours==null?null:Math.max(0,round(requiredHours-round(f.completedHours)));
    const forecastMatches=requiredHours!=null&&Number(f.requiredHours)===Number(requiredHours);
    return {student:f.student,current:{requiredHours,completedHours:f.completedHours,remainingHours,
      completionPercentage:requiredHours>0?Math.min(100,round((f.completedHours/requiredHours)*100)):null,deadline:f.deadline,
      forecastStatus:forecastMatches?f.status:null,forecastLabel:forecastMatches?f.statusLabel:'Unavailable (requirement policy differs from forecast input)'},
      destination:{requiredHours:resolved?.destination?.requiredHours??null},pendingRecoveryShifts:recoveryByStudent.get(f.student.id)??0,unresolvedDtrCount:dtrByStudent.get(f.student.id)??0};
  });
  const institutionalForecast=await getInstitutionForecasts({termId:term.id,actor});
  const pendingSummary=await institutionOpenIssues(actor.institutionId,term,{query});
  const all=institutionalForecast.items??[];
  const institutionRequirements=await Promise.all(all.map(async f=>{
    const requirement=await termRequirementForStudent({studentId:f.student.id,termId:term.id,institutionId:actor.institutionId,officeId:f.student.officeId,db:{query}});
    return [f.student.id,requirement.requiredHours];
  }));
  const institutionRequirementByStudent=new Map(institutionRequirements);
  const summary={students:all.length,completed:all.filter(i=>Number.isFinite(Number(institutionRequirementByStudent.get(i.student.id)))&&Number(i.completedHours)>=Number(institutionRequirementByStudent.get(i.student.id))).length,
    outstanding:all.filter(i=>(institutionRequirementByStudent.get(i.student.id)??0)>i.completedHours).length,
    atRisk:all.filter(i=>i.status==='at_risk'&&Number(i.requiredHours)===Number(institutionRequirementByStudent.get(i.student.id))).length,
    pendingExplanations:0,requiringReview:pendingSummary.pendingDtr+pendingSummary.pendingRecovery+pendingSummary.incompleteSessions,
    pendingDtrReviews:pendingSummary.pendingDtr,pendingRecoveryShifts:pendingSummary.pendingRecovery,
    incompleteSessions:pendingSummary.incompleteSessions,explanationWorkflowSupported:false};
  return {policy:await policyFor(actor.institutionId),sourceTerm:{id:term.id,academicYear:term.academic_year,semester:term.semester,startsOn:term.starts_on,endsOn:term.ends_on,finalizedAt:term.finalized_at},destinationTerms:destinationCandidates,items,summary,pagination:{page:safePage,limit:safeLimit,total:count,totalPages:Math.ceil(count/safeLimit)},history:history.map(h=>({id:h.id,status:h.status,sourceTermId:h.source_term_id,destinationTermId:h.destination_term_id,previewedAt:h.previewed_at,finalizedAt:h.finalized_at,summary:h.preview_data?.summary??null}))};
}

export async function preview({actor,sourceTermId,destinationTermId,studentIds,ip}){
  if(actor.role!=='admin')throw forbidden();
  return withTransaction(async db=>{
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`semester-transition-policy:${actor.institutionId}`]);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`semester-transition:${actor.institutionId}:${sourceTermId}:${destinationTermId}`]);
    const policy=await policyFor(actor.institutionId,db); if(!policy)throw new AppError(409,'TRANSITION_POLICY_REQUIRED','Configure the institution transition policy before previewing a transition.');
    const source=await termRow(sourceTermId,actor.institutionId,db),destination=await termRow(destinationTermId,actor.institutionId,db);
    if(!source||!destination)throw forbidden();
    validateTerms(source,destination);
    const calculated=await transitionRows({actor,sourceTerm:source,destinationTerm:destination,studentIds,db});
    const hardIssues=calculated.rows.filter(r=>r.transitionStatus==='review_required');
    const institutionIssues=await institutionOpenIssues(actor.institutionId,source,db);
    const today=(await db.query(`SELECT (now() AT TIME ZONE $1)::date::text AS today`,[source.timezone])).rows[0].today;
    const sourceEnded=today>source.ends_on;
    const summary={selected:calculated.rows.length,eligible:calculated.rows.length-hardIssues.length,requiringReview:hardIssues.length,
      outstanding:calculated.rows.filter(r=>(r.current.remainingHours??0)>0).length,pendingRecovery:calculated.rows.reduce((n,r)=>n+r.pendingRecoveryShifts,0),
      pendingExplanations:0,explanationWorkflowSupported:false,pendingInstitutionDtrReviews:institutionIssues.pendingDtr,
      pendingInstitutionRecoveryShifts:institutionIssues.pendingRecovery,incompleteInstitutionSessions:institutionIssues.incompleteSessions};
    const data={sourceTerm:{id:source.id,academicYear:source.academic_year,semester:source.semester,endsOn:source.ends_on},destinationTerm:{id:destination.id,academicYear:destination.academic_year,semester:destination.semester,startsOn:destination.starts_on},policy,policyMeaning:'Close the source term with all completed and outstanding hours preserved in that term. Do not copy outstanding hours or overwrite destination requirements.',students:calculated.rows,summary,sourceEnded,canFinalize:sourceEnded&&hardIssues.length===0&&Object.values(institutionIssues).every(v=>v===0)};
    const {rows:[old]}=await db.query(`SELECT * FROM semester_transitions WHERE institution_id=$1 AND source_term_id=$2 AND destination_term_id=$3 FOR UPDATE`,[actor.institutionId,sourceTermId,destinationTermId]);
    if(old?.status==='finalized')throw new AppError(409,'TRANSITION_FINALIZED','This source/destination term transition is already finalized.');
    let transition;
    if(old){
      ({rows:[transition]}=await db.query(`UPDATE semester_transitions SET status='previewed',policy=$2,policy_snapshot=$3::jsonb,source_fingerprint=$4,preview_data=$5::jsonb,previewed_by=$6,previewed_at=now(),cancelled_by=NULL,cancelled_at=NULL WHERE id=$1 RETURNING *`,[old.id,policy,JSON.stringify({policy,version:1}),calculated.fingerprint,JSON.stringify(data),actor.id]));
      await db.query(`DELETE FROM semester_transition_students WHERE transition_id=$1`,[old.id]);
    }else{
      ({rows:[transition]}=await db.query(`INSERT INTO semester_transitions(institution_id,source_term_id,destination_term_id,policy,policy_snapshot,source_fingerprint,preview_data,previewed_by)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8) RETURNING *`,[actor.institutionId,sourceTermId,destinationTermId,policy,JSON.stringify({policy,version:1}),calculated.fingerprint,JSON.stringify(data),actor.id]));
    }
    for(const r of calculated.rows)await db.query(`INSERT INTO semester_transition_students(transition_id,student_id,student_status,source_required_hours,source_completed_hours,source_remaining_hours,destination_required_hours,pending_recovery_shifts,unresolved_dtr_count,incomplete_session_count,explanation)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[transition.id,r.student.id,r.transitionStatus,r.current.requiredHours,r.current.completedHours,r.current.remainingHours,r.destination.requiredHours,r.pendingRecoveryShifts,r.unresolvedDtrCount,r.incompleteSessionCount,r.issues.join(' ')||null]);
    await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'semester_transition.previewed',targetType:'semester_transition',targetId:transition.id,after:{sourceTermId,destinationTermId,summary},ip},db);
    return {id:transition.id,status:transition.status,...data};
  });
}

function validateTerms(source,destination){
  if(source.id===destination.id||destination.starts_on<=source.ends_on)throw new AppError(400,'INVALID_TERM_ORDER','The destination term must start after the source term ends.');
  if(source.finalized_at)throw new AppError(409,'SOURCE_TERM_FINALIZED','The source term is already finalized.');
  if(destination.finalized_at)throw new AppError(409,'DESTINATION_TERM_FINALIZED','The destination term is finalized and cannot receive continuing students.');
}

export async function finalize({actor,id,ip}){
  if(actor.role!=='admin')throw forbidden();
  try {
  return await withTransaction(async db=>{
    await db.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`semester-transition-policy:${actor.institutionId}`]);
    const {rows:[transition]}=await db.query(`SELECT * FROM semester_transitions WHERE id=$1 AND institution_id=$2 FOR UPDATE`,[id,actor.institutionId]);
    if(!transition)throw forbidden();
    if(transition.status!=='previewed')throw new AppError(409,'INVALID_TRANSITION','Only a previewed transition can be finalized.');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`semester-transition:${actor.institutionId}:${transition.source_term_id}:${transition.destination_term_id}`]);
    if(await policyFor(actor.institutionId,db)!==transition.policy)throw new AppError(409,'TRANSITION_STALE','The transition policy changed. Generate a new preview.');
    const source=await termRow(transition.source_term_id,actor.institutionId,db,true),destination=await termRow(transition.destination_term_id,actor.institutionId,db,true);
    if(!source||!destination)throw forbidden(); validateTerms(source,destination);
    const {rows:[clock]}=await db.query(`SELECT (now() AT TIME ZONE $1)::date::text AS today`,[source.timezone]);
    if(clock.today<=source.ends_on)throw new AppError(409,'SOURCE_TERM_STILL_OPEN','The source term cannot be closed before its end date.');
    const selected=(await db.query(`SELECT student_id FROM semester_transition_students WHERE transition_id=$1 ORDER BY student_id`,[id])).rows.map(r=>r.student_id);
    const recalculated=await transitionRows({actor,sourceTerm:source,destinationTerm:destination,studentIds:selected,db});
    if(recalculated.fingerprint!==transition.source_fingerprint)throw new AppError(409,'TRANSITION_STALE','Student hours, requirements, attendance reviews, recovery requests, or term data changed after preview. Refresh the preview.');
    if(recalculated.rows.some(r=>r.transitionStatus==='review_required'))throw new AppError(409,'TRANSITION_REVIEW_REQUIRED','Resolve missing requirements, pending DTR reviews, incomplete attendance sessions, or pending recovery shifts before finalizing.');
    const globalIssues=await institutionOpenIssues(actor.institutionId,source,db);
    if(globalIssues.pendingDtr||globalIssues.pendingRecovery||globalIssues.incompleteSessions)throw new AppError(409,'TERM_REVIEWS_PENDING',`Cannot close the source term: ${globalIssues.pendingDtr} DTR review(s), ${globalIssues.pendingRecovery} recovery shift review(s), and ${globalIssues.incompleteSessions} incomplete attendance session(s) remain institution-wide.`);
    const {rows:[closed]}=await db.query(`UPDATE academic_terms SET finalized_at=now(),finalized_by=$2 WHERE id=$1 AND finalized_at IS NULL RETURNING finalized_at`,[source.id,actor.id]);
    if(!closed)throw new AppError(409,'SOURCE_TERM_FINALIZED','The source term was finalized by another request.');
    await db.query(`UPDATE semester_transitions SET status='finalized',finalized_by=$2,finalized_at=now() WHERE id=$1`,[id,actor.id]);
    const destinationStudents=await db.query(`SELECT student_id,destination_required_hours,student_status
      FROM semester_transition_students WHERE transition_id=$1 ORDER BY student_id`,[id]);
    for(const student of destinationStudents.rows){
      const requirement=student.destination_required_hours==null?'No destination-term duty-hour requirement was assigned in this transition.':
        `Your destination-term duty-hour requirement is ${Number(student.destination_required_hours).toFixed(2)} hours.`;
      await createNotification(db,{recipientId:student.student_id,institutionId:actor.institutionId,type:'semester_transition_finalized',
        title:'Semester transition finalized',message:`The transition to ${destination.academic_year} ${destination.semester} was finalized. ${requirement} Outstanding source-term hours remain separate and were not transferred.`,
        relatedType:'academic_term',relatedId:destination.id,important:true,severity:'informational',actionUrl:'/student',dedupeKey:`semester-transition:${id}:finalized:${student.student_id}`});
    }
    await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'semester_transition.finalized',targetType:'semester_transition',targetId:id,before:{status:transition.status},after:{status:'finalized',sourceTermId:source.id,destinationTermId:destination.id,summary:transition.preview_data.summary},ip},db);
    return {id,status:'finalized',finalizedAt:closed.finalized_at,summary:transition.preview_data.summary};
  });
  } catch(err) {
    if(err.code==='40001') throw new AppError(409,'TRANSITION_STALE','Records changed while the transition was being finalized. Generate a fresh preview and try again.');
    if(['TRANSITION_STALE','TRANSITION_REVIEW_REQUIRED','TERM_REVIEWS_PENDING','SOURCE_TERM_STILL_OPEN'].includes(err.code)) {
      await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'semester_transition.finalize_failed',targetType:'semester_transition',targetId:id,after:{code:err.code},ip}).catch(()=>{});
    }
    throw err;
  }
}

export async function cancel({actor,id,ip}){
  if(actor.role!=='admin')throw forbidden();
  return withTransaction(async db=>{
    const {rows:[row]}=await db.query(`SELECT * FROM semester_transitions WHERE id=$1 AND institution_id=$2 FOR UPDATE`,[id,actor.institutionId]);
    if(!row)throw forbidden(); if(row.status!=='previewed')throw new AppError(409,'INVALID_TRANSITION','Only a previewed transition can be cancelled.');
    await db.query(`UPDATE semester_transitions SET status='cancelled',cancelled_by=$2,cancelled_at=now() WHERE id=$1`,[id,actor.id]);
    await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'semester_transition.cancelled',targetType:'semester_transition',targetId:id,before:{status:row.status},after:{status:'cancelled'},ip},db);
    return {id,status:'cancelled'};
  });
}

export async function history({actor}){
  if(actor.role!=='admin')throw forbidden();
  const {rows}=await query(`SELECT id,status,source_term_id,destination_term_id,policy,previewed_at,finalized_at,preview_data FROM semester_transitions WHERE institution_id=$1 ORDER BY created_at DESC LIMIT 50`,[actor.institutionId]);
  return rows.map(r=>({id:r.id,status:r.status,sourceTermId:r.source_term_id,destinationTermId:r.destination_term_id,policy:r.policy,previewedAt:r.previewed_at,finalizedAt:r.finalized_at,summary:r.preview_data.summary}));
}
