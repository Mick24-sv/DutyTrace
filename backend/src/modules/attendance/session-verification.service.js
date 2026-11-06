import { query, withTransaction } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { buildSessions } from './calc.js';
import { effectiveEvents } from '../attendance-discrepancies/attendance-discrepancies.service.js';
import { recordAudit } from '../audit/audit.service.js';
import { createNotification } from '../notifications/notifications.service.js';
import { matchesVerification } from './session-verification.rules.js';

// Approved monthly DTRs replace session verification totals, never add to them.
export async function sessionVerifiedSeconds(ids, fromDate, toDate, timezone, db = { query }) {
  const result = new Map();
  if (!ids.length) return result;
  const { rows } = await db.query(`SELECT v.* FROM attendance_session_verifications v
    WHERE v.student_id=ANY($1::uuid[]) AND v.work_date BETWEEN $2::date AND $3::date
    AND NOT EXISTS (SELECT 1 FROM monthly_dtrs d WHERE d.user_id=v.student_id
      AND d.month=to_char(v.work_date,'YYYY-MM') AND d.status='approved')`, [ids,fromDate,toDate]);
  if (!rows.length) return result;
  const events = await effectiveEvents(ids,{startDate:fromDate,nextDate:toDate,timezone,db});
  for (const id of ids) {
    const sessions = buildSessions(events.get(id) ?? [],{now:new Date(),timeZone:timezone,maxSessionSeconds:env.maxSessionHours*3600});
    const verified = sessions.filter(s=>rows.some(v=>v.student_id===id && matchesVerification(s,v)));
    if (verified.length) result.set(id,verified.reduce((sum,s)=>sum+s.seconds,0));
  }
  return result;
}

export async function verifySession(actor, studentId, input) {
  return withTransaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`attendance-correction:${studentId}`]);
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`attendance:${studentId}`]);
    const {rows:[student]} = await db.query(`SELECT u.id,i.timezone FROM users u
      JOIN institutions i ON i.id=u.institution_id JOIN duty_assignments a ON a.user_id=u.id AND a.ends_on IS NULL
      WHERE u.id=$1 AND u.institution_id=$2 AND u.role='student' AND a.office_id=$3`,[studentId,actor.institutionId,actor.office?.id]);
    if (!student) throw new AppError(403,'FORBIDDEN','This student is not assigned to your office.');
    const {rows:[dtr]}=await db.query(`SELECT status FROM monthly_dtrs WHERE user_id=$1 AND month=$2 FOR UPDATE`,[studentId,input.date.slice(0,7)]);
    if (dtr?.status==='approved') throw new AppError(409,'DTR_APPROVED','This month is already verified through an approved DTR.');
    const events=await effectiveEvents([studentId],{startDate:input.date,nextDate:input.date,timezone:student.timezone,db});
    const sessions=buildSessions(events.get(studentId)??[],{now:new Date(),timeZone:student.timezone,maxSessionSeconds:env.maxSessionHours*3600});
    const session=sessions.find(s=>s.id===input.sessionId && s.date===input.date && s.timeIn===input.timeIn && s.timeOut===input.timeOut);
    if (!session?.counted || session.seconds<=0 || Date.parse(session.timeOut)>Date.now()) throw new AppError(409,'SESSION_CHANGED','Only a completed, unflagged session with unchanged times can be verified. Refresh attendance.');
    const {rows:pending}=await db.query(`SELECT 1 FROM attendance_discrepancies WHERE student_id=$1
      AND status IN ('open','explanation_submitted','under_review')
      AND original_details->'originalSession'->>'id'=$2`,[studentId,session.id]);
    if(pending.length) throw new AppError(409,'CORRECTION_PENDING','Review the pending correction for this session before verifying its hours.');
    const {rows:overlap}=await db.query(`SELECT 1 FROM historical_duty_credits WHERE student_id=$1
      AND credit_month=$2 AND status IN ('approved','pending_admin') AND (granularity='monthly_total' OR work_date=$3::date)`,[studentId,input.date.slice(0,7),input.date]);
    if(overlap.length) throw new AppError(409,'HISTORICAL_OVERLAP','Historical credits already cover this date. Resolve those credits before verifying attendance.');
    const {rows:[saved]}=await db.query(`INSERT INTO attendance_session_verifications
      (institution_id,student_id,supervisor_id,office_id,session_id,work_date,time_in,time_out,seconds,explanation)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`,
      [actor.institutionId,studentId,actor.id,actor.office.id,session.id,session.date,session.timeIn,session.timeOut,session.seconds,input.explanation]);
    if(saved){
      await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:'attendance.session_verified',targetType:'user',targetId:studentId,after:{...session,explanation:input.explanation}},db);
      await createNotification(db,{recipientId:studentId,institutionId:actor.institutionId,type:'attendance_session_verified',title:'Duty hours verified',message:`Your supervisor verified ${(session.seconds/3600).toFixed(2)} hours for ${session.date}. ${input.explanation}`,dedupeKey:`session-verification:${saved.id}`,actionUrl:'/student/attendance'});
    }
    return {verified:true};
  });
}
