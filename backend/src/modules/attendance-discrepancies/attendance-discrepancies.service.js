import { query, withTransaction } from '../../db/pool.js';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { createNotification, notifyOfficeSupervisors } from '../notifications/notifications.service.js';
import { buildSessions, localDateKey } from '../attendance/calc.js';
import { canMoveDiscrepancy, sessionsOverlap, isWithinShiftTolerance } from './discrepancy.rules.js';

const ACTIVE = ['open', 'explanation_submitted', 'under_review'];
const fail = (status, code, message) => new AppError(status, code, message);

/** Effective attendance overlay. Original QR events are never changed; approved adjustment
 * events replace only the referenced originals and are shared by reports and dashboards. */
export async function effectiveEvents(userIds, { startDate, nextDate, timezone, db = { query } }) {
  if (!userIds.length) return new Map();
  const [raw, adjustments] = await Promise.all([
    db.query(`SELECT user_id,id,event_type,recorded_at,office_id FROM attendance_events
      WHERE user_id=ANY($1::uuid[]) AND recorded_at >= (($2::date - 2)::timestamp AT TIME ZONE $4)
        AND recorded_at < (($3::date + 2)::timestamp AT TIME ZONE $4) ORDER BY user_id,recorded_at,seq`,
    [userIds, startDate, nextDate, timezone]),
    db.query(`SELECT a.id,a.student_id,COALESCE(array_agg(s.event_id) FILTER(WHERE s.event_id IS NOT NULL),ARRAY[]::uuid[]) AS replaces_event_ids,
        a.effective_events FROM attendance_adjustments a LEFT JOIN attendance_adjustment_sources s ON s.adjustment_id=a.id
      WHERE a.student_id=ANY($1::uuid[]) AND (
        EXISTS(SELECT 1 FROM jsonb_array_elements(a.effective_events) x
          WHERE (x->>'recordedAt')::timestamptz >= (($2::date-2)::timestamp AT TIME ZONE $4)
            AND (x->>'recordedAt')::timestamptz < (($3::date+2)::timestamp AT TIME ZONE $4))
        OR EXISTS(SELECT 1 FROM attendance_adjustment_sources src JOIN attendance_events e ON e.id=src.event_id
          WHERE src.adjustment_id=a.id AND e.recorded_at >= (($2::date-2)::timestamp AT TIME ZONE $4)
            AND e.recorded_at < (($3::date+2)::timestamp AT TIME ZONE $4))
      ) GROUP BY a.id`, [userIds,startDate,nextDate,timezone]),
  ]);
  const result = new Map(userIds.map((id) => [id, []]));
  const removed = new Map(userIds.map((id) => [id, new Set()]));
  for (const a of adjustments.rows) {
    for (const id of a.replaces_event_ids ?? []) removed.get(a.student_id)?.add(id);
  }
  for (const e of raw.rows) if (!removed.get(e.user_id)?.has(e.id)) {
    result.get(e.user_id).push({ id: e.id, eventType: e.event_type, recordedAt: e.recorded_at, officeId: e.office_id });
  }
  for (const a of adjustments.rows) {
    const list = Array.isArray(a.effective_events) ? a.effective_events : [];
    for (const e of list) result.get(a.student_id)?.push({
      id: `adjustment:${a.student_id}:${e.id}`, eventType: e.eventType, recordedAt: new Date(e.recordedAt), officeId: e.officeId,
      adjusted: true,
    });
  }
  for (const list of result.values()) list.sort((a,b) => new Date(a.recordedAt)-new Date(b.recordedAt));
  return result;
}

export async function verifiedAdjustmentSeconds(userIds, startMonth, endMonth, db={query}, dateRange=null) {
  if(!userIds.length) return new Map();
  const params=[userIds,startMonth,endMonth];let clause='';
  if(dateRange){params.push(dateRange.fromDate,dateRange.toDate,dateRange.timezone);clause=` AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(a.effective_events) e
    WHERE (e->>'recordedAt')::timestamptz >= ($4::date::timestamp AT TIME ZONE $6)
      AND (e->>'recordedAt')::timestamptz < (($5::date+1)::timestamp AT TIME ZONE $6))`;}
  const {rows}=await db.query(`SELECT a.student_id,sum(a.verified_delta_seconds)::bigint AS seconds
    FROM attendance_adjustments a WHERE a.student_id=ANY($1::uuid[]) AND a.dtr_month BETWEEN $2 AND $3 ${clause}
    GROUP BY a.student_id`,params);
  return new Map(rows.map(r=>[r.student_id,Number(r.seconds||0)]));
}

async function addHistory(db, id, actorId, action, from, to, note = null, details = {}) {
  await db.query(`INSERT INTO attendance_discrepancy_history(discrepancy_id,actor_id,action,from_status,to_status,note,details)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [id, actorId, action, from, to, note, JSON.stringify(details)]);
}

function visible(row, user) {
  if (!row || row.institution_id !== user.institutionId) throw fail(404, 'NOT_FOUND', 'Attendance discrepancy not found.');
  if (user.role === 'student' && row.student_id !== user.id) throw fail(404, 'NOT_FOUND', 'Attendance discrepancy not found.');
  if (user.role === 'supervisor' && row.office_id !== user.office?.id) throw fail(404, 'NOT_FOUND', 'Attendance discrepancy not found.');
}

async function rawRow(id, db = { query }, lock = false) {
  return (await db.query(`SELECT d.*,u.full_name AS student_name,u.email AS student_email,o.name AS office_name,
    o.code AS office_code FROM attendance_discrepancies d JOIN users u ON u.id=d.student_id
    LEFT JOIN offices o ON o.id=d.office_id WHERE d.id=$1${lock ? ' FOR UPDATE OF d' : ''}`, [id])).rows[0];
}

const mapRow = (r) => ({
  id:r.id, institutionId:r.institution_id, student:{id:r.student_id,fullName:r.student_name,email:r.student_email},
  office:r.office_id?{id:r.office_id,name:r.office_name,code:r.office_code}:null,
  scheduleId:r.schedule_id, attendanceEventId:r.attendance_event_id, date:r.shift_date, type:r.discrepancy_type, status:r.status,
  originalDetails:r.original_details, detectionReason:r.detection_reason, explanation:r.student_explanation,
  proposedCorrection:r.proposed_correction, supervisorDecision:r.supervisor_decision, supervisorRemarks:r.supervisor_remarks,
  reviewerId:r.reviewer_id, detectedAt:r.detected_at, explanationSubmittedAt:r.explanation_submitted_at,
  reviewedAt:r.reviewed_at, resolvedAt:r.resolved_at,
});

export async function list({ user, status, type, date, search, limit=100 }) {
  const params=[user.institutionId]; const where=['d.institution_id=$1'];
  if(user.role==='student'){params.push(user.id);where.push(`d.student_id=$${params.length}`);}
  if(user.role==='supervisor'){ if(!user.office?.id) return {items:[],total:0}; params.push(user.office.id);where.push(`d.office_id=$${params.length}`); }
  if(status){params.push(status);where.push(`d.status=$${params.length}`);}
  if(type){params.push(type);where.push(`d.discrepancy_type=$${params.length}`);}
  if(date){params.push(date);where.push(`d.shift_date=$${params.length}::date`);}
  if(search){params.push(`%${search}%`);where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);}
  params.push(Math.min(Math.max(Number(limit)||100,1),200));
  const {rows}=await query(`SELECT d.*,u.full_name AS student_name,u.email AS student_email,o.name AS office_name,o.code AS office_code,
      count(*) OVER()::int AS total FROM attendance_discrepancies d JOIN users u ON u.id=d.student_id
      LEFT JOIN offices o ON o.id=d.office_id WHERE ${where.join(' AND ')} ORDER BY d.detected_at DESC LIMIT $${params.length}`,params);
  return {items:rows.map(mapRow),total:rows[0]?.total??0};
}

export async function summary(user) {
  const conditions=['institution_id=$1'];const p=[user.institutionId];
  if(user.role==='student'){p.push(user.id);conditions.push(`student_id=$${p.length}`);}
  if(user.role==='supervisor'){if(!user.office?.id)return {open:0,pendingReview:0,resolved:0,rejected:0,byOffice:[]};p.push(user.office.id);conditions.push(`office_id=$${p.length}`);}
  const {rows}=await query(`SELECT count(*) FILTER(WHERE status IN('open','explanation_submitted','under_review'))::int open,
    count(*) FILTER(WHERE status IN('open','explanation_submitted','under_review'))::int pending_review,
    count(*) FILTER(WHERE status IN('approved_correction','resolved'))::int resolved,
    count(*) FILTER(WHERE status='rejected')::int rejected FROM attendance_discrepancies WHERE ${conditions.join(' AND ')}`,p);
  const byOffice=user.role==='admin'? (await query(`SELECT o.id,o.code,o.name,count(d.id)::int total,
    count(d.id) FILTER(WHERE d.status IN('open','explanation_submitted','under_review'))::int open
    FROM offices o LEFT JOIN attendance_discrepancies d ON d.office_id=o.id AND d.institution_id=$1
    WHERE o.institution_id=$1 GROUP BY o.id ORDER BY o.name`,[user.institutionId])).rows:[];
  const repeatedStudents=user.role==='admin'?(await query(`SELECT d.student_id,u.full_name,count(*)::int discrepancies,
      count(*) FILTER(WHERE d.status IN('open','explanation_submitted','under_review'))::int open
      FROM attendance_discrepancies d JOIN users u ON u.id=d.student_id WHERE d.institution_id=$1
      GROUP BY d.student_id,u.full_name HAVING count(*)>=3 ORDER BY count(*) DESC,u.full_name LIMIT 20`,[user.institutionId])).rows.map(r=>({studentId:r.student_id,fullName:r.full_name,total:r.discrepancies,open:r.open})):[];
  const r=rows[0];return {open:r.open,pendingReview:r.pending_review,resolved:r.resolved,rejected:r.rejected,byOffice,repeatedStudents};
}

export async function detail({user,id}, db={query}) {
  const row=await rawRow(id,db); visible(row,user);
  const [{rows},policy]=await Promise.all([db.query(`SELECT h.id,h.action,h.from_status,h.to_status,h.note,h.details,h.created_at,
    u.full_name,u.role FROM attendance_discrepancy_history h LEFT JOIN users u ON u.id=h.actor_id
    WHERE h.discrepancy_id=$1 ORDER BY h.created_at,h.id`,[id]),db.query('SELECT timezone FROM institutions WHERE id=$1',[row.institution_id])]);
  return {...mapRow(row),timezone:policy.rows[0]?.timezone??'UTC',history:rows.map(h=>({id:Number(h.id),action:h.action,fromStatus:h.from_status,toStatus:h.to_status,
    note:h.note,details:h.details,at:h.created_at,actor:h.full_name?{name:h.full_name,role:h.role}:null}))};
}

export async function explain({user,id,explanation,correction,ip}) {
  return withTransaction(async db=>{
    const row=await rawRow(id,db,true); visible(row,user);
    if(user.role!=='student'||row.student_id!==user.id) throw fail(403,'FORBIDDEN','Only the Student Assistant can submit an explanation.');
    if(!ACTIVE.includes(row.status)) throw fail(409,'INVALID_TRANSITION','This discrepancy is no longer accepting explanations.');
    if(correction){
      const required=row.original_details?.eventIds??(row.original_details?.attendanceEventId?[row.original_details.attendanceEventId]:[]);
      const supplied=new Set(correction.replacesEventIds??[]);
      if(required.some(eventId=>!supplied.has(eventId))) throw fail(400,'CORRECTION_EVENTS_REQUIRED','Include the original attendance event(s) being corrected.');
    }
    const next='explanation_submitted';
    await db.query(`UPDATE attendance_discrepancies SET status=$2,student_explanation=$3,
      proposed_correction=COALESCE($4::jsonb,proposed_correction),explanation_submitted_at=now(),updated_at=now() WHERE id=$1`,
    [id,next,explanation,correction?JSON.stringify(correction):null]);
    await addHistory(db,id,user.id,correction?'correction_requested':'explanation_submitted',row.status,next,explanation,
      correction?{proposedCorrection:correction}:{});
    await notifyOfficeSupervisors(db,{officeId:row.office_id,institutionId:row.institution_id,type:'attendance_discrepancy_review',
      title:'Attendance discrepancy needs review',message:`${row.student_name} submitted an attendance explanation${correction?' and correction request':''}.`,
      relatedType:'attendance_discrepancy',relatedId:id,important:true,dedupeKey:`attendance-discrepancy:${id}:submission:${Date.now()}`});
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:correction?'attendance_discrepancy.correction_requested':'attendance_discrepancy.explanation_submitted',
      targetType:'attendance_discrepancy',targetId:id,after:{status:next},ip},db);
    return detail({user,id},db);
  });
}

async function reviewAction({user,id,action,remarks,ip,approve=false,reject=false,clarify=false}) {
  return withTransaction(async db=>{
    const row=await rawRow(id,db,true);visible(row,user);
    if(user.role!=='supervisor' || row.office_id!==user.office?.id) throw fail(403,'FORBIDDEN','Only the assigned Office Supervisor can review this record.');
    if(!ACTIVE.includes(row.status)) throw fail(409,'INVALID_TRANSITION','This discrepancy has already been decided.');
    if(action==='review_started'&&!['open','explanation_submitted'].includes(row.status)) throw fail(409,'INVALID_TRANSITION','This discrepancy is already under review.');
    if((approve||reject)&&!['explanation_submitted','under_review'].includes(row.status)) throw fail(409,'INVALID_TRANSITION','A student explanation must be submitted before a decision.');
    if(approve){
      if(!canMoveDiscrepancy(row.status,'approved_correction')) throw fail(409,'INVALID_TRANSITION','This discrepancy cannot accept a correction.');
      if(!row.proposed_correction?.events?.length) throw fail(400,'CORRECTION_REQUIRED','The student must submit proposed clock times before a correction can be approved.');
      const proposal=row.proposed_correction;
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`attendance-correction:${row.student_id}`]);
      const events=proposal.events.map(e=>({id:crypto.randomUUID(),eventType:e.eventType,recordedAt:new Date(e.recordedAt).toISOString(),officeId:row.office_id}));
      if(events.length!==2 || events[0].eventType!=='time_in'||events[1].eventType!=='time_out' || new Date(events[0].recordedAt)>=new Date(events[1].recordedAt))
        throw fail(400,'INVALID_CORRECTION','A correction must contain one valid clock-in and a later clock-out.');
      const start=new Date(events[0].recordedAt),end=new Date(events[1].recordedAt);
      if((end-start)/3600000>12 || start>new Date() || end>new Date()) throw fail(400,'INVALID_CORRECTION','Corrected times must be in the past and no longer than 12 hours.');
      const {rows:policyRows}=await db.query(`SELECT timezone,attendance_early_tolerance_minutes,attendance_late_tolerance_minutes
        FROM institutions WHERE id=$1`,[row.institution_id]);
      const timezone=policyRows[0]?.timezone??'UTC';
      if(localDateKey(start,timezone).slice(0,7)!==localDateKey(end,timezone).slice(0,7)) throw fail(400,'INVALID_CORRECTION','A corrected session cannot cross a month boundary.');
      if(row.shift_date && localDateKey(start,timezone)!==String(row.shift_date).slice(0,10))
        throw fail(400,'INVALID_CORRECTION','The corrected clock-in must be on the date of the approved duty shift.');
      const replaceIds=proposal.replacesEventIds??[];
      if(replaceIds.length){
        const owned=await db.query(`SELECT count(*)::int n FROM attendance_events WHERE user_id=$1 AND id=ANY($2::uuid[])`,[row.student_id,replaceIds]);
        if(owned.rows[0].n!==replaceIds.length) throw fail(400,'INVALID_CORRECTION','The correction references an attendance event that does not belong to this student.');
        const reused=await db.query('SELECT 1 FROM attendance_adjustment_sources WHERE event_id=ANY($1::uuid[]) LIMIT 1',[replaceIds]);
        if(reused.rowCount) throw fail(409,'EVENT_ALREADY_ADJUSTED','An original attendance event can only be adjusted once.');
      }
      if(row.original_details?.scheduledStart&&row.original_details?.scheduledEnd){
        const scheduledStart=new Date(row.original_details.scheduledStart),scheduledEnd=new Date(row.original_details.scheduledEnd);
        const early=Number(policyRows[0]?.attendance_early_tolerance_minutes??0)*60000;
        const late=Number(policyRows[0]?.attendance_late_tolerance_minutes??0)*60000;
        if(start.getTime()<scheduledStart.getTime()-early||end.getTime()>scheduledEnd.getTime()+late)
          throw fail(400,'SCHEDULE_CONSTRAINT','Proposed attendance falls outside the approved shift and its configured tolerances.');
      }
      const month=localDateKey(start,env.timezone).slice(0,7);
      const nextMonth=month.endsWith('-12')?`${Number(month.slice(0,4))+1}-01`:`${month.slice(0,5)}${String(Number(month.slice(5))+1).padStart(2,'0')}`;
      const current=await effectiveEvents([row.student_id],{startDate:`${month}-01`,nextDate:`${nextMonth}-01`,timezone:env.timezone,db});
      const replaceSet=new Set(replaceIds);
      const remaining=(current.get(row.student_id)??[]).filter(e=>!replaceSet.has(e.id));
      const now=(await db.query('SELECT now() AS now')).rows[0].now;
      const byOffice=new Map();for(const e of remaining){const office=e.officeId??row.office_id;if(!byOffice.has(office))byOffice.set(office,[]);byOffice.get(office).push(e);}
      const sessions=[...byOffice.values()].flatMap(list=>buildSessions(list,{now,timeZone:timezone,maxSessionSeconds:12*3600}));
      if(sessions.some(s=>s.status==='in_progress')) throw fail(409,'ACTIVE_ATTENDANCE','Wait until the active attendance session is closed before approving a correction.');
      if(sessions.some(s=>s.counted&&s.timeIn&&s.timeOut&&sessionsOverlap({start:s.timeIn,end:s.timeOut},{start,end})))
        throw fail(409,'ATTENDANCE_OVERLAP','The proposed times overlap another attendance session, including one at another office.');
      const existingByOffice=new Map();
      for(const [office,officeEvents] of byOffice){
        const officeSessions=buildSessions(officeEvents,{now,timeZone:timezone,maxSessionSeconds:12*3600}).filter(s=>s.counted&&s.timeIn&&s.timeOut);
        existingByOffice.set(office,officeSessions);
      }
      if([...existingByOffice.values()].flat().some(s=>sessionsOverlap({start:s.timeIn,end:s.timeOut},{start,end})))
        throw fail(409,'ATTENDANCE_OVERLAP','The proposed times overlap another attendance session, including one at another office.');
      if(row.schedule_id){
        const sched=await db.query(`SELECT 1 FROM student_duty_schedules WHERE id=$1 AND student_id=$2 AND institution_id=$3
          AND office_id=$4 AND status='approved' AND effective_starts_on <= $5::date AND (effective_ends_on IS NULL OR effective_ends_on >= $5::date)`,
        [row.schedule_id,row.student_id,row.institution_id,row.office_id,row.shift_date]);
        if(!sched.rowCount) throw fail(409,'SCHEDULE_CHANGED','The approved shift changed after this discrepancy was created. Refresh the schedule and review again.');
      }
      if(row.original_details?.recoveryShiftId){
        const recovery=await db.query(`SELECT 1 FROM duty_recovery_shifts WHERE id=$1 AND student_id=$2 AND institution_id=$3
          AND office_id=$4 AND status='approved' AND shift_date=$5::date`,
        [row.original_details.recoveryShiftId,row.student_id,row.institution_id,row.office_id,row.shift_date]);
        if(!recovery.rowCount) throw fail(409,'SCHEDULE_CHANGED','The approved recovery shift changed after this discrepancy was created.');
      }
      const existingDtr=await db.query(`SELECT id,verified_seconds FROM monthly_dtrs WHERE user_id=$1 AND month=$2 AND status='approved' FOR UPDATE`,[row.student_id,month]);
      let verifiedDelta=0;
      if(existingDtr.rowCount){
        const beforeMap=await effectiveEvents([row.student_id],{startDate:`${month}-01`,nextDate:`${nextMonth}-01`,timezone:env.timezone,db});
        const nowResult=await db.query('SELECT now() AS now');
        const beforeSessions=buildSessions(beforeMap.get(row.student_id),{now:nowResult.rows[0].now,timeZone:env.timezone,maxSessionSeconds:12*3600});
        const beforeSecs=beforeSessions.reduce((n,s)=>n+(s.counted&&s.date.startsWith(`${month}-`)?s.seconds:0),0);
        const replaced=new Set(replaceIds);
        const afterEvents=(beforeMap.get(row.student_id)??[]).filter(e=>!replaced.has(e.id));
        afterEvents.push(...events.map((e,index)=>({id:`pending-correction-${id}-${index}`,eventType:e.eventType,recordedAt:new Date(e.recordedAt)})));
        afterEvents.sort((a,b)=>new Date(a.recordedAt)-new Date(b.recordedAt));
        const afterSessions=buildSessions(afterEvents,{now:nowResult.rows[0].now,timeZone:env.timezone,maxSessionSeconds:12*3600});
        const afterSecs=afterSessions.reduce((n,s)=>n+(s.counted&&s.date.startsWith(`${month}-`)?s.seconds:0),0);
        const previousAdjustments=await db.query('SELECT coalesce(sum(verified_delta_seconds),0)::int AS seconds FROM attendance_adjustments WHERE student_id=$1 AND dtr_month=$2',[row.student_id,month]);
        const currentVerified=Number(existingDtr.rows[0].verified_seconds)+Number(previousAdjustments.rows[0].seconds);
        verifiedDelta=afterSecs-currentVerified;
      }
      // Approved corrections are represented separately; a finalized DTR is not edited in place.
      const adjustment=await db.query(`INSERT INTO attendance_adjustments(discrepancy_id,institution_id,student_id,office_id,effective_events,dtr_month,approved_by,verified_delta_seconds)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) RETURNING id`,[id,row.institution_id,row.student_id,row.office_id,
        JSON.stringify(events),existingDtr.rowCount?month:null,user.id,verifiedDelta]);
      for(const eventId of replaceIds) await db.query('INSERT INTO attendance_adjustment_sources(adjustment_id,event_id) VALUES($1,$2)',[adjustment.rows[0].id,eventId]);
      await db.query(`UPDATE attendance_discrepancies SET status='approved_correction',supervisor_decision='approved',supervisor_remarks=$2,
        reviewer_id=$3,reviewed_at=now(),resolved_at=now(),updated_at=now() WHERE id=$1`,[id,remarks,user.id]);
      await addHistory(db,id,user.id,'correction_approved',row.status,'approved_correction',remarks,{adjustmentApplied:true});
      await createNotification(db,{recipientId:row.student_id,institutionId:row.institution_id,type:'attendance_correction_approved',
        title:'Attendance correction approved',message:remarks||'Your attendance correction was approved and will be included in effective duty-hour calculations.',
        relatedType:'attendance_discrepancy',relatedId:id,important:true,dedupeKey:`attendance-discrepancy:${id}:approved`});
    } else {
      const next=clarify?'open':reject?'rejected':action==='resolved'?'resolved':'under_review';
      if(next!==row.status&&!canMoveDiscrepancy(row.status,next)) throw fail(409,'INVALID_TRANSITION','That attendance discrepancy status change is not allowed.');
      await db.query(`UPDATE attendance_discrepancies SET status=$2,supervisor_decision=$3,supervisor_remarks=$4,reviewer_id=$5,
        reviewed_at=now(),resolved_at=CASE WHEN $2 IN('rejected','resolved') THEN now() ELSE resolved_at END,updated_at=now() WHERE id=$1`,
      [id,next,clarify?'clarification_requested':reject?'rejected':'review_started',remarks,user.id]);
      await addHistory(db,id, user.id, action,row.status,next,remarks);
      await createNotification(db,{recipientId:row.student_id,institutionId:row.institution_id,type:`attendance_discrepancy_${action}`,
        title:clarify?'More information requested':reject?'Attendance correction rejected':'Attendance review updated',
        message:remarks,relatedType:'attendance_discrepancy',relatedId:id,important:true,dedupeKey:`attendance-discrepancy:${id}:${action}:${Date.now()}`});
    }
    if(approve||reject||action==='resolved') await db.query(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,now()),updated_at=now()
      WHERE institution_id=$1 AND related_type='attendance_discrepancy' AND related_id=$2`,[row.institution_id,id]);
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:`attendance_discrepancy.${action}`,
      targetType:'attendance_discrepancy',targetId:id,before:{status:row.status},after:{decision:action},ip},db);
    if(approve) await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'attendance_discrepancy.adjustment_applied',
      targetType:'attendance_adjustment',targetId:(await db.query('SELECT id FROM attendance_adjustments WHERE discrepancy_id=$1',[id])).rows[0]?.id,
      after:{discrepancyId:id,eventCount:2},ip},db);
    return detail({user,id},db);
  });
}

export const startReview=(args)=>reviewAction({...args,action:'review_started'});
export const approve=(args)=>reviewAction({...args,action:'correction_approved',approve:true});
export const reject=(args)=>reviewAction({...args,action:'correction_rejected',reject:true});
export const requestClarification=(args)=>reviewAction({...args,action:'clarification_requested',clarify:true});
export const resolve=(args)=>reviewAction({...args,action:'resolved'});

async function upsertDetection(db, data) {
  const attendanceEventId=typeof data.eventId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.eventId)?data.eventId:null;
  const {rows}=await db.query(`INSERT INTO attendance_discrepancies(institution_id,student_id,office_id,schedule_id,attendance_event_id,shift_date,
    discrepancy_type,dedupe_key,original_details,detection_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
    ON CONFLICT(institution_id,dedupe_key) DO UPDATE SET updated_at=now()
    RETURNING id,(xmax=0) AS created,status`,[data.institutionId,data.studentId,data.officeId,data.scheduleId,attendanceEventId,data.date,
    data.type,data.key,JSON.stringify(data.details),data.reason]);
  if(rows[0].created){
    await addHistory(db,rows[0].id,null,'detected',null,'open',data.reason,data.details);
    await notifyOfficeSupervisors(db,{officeId:data.officeId,institutionId:data.institutionId,type:'attendance_discrepancy_detected',
      title:'Attendance discrepancy detected',message:'A scheduled attendance record needs review.',relatedType:'attendance_discrepancy',
      relatedId:rows[0].id,important:true,dedupeKey:`attendance-discrepancy:${rows[0].id}:detected`});
    await createNotification(db,{recipientId:data.studentId,institutionId:data.institutionId,type:'attendance_discrepancy_detected',
      title:'Attendance record needs review',message:'A discrepancy was found in your duty attendance. You can review and explain it in Attendance Discrepancies.',
      relatedType:'attendance_discrepancy',relatedId:rows[0].id,important:true,dedupeKey:`attendance-discrepancy:${rows[0].id}:detected`});
    await recordAudit({actorId:null,institutionId:data.institutionId,action:'attendance_discrepancy.detected',targetType:'attendance_discrepancy',
      targetId:rows[0].id,after:{type:data.type,studentId:data.studentId,officeId:data.officeId}} ,db);
  }
  return rows[0];
}

/** Reconciles ended, approved weekly shifts plus raw attendance. Safe for repeat invocation.
 * Suitable for attendance-driven calls and an external scheduled job; no in-process timer. */
export async function reconcile({institutionId=null,officeId=null,studentId=null,db={query}}={}) {
  const scope=[];const scopeParams=[];
  if(institutionId){scopeParams.push(institutionId);scope.push(`d.institution_id=$${scopeParams.length}`);}
  if(officeId){scopeParams.push(officeId);scope.push(`d.office_id=$${scopeParams.length}`);}
  if(studentId){scopeParams.push(studentId);scope.push(`d.student_id=$${scopeParams.length}`);}
  // QR attendance cannot be expected before an office had its first QR code.
  // Close previously generated no-show flags before that rollout date instead of
  // repeatedly treating pre-DutyTrace scheduled hours as missing QR attendance.
  const preQr=await db.query(`WITH qr_start AS (
      SELECT o.id AS office_id, o.institution_id,
        COALESCE(min((q.created_at AT TIME ZONE i.timezone)::date),
          (now() AT TIME ZONE i.timezone)::date + 1) AS first_qr_date
      FROM offices o JOIN institutions i ON i.id=o.institution_id
      LEFT JOIN office_qr_codes q ON q.office_id=o.id
      GROUP BY o.id,o.institution_id,i.timezone
    ), candidates AS (
      SELECT d.id,d.status AS old_status FROM attendance_discrepancies d
      JOIN qr_start q ON q.office_id=d.office_id AND q.institution_id=d.institution_id
      WHERE d.discrepancy_type='scheduled_no_attendance' AND d.shift_date<q.first_qr_date
        AND d.status IN('open','explanation_submitted','under_review')
        ${scope.length?`AND ${scope.join(' AND ')}`:''}
      FOR UPDATE OF d
    ) UPDATE attendance_discrepancies d SET status='superseded',supervisor_decision='attendance_tracking_not_active',
      supervisor_remarks='This scheduled shift predates QR attendance availability for the office and is not a QR attendance discrepancy.',
      reviewed_at=now(),resolved_at=now(),updated_at=now()
      FROM candidates c WHERE d.id=c.id RETURNING d.id,c.old_status`,scopeParams);
  for(const d of preQr.rows){
    await addHistory(db,d.id,null,'attendance_tracking_not_active',d.old_status,'superseded',
      'This scheduled shift predates QR attendance availability for the office and is not a QR attendance discrepancy.');
    await db.query(`UPDATE notifications SET read_at=COALESCE(read_at,now()),resolved_at=COALESCE(resolved_at,now()),updated_at=now()
      WHERE related_type='attendance_discrepancy' AND related_id=$1 AND resolved_at IS NULL`,[d.id]);
  }
  const staleRecoveries=await db.query(`WITH candidates AS (
      SELECT d.id,d.status AS old_status,d.student_id,d.institution_id FROM attendance_discrepancies d
      JOIN duty_recovery_shifts r ON d.original_details->>'recoveryShiftId'=r.id::text
      WHERE d.status IN('open','explanation_submitted','under_review') AND r.status<>'approved'
        ${scope.length?`AND ${scope.join(' AND ')}`:''} FOR UPDATE OF d
    ) UPDATE attendance_discrepancies d SET status='superseded',supervisor_decision='recovery_shift_changed',
      supervisor_remarks='The approved recovery shift changed after this discrepancy was detected.',reviewed_at=now(),resolved_at=now(),updated_at=now()
      FROM candidates c WHERE d.id=c.id RETURNING d.id,c.old_status,c.student_id,c.institution_id`,scopeParams);
  for(const d of staleRecoveries.rows){
    await addHistory(db,d.id,null,'recovery_shift_changed',d.old_status,'superseded','The approved recovery shift changed after this discrepancy was detected.');
    await createNotification(db,{recipientId:d.student_id,institutionId:d.institution_id,type:'attendance_discrepancy_superseded',
      title:'Attendance discrepancy updated',message:'The approved recovery shift changed, so the earlier discrepancy was superseded.',
      relatedType:'attendance_discrepancy',relatedId:d.id,dedupeKey:`attendance-discrepancy:${d.id}:superseded`});
  }
  const superseded=await db.query(`WITH candidates AS (
      SELECT d.id,d.status AS old_status FROM attendance_discrepancies d JOIN student_duty_schedules s ON s.id=d.schedule_id
      WHERE d.status IN('open','explanation_submitted','under_review') ${scope.length?`AND ${scope.join(' AND ')}`:''}
        AND (s.status<>'approved' OR EXISTS(SELECT 1 FROM student_duty_schedules newer WHERE newer.student_id=s.student_id
          AND newer.term_id=s.term_id AND newer.status='approved' AND newer.version>s.version
          AND newer.effective_starts_on<=d.shift_date AND (newer.effective_ends_on IS NULL OR newer.effective_ends_on>=d.shift_date)))
      FOR UPDATE OF d
    ) UPDATE attendance_discrepancies d SET status='superseded',supervisor_decision='schedule_changed',
      supervisor_remarks='The approved duty schedule changed after this discrepancy was detected.',reviewed_at=now(),resolved_at=now(),updated_at=now()
      FROM candidates c WHERE d.id=c.id RETURNING d.id,c.old_status,d.status`,scopeParams);
  for(const d of superseded.rows){
    await addHistory(db,d.id,null,'schedule_changed',d.old_status,'superseded','The approved duty schedule changed after this discrepancy was detected.');
    const {rows:[record]}=await db.query('SELECT student_id,institution_id FROM attendance_discrepancies WHERE id=$1',[d.id]);
    await createNotification(db,{recipientId:record.student_id,institutionId:record.institution_id,type:'attendance_discrepancy_superseded',
      title:'Attendance discrepancy updated',message:'The approved schedule changed, so the earlier discrepancy was superseded.',
      relatedType:'attendance_discrepancy',relatedId:d.id,dedupeKey:`attendance-discrepancy:${d.id}:superseded`});
  }
  const params=[];const where=["s.status='approved'","s.effective_starts_on <= (now() AT TIME ZONE t.timezone)::date",
    "s.version=(SELECT max(latest.version) FROM student_duty_schedules latest WHERE latest.student_id=s.student_id AND latest.term_id=s.term_id AND latest.status='approved')"];
  if(institutionId){params.push(institutionId);where.push(`s.institution_id=$${params.length}`);}
  if(officeId){params.push(officeId);where.push(`s.office_id=$${params.length}`);}
  if(studentId){params.push(studentId);where.push(`s.student_id=$${params.length}`);}
  const {rows:shifts}=await db.query(`SELECT s.id schedule_id,s.institution_id,s.student_id,s.office_id,
    to_char(day::date,'YYYY-MM-DD') shift_date,d.weekday,
    to_char((day::date + d.starts_at),'YYYY-MM-DD"T"HH24:MI:SS') start_local,
    to_char((day::date + d.ends_at),'YYYY-MM-DD"T"HH24:MI:SS') end_local,
    to_char((day::date + d.afternoon_starts_at),'YYYY-MM-DD"T"HH24:MI:SS') afternoon_start_local,
    to_char((day::date + d.afternoon_ends_at),'YYYY-MM-DD"T"HH24:MI:SS') afternoon_end_local,
    ((day::date+d.starts_at) AT TIME ZONE t.timezone) morning_starts_at,
    ((day::date+d.ends_at) AT TIME ZONE t.timezone) morning_ends_at,
    ((day::date+d.afternoon_starts_at) AT TIME ZONE t.timezone) afternoon_starts_at,
    ((day::date+d.afternoon_ends_at) AT TIME ZONE t.timezone) afternoon_ends_at,
    now() >= ((day::date+d.ends_at) AT TIME ZONE t.timezone)+(i.attendance_discrepancy_grace_minutes*interval '1 minute') morning_ended,
    CASE WHEN d.afternoon_ends_at IS NOT NULL THEN now() >= ((day::date+d.afternoon_ends_at) AT TIME ZONE t.timezone)+(i.attendance_discrepancy_grace_minutes*interval '1 minute') ELSE false END afternoon_ended,
    t.timezone,
    COALESCE(NULLIF(s.policy_snapshot->'configuration'->'attendance'->>'missingClockOutGraceMinutes','')::integer,i.attendance_discrepancy_grace_minutes) AS attendance_discrepancy_grace_minutes,
    COALESCE(NULLIF(s.policy_snapshot->'configuration'->'attendance'->>'earlyClockInToleranceMinutes','')::integer,i.attendance_early_tolerance_minutes) AS attendance_early_tolerance_minutes,
    COALESCE(NULLIF(s.policy_snapshot->'configuration'->'attendance'->>'lateClockOutToleranceMinutes','')::integer,i.attendance_late_tolerance_minutes) AS attendance_late_tolerance_minutes
    FROM student_duty_schedules s JOIN academic_terms t ON t.id=s.term_id JOIN institutions i ON i.id=s.institution_id
    JOIN student_duty_schedule_days d ON d.schedule_id=s.id
    CROSS JOIN LATERAL generate_series(GREATEST(s.effective_starts_on,(now() AT TIME ZONE t.timezone)::date - 90,
      COALESCE((SELECT min((q.created_at AT TIME ZONE t.timezone)::date) FROM office_qr_codes q WHERE q.office_id=s.office_id),
        (now() AT TIME ZONE t.timezone)::date + 1)),
      LEAST(COALESCE(s.effective_ends_on,(now() AT TIME ZONE t.timezone)::date), (now() AT TIME ZONE t.timezone)::date), interval '1 day') day
    WHERE ${where.join(' AND ')} AND extract(isodow FROM day)=d.weekday`,params);
  const recoveryParams=[];const recoveryWhere=[];
  if(institutionId){recoveryParams.push(institutionId);recoveryWhere.push(`r.institution_id=$${recoveryParams.length}`);}
  if(officeId){recoveryParams.push(officeId);recoveryWhere.push(`r.office_id=$${recoveryParams.length}`);}
  if(studentId){recoveryParams.push(studentId);recoveryWhere.push(`r.student_id=$${recoveryParams.length}`);}
  const {rows:recoveryShifts}=await db.query(`SELECT r.id,r.institution_id,r.student_id,r.office_id,r.shift_date::text,
      ((r.shift_date+r.starts_at) AT TIME ZONE t.timezone) starts_at,
      ((r.shift_date+r.ends_at) AT TIME ZONE t.timezone) ends_at,t.timezone,i.attendance_discrepancy_grace_minutes,
      (now() >= ((r.shift_date+r.ends_at) AT TIME ZONE t.timezone)+(i.attendance_discrepancy_grace_minutes*interval '1 minute')) AS ended
    FROM duty_recovery_shifts r JOIN duty_recovery_plans p ON p.id=r.plan_id
    JOIN academic_terms t ON t.id=p.term_id JOIN institutions i ON i.id=r.institution_id
    WHERE r.status='approved' AND r.shift_date BETWEEN (now() AT TIME ZONE t.timezone)::date-90 AND (now() AT TIME ZONE t.timezone)::date
      ${recoveryWhere.length?`AND ${recoveryWhere.join(' AND ')}`:''}`,recoveryParams);
  const recoveryByDay=new Map();
  for(const r of recoveryShifts){const key=`${r.student_id}:${r.shift_date}`;if(!recoveryByDay.has(key))recoveryByDay.set(key,[]);recoveryByDay.get(key).push(r);}
  const eventCache=new Map();
  const absenceCache=new Map();
  const hasReviewedAbsence=async(student,office,date)=>{
    const cacheKey=`${student}:${office}:${date}`;
    if(!absenceCache.has(cacheKey)) absenceCache.set(cacheKey,db.query(`SELECT 1 FROM absence_notices
      WHERE user_id=$1 AND office_id=$2 AND status IN('acknowledged','reviewed')
        AND start_date<=$3::date AND end_date>=$3::date LIMIT 1`,[student,office,date]).then(r=>r.rowCount>0));
    return absenceCache.get(cacheKey);
  };
  const now=(await db.query('SELECT now() AS now')).rows[0].now;
  let found=0;
  for(const shift of shifts){
    const cacheKey=`${shift.student_id}:${shift.shift_date}:${shift.timezone}`;
    if(!eventCache.has(cacheKey)) eventCache.set(cacheKey,effectiveEvents([shift.student_id],{startDate:shift.shift_date,nextDate:shift.shift_date,timezone:shift.timezone,db}));
    const effective=await eventCache.get(cacheKey);
    const dayEvents=(effective.get(shift.student_id)??[]).filter(e=>localDateKey(e.recordedAt,shift.timezone)===shift.shift_date);
    const recoveryWindows=recoveryByDay.get(`${shift.student_id}:${shift.shift_date}`)??[];
    const allowedWindows=[
      {startsAt:shift.morning_starts_at,endsAt:shift.morning_ends_at,officeId:shift.office_id},
      ...(shift.afternoon_starts_at&&shift.afternoon_ends_at?[{startsAt:shift.afternoon_starts_at,endsAt:shift.afternoon_ends_at,officeId:shift.office_id}]:[]),
      ...recoveryWindows.map(w=>({startsAt:w.starts_at,endsAt:w.ends_at,officeId:w.office_id})),
    ];
    for(const [period,startLocal,endLocal] of [['morning',shift.start_local,shift.end_local],['afternoon',shift.afternoon_start_local,shift.afternoon_end_local]]){
      if(!startLocal||!endLocal) continue;
      if(!shift[`${period}_ended`]) continue;
      const starts=shift[`${period}_starts_at`],ends=shift[`${period}_ends_at`];
      const relevant=dayEvents.filter(e=>e.officeId===shift.office_id&&e.recordedAt>=starts&&e.recordedAt<=ends);
      const coveredByAbsence=await hasReviewedAbsence(shift.student_id,shift.office_id,shift.shift_date);
      const key=`${shift.schedule_id}:${shift.shift_date}:${period}`;
      if(!relevant.length&&!coveredByAbsence){
        await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:shift.office_id,
          scheduleId:shift.schedule_id,date:shift.shift_date,type:'scheduled_no_attendance',key:`no-show:${key}`,
          details:{scheduledStart:starts,scheduledEnd:ends,timezone:shift.timezone},reason:'Approved duty shift ended after the institution grace period without a matching attendance event.'});found++;
      }
      if(relevant.length||coveredByAbsence){
        const note=coveredByAbsence?'A reviewed or acknowledged absence notice covers this shift. No missed-shift action is required.':'Attendance was recorded for this approved shift.';
        const {rows:stale}=await db.query(`WITH candidates AS (SELECT id,status AS old_status FROM attendance_discrepancies
          WHERE institution_id=$1 AND dedupe_key=$2 AND discrepancy_type='scheduled_no_attendance' AND status IN('open','explanation_submitted','under_review') FOR UPDATE)
          UPDATE attendance_discrepancies d SET status='cancelled',supervisor_decision='source_attendance_found',
          supervisor_remarks=$3,reviewed_at=now(),resolved_at=now(),updated_at=now()
          FROM candidates c WHERE d.id=c.id RETURNING d.id,c.old_status`,[shift.institution_id,`no-show:${key}`,note]);
        for(const d of stale){
          await addHistory(db,d.id,null,coveredByAbsence?'absence_notice_found':'source_attendance_found',d.old_status,'cancelled',note);
          await createNotification(db,{recipientId:shift.student_id,institutionId:shift.institution_id,type:'attendance_discrepancy_cancelled',
            title:'Attendance discrepancy cancelled',message:note,
            relatedType:'attendance_discrepancy',relatedId:d.id,dedupeKey:`attendance-discrepancy:${d.id}:cancelled`});
        }
      }
      let unclosed=null;const missing=[],orphanOuts=[];
      for(const event of relevant){
        if(event.eventType==='time_in'){if(unclosed)missing.push(unclosed);unclosed=event;}
        else if(unclosed)unclosed=null;else orphanOuts.push(event);
      }
      if(unclosed)missing.push(unclosed);
      for(const open of missing){
        await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:open.officeId??shift.office_id,
          scheduleId:shift.schedule_id,date:shift.shift_date,type:'missing_clock_out',key:`missing-out:${open.id}`,
          eventId:String(open.id).replace(/^adjustment:[^:]+/,''),details:{attendanceEventId:String(open.id).replace(/^adjustment:[^:]+:/,''),clockIn:open.recordedAt,scheduledStart:starts,scheduledEnd:ends,timezone:shift.timezone},
          reason:'A clock-in has no matching clock-out after the approved shift and grace period.'});found++;
      }
      for(const orphan of orphanOuts){
        await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:orphan.officeId??shift.office_id,
          scheduleId:shift.schedule_id,date:shift.shift_date,type:'duplicate_or_overlap',key:`orphan-out:${orphan.id}`,
          eventId:String(orphan.id).replace(/^adjustment:[^:]+:/,''),details:{attendanceEventId:orphan.id,eventIds:[String(orphan.id).replace(/^adjustment:[^:]+:/,'')],
            eventType:orphan.eventType,recordedAt:orphan.recordedAt,scheduledStart:starts,scheduledEnd:ends,timezone:shift.timezone},
          reason:'A clock-out was recorded without a preceding clock-in for this office and shift.'});found++;
      }
      for(const e of dayEvents){
        if(e.adjusted) continue;
        const inRange=isWithinShiftTolerance(e.recordedAt,allowedWindows,{earlyMinutes:shift.attendance_early_tolerance_minutes,
          lateMinutes:shift.attendance_late_tolerance_minutes,officeId:e.officeId});
        if(!inRange){
          const sameOfficeEvents=dayEvents.filter(x=>x.officeId===e.officeId);
          const matching=e.eventType==='time_in'?sameOfficeEvents.find(x=>x.eventType==='time_out'&&x.recordedAt>e.recordedAt):[...sameOfficeEvents].reverse().find(x=>x.eventType==='time_in'&&x.recordedAt<e.recordedAt);
          const ids=[e,matching].filter(Boolean).map(x=>String(x.id).replace(/^adjustment:[^:]+:/,''));
          await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:e.officeId??shift.office_id,
            scheduleId:shift.schedule_id,date:shift.shift_date,type:'outside_assigned_shift',key:`outside:${e.id}`,
            eventId:String(e.id).replace(/^adjustment:[^:]+:/,''),details:{attendanceEventId:e.id,eventIds:ids,eventType:e.eventType,recordedAt:e.recordedAt,
              clockIn:e.eventType==='time_in'?e.recordedAt:matching?.recordedAt,
              scheduledStart:starts,scheduledEnd:ends,earlyToleranceMinutes:shift.attendance_early_tolerance_minutes,
              lateToleranceMinutes:shift.attendance_late_tolerance_minutes},
            reason:`${e.eventType==='time_in'?'Clock-in':'Clock-out'} was outside the approved shift tolerance.`});found++;
        }
      }
    }
    // Pair sessions independently by office to find genuinely concurrent duty sessions.
    // Repeated rejected QR attempts never create attendance_events and are not flagged.
    const eventsByOffice=new Map();
    for(const e of dayEvents){if(!e.officeId)continue;if(!eventsByOffice.has(e.officeId))eventsByOffice.set(e.officeId,[]);eventsByOffice.get(e.officeId).push(e);}
    const officeSessions=[];
    for(const [office,events] of eventsByOffice){
      const sessions=buildSessions(events,{now,timeZone:shift.timezone,maxSessionSeconds:12*3600}).filter(s=>s.counted&&s.timeIn&&s.timeOut);
      officeSessions.push(...sessions.map(session=>({office,session,events})));
    }
    for(let i=0;i<officeSessions.length;i++)for(let j=i+1;j<officeSessions.length;j++){
      const a=officeSessions[i],b=officeSessions[j];if(a.office===b.office)continue;
      if(new Date(a.session.timeIn)<new Date(b.session.timeOut)&&new Date(b.session.timeIn)<new Date(a.session.timeOut)){
        const target=b.session;
        const replacements=b.events.filter(e=>e.recordedAt.toISOString()===target.timeIn||e.recordedAt.toISOString()===target.timeOut).map(e=>String(e.id).replace(/^adjustment:[^:]+:/,''));
        const conflictingOffice=await db.query('SELECT name,code FROM offices WHERE id=$1',[a.office]);
        await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:b.office,scheduleId:b.office===shift.office_id?shift.schedule_id:null,
          date:shift.shift_date,type:'duplicate_or_overlap',key:`overlap:${shift.student_id}:${target.id}:${a.session.id}`,
          eventId:String(target.id).replace(/^adjustment:[^:]+:/,''),details:{eventIds:replacements,clockIn:target.timeIn,clockOut:target.timeOut,conflictingOffice:conflictingOffice.rows[0]?.name??'another office',
            conflictingStart:a.session.timeIn,conflictingEnd:a.session.timeOut},
          reason:'Attendance sessions recorded at different offices overlap in time. This requires review and does not imply misconduct.'});found++;
      }
    }
  }
  for(const shift of recoveryShifts.filter(r=>r.ended)){
    const cacheKey=`${shift.student_id}:${shift.shift_date}:${shift.timezone}`;
    if(!eventCache.has(cacheKey)) eventCache.set(cacheKey,effectiveEvents([shift.student_id],{startDate:shift.shift_date,nextDate:shift.shift_date,timezone:shift.timezone,db}));
    const effective=await eventCache.get(cacheKey);
    const events=(effective.get(shift.student_id)??[]).filter(e=>e.officeId===shift.office_id&&e.recordedAt>=shift.starts_at&&e.recordedAt<=shift.ends_at);
    const coveredByAbsence=await hasReviewedAbsence(shift.student_id,shift.office_id,shift.shift_date);
    const dedupe=`recovery-no-show:${shift.id}`;
    if(!events.length&&!coveredByAbsence) await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:shift.office_id,
      scheduleId:null,date:shift.shift_date,type:'scheduled_no_attendance',key:dedupe,
      details:{recoveryShiftId:shift.id,scheduledStart:shift.starts_at,scheduledEnd:shift.ends_at,timezone:shift.timezone},
      reason:'Approved recovery shift ended after the institution grace period without matching attendance.'});
    else if(events.length||coveredByAbsence) {
      const note=coveredByAbsence?'A reviewed or acknowledged absence notice covers this recovery shift. No missed-shift action is required.':'Attendance was recorded for the approved recovery shift.';
      const {rows:stale}=await db.query(`WITH candidates AS (SELECT id,status AS old_status FROM attendance_discrepancies
        WHERE institution_id=$1 AND dedupe_key=$2 AND status IN('open','explanation_submitted','under_review') FOR UPDATE)
        UPDATE attendance_discrepancies d SET status='cancelled',supervisor_decision='source_attendance_found',
          supervisor_remarks=$3,reviewed_at=now(),resolved_at=now(),updated_at=now()
        FROM candidates c WHERE d.id=c.id RETURNING d.id,c.old_status`,[shift.institution_id,dedupe,note]);
      for(const d of stale){
        await addHistory(db,d.id,null,coveredByAbsence?'absence_notice_found':'source_attendance_found',d.old_status,'cancelled',note);
        await createNotification(db,{recipientId:shift.student_id,institutionId:shift.institution_id,type:'attendance_discrepancy_cancelled',
          title:'Attendance discrepancy cancelled',message:note,relatedType:'attendance_discrepancy',
          relatedId:d.id,dedupeKey:`attendance-discrepancy:${d.id}:cancelled`});
      }
    }
    if(coveredByAbsence&&!events.length) continue;
    const inEvents=events.filter(e=>e.eventType==='time_in');const outEvents=events.filter(e=>e.eventType==='time_out');
    for(const clockIn of inEvents) if(!outEvents.some(clockOut=>clockOut.recordedAt>clockIn.recordedAt)){
      await upsertDetection(db,{institutionId:shift.institution_id,studentId:shift.student_id,officeId:shift.office_id,scheduleId:null,
        date:shift.shift_date,type:'missing_clock_out',key:`recovery-missing-out:${shift.id}:${clockIn.id}`,
        eventId:String(clockIn.id).replace(/^adjustment:[^:]+:/,''),details:{recoveryShiftId:shift.id,attendanceEventId:String(clockIn.id).replace(/^adjustment:[^:]+:/,''),clockIn:clockIn.recordedAt,
          scheduledStart:shift.starts_at,scheduledEnd:shift.ends_at,timezone:shift.timezone},
        reason:'An approved recovery shift has a clock-in without a corresponding clock-out.'});found++;
    }
  }
  return {checked:shifts.length,createdOrMatched:found};
}

