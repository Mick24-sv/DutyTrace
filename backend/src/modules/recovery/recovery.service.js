import { query, withTransaction } from '../../db/pool.js';
import { AppError } from '../../utils/response.js';
import { recordAudit } from '../audit/audit.service.js';
import { getStudentForecast } from '../forecast/forecast.service.js';
import { createNotification, notifyOfficeSupervisors } from '../notifications/notifications.service.js';

const notFound = () => new AppError(404, 'NOT_FOUND', 'Recovery plan not found.');
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const isoDay = (d) => { const x = new Date(`${d}T00:00:00Z`); return ((x.getUTCDay() + 6) % 7) + 1; };
const hours = (a, b) => Math.round(((mins(b) - mins(a)) / 60) * 100) / 100;

async function scheduleAndPolicy(studentId, termId, institutionId, officeId, db = { query }) {
  const { rows: [schedule] } = await db.query(
    `SELECT s.id, s.effective_starts_on::text, s.effective_ends_on::text
       FROM student_duty_schedules s WHERE s.student_id=$1 AND s.term_id=$2 AND s.status='approved'
       ORDER BY s.version DESC LIMIT 1`, [studentId, termId]);
  if (!schedule) return { schedule: null, days: [], policy: null };
  const { rows: days } = await db.query(
    `SELECT weekday, starts_at::text, ends_at::text, afternoon_starts_at::text, afternoon_ends_at::text
       FROM student_duty_schedule_days WHERE schedule_id=$1 ORDER BY weekday`, [schedule.id]);
  const { rows: [policy] } = await db.query(
    `SELECT required_term_hours, maximum_daily_hours, permitted_weekdays, permitted_time_windows,
            effective_starts_on::text, effective_ends_on::text
       FROM duty_requirement_policies
      WHERE term_id=$1 AND institution_id=$2 AND effective_starts_on <= (SELECT ends_on FROM academic_terms WHERE id=$1)
        AND effective_ends_on >= (SELECT starts_on FROM academic_terms WHERE id=$1)
        AND ((scope_type='student' AND scope_id=$3) OR (scope_type='office' AND scope_id=$4)
          OR (scope_type='institution' AND scope_id=$2))
      ORDER BY CASE scope_type WHEN 'student' THEN 1 WHEN 'office' THEN 2 ELSE 3 END LIMIT 1`,
    [termId, institutionId, studentId, officeId]);
  return { schedule, days, policy };
}

async function candidateSlots({ studentId, termId, institutionId, officeId, forecast, db = { query }, limit = 80, excludePlanId = null }) {
  const { schedule, days, policy } = await scheduleAndPolicy(studentId, termId, institutionId, officeId, db);
  const remaining = Number(forecast?.remainingHours ?? 0);
  if (!schedule || !policy || !forecast?.deadline || remaining <= 0) return { slots: [], reasons: ['An approved availability schedule, duty-hour policy, deadline, and outstanding requirement are required.'], remaining };
  const { rows: termRows } = await db.query(`SELECT timezone FROM academic_terms WHERE id=$1`, [termId]);
  const timezone = termRows[0]?.timezone;
  const { rows: [todayRow] } = await db.query(`SELECT (now() AT TIME ZONE $1)::date::text AS today`, [timezone]);
  const { rows: existing } = await db.query(
    `SELECT shift_date::text, starts_at::text, ends_at::text FROM duty_recovery_shifts
      WHERE student_id=$1 AND status IN ('pending_review','approved') AND shift_date >= $2::date AND shift_date <= $3::date
        AND ($4::uuid IS NULL OR plan_id <> $4)`,
    [studentId, todayRow.today, forecast.deadline, excludePlanId]);
  const availableDays = new Map(days.map((d) => [Number(d.weekday), d]));
  const slots = [];
  const dailyHours = new Map();
  let blockedByAssignment = false;
  const cur = new Date(`${todayRow.today}T00:00:00Z`); cur.setUTCDate(cur.getUTCDate() + 1);
  const end = new Date(`${forecast.deadline}T00:00:00Z`);
  let proposed = 0;
  while (cur <= end && slots.length < limit && proposed < remaining) {
    const date = cur.toISOString().slice(0, 10), weekday = isoDay(date), pref = availableDays.get(weekday);
    const allowedWeekdays = policy.permitted_weekdays.map(Number);
    const leave = await db.query(
      `SELECT 1 FROM absence_notices WHERE user_id=$1 AND status IN ('acknowledged','reviewed')
        AND start_date <= $2::date AND end_date >= $2::date LIMIT 1`, [studentId, date]);
    if (pref && allowedWeekdays.includes(weekday) && !leave.rows.length &&
        date >= schedule.effective_starts_on && date <= schedule.effective_ends_on &&
        date >= policy.effective_starts_on && date <= policy.effective_ends_on) {
      const periods = [[pref.starts_at, pref.ends_at], ...(pref.afternoon_starts_at ? [[pref.afternoon_starts_at, pref.afternoon_ends_at]] : [])];
      for (const [rawStart, rawEnd] of periods) {
        const start = rawStart.slice(0, 5), endTime = rawEnd.slice(0, 5);
        if (!policy.permitted_time_windows.some((w) => start >= w.startTime.slice(0, 5) && endTime <= w.endTime.slice(0, 5))) continue;
        const dailyRemaining = Math.max(0, Number(policy.maximum_daily_hours ?? 24) - (dailyHours.get(date) ?? 0));
        const duration = Math.min(hours(start, endTime), remaining - proposed, dailyRemaining);
        if (duration <= 0) continue;
        const finishMinutes = mins(start) + Math.round(duration * 60);
        const finish = `${String(Math.floor(finishMinutes / 60)).padStart(2, '0')}:${String(finishMinutes % 60).padStart(2, '0')}`;
        const overlap = existing.some((x) => x.shift_date === date && start < x.ends_at.slice(0, 5) && x.starts_at.slice(0, 5) < finish);
        if (overlap) continue;
        // Approved weekly preferences are treated as confirmed recurring assignments
        // throughout this system, so recovery shifts cannot overlap them for the SA.
        const { rows: studentConflicts } = await db.query(
          `SELECT 1 FROM student_duty_schedules s JOIN student_duty_schedule_days d ON d.schedule_id=s.id
            WHERE s.student_id=$1 AND s.status='approved' AND s.effective_starts_on <= $2::date AND s.effective_ends_on >= $2::date
              AND d.weekday=$3 AND ((d.starts_at < $5::time AND $4::time < d.ends_at)
                OR (d.afternoon_starts_at IS NOT NULL AND d.afternoon_starts_at < $5::time AND $4::time < d.afternoon_ends_at)) LIMIT 1`,
          [studentId, date, weekday, start, finish]);
        if (studentConflicts.length) { blockedByAssignment = true; continue; }
        // Check staffing against both recurring approved schedules and dated approved
        // recovery shifts. The office/term advisory lock serializes approval decisions.
        const { rows: [capacityRow] } = await db.query(`SELECT schedule_capacity FROM offices WHERE id=$1`, [officeId]);
        const { rows: [staffed] } = await db.query(
          `SELECT count(DISTINCT student_id)::int AS count FROM (
             SELECT s.student_id FROM student_duty_schedules s JOIN student_duty_schedule_days d ON d.schedule_id=s.id
              WHERE s.office_id=$1 AND s.status='approved' AND s.effective_starts_on <= $2::date AND s.effective_ends_on >= $2::date
                AND d.weekday=$3 AND ((d.starts_at < $5::time AND $4::time < d.ends_at)
                  OR (d.afternoon_starts_at IS NOT NULL AND d.afternoon_starts_at < $5::time AND $4::time < d.afternoon_ends_at))
             UNION SELECT rs.student_id FROM duty_recovery_shifts rs WHERE rs.office_id=$1 AND rs.shift_date=$2::date
               AND rs.status='approved' AND rs.starts_at < $5::time AND $4::time < rs.ends_at
           ) active_students`, [officeId,date,weekday,start,finish]);
        if (Number(staffed.count) >= Number(capacityRow?.schedule_capacity ?? 1)) continue;
        slots.push({ date, weekday, startsAt: start, endsAt: finish, durationHours: duration, officeId });
        dailyHours.set(date, (dailyHours.get(date) ?? 0) + duration);
        proposed += duration;
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { slots, remaining, proposedHours: Math.round(proposed * 100) / 100,
    shortfallHours: Math.max(0, Math.round((remaining - proposed) * 100) / 100),
    reasons: slots.length ? [] : [blockedByAssignment
      ? 'Your approved weekly schedule uses the available preferred periods. DutyTrace will not double-book those hours; submit additional recovery availability after your supervisor enables an available time window.'
      : 'No future dates match the approved availability, effective duty rules, deadline, staffing capacity, and recorded leave.'] };
}

export async function suggestions({ user, termId }) {
  const forecast = await getStudentForecast(user.id, { termId, actor: user });
  const term = forecast?.term;
  if (!term) return { forecast, slots: [], remainingHours: null, proposedHours: 0, shortfallHours: null, reasons: ['No academic term is available.'] };
  const { rows: [assignment] } = await query(`SELECT office_id FROM duty_assignments WHERE user_id=$1 AND ends_on IS NULL`, [user.id]);
  if (!assignment) throw new AppError(403, 'NOT_ASSIGNED', 'You must be assigned to an office to request recovery shifts.');
  const result = await candidateSlots({ studentId: user.id, termId: term.id, institutionId: user.institutionId, officeId: assignment.office_id, forecast });
  return { forecast, ...result };
}

export async function submit({ user, termId, slots, ip }) {
  return withTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recovery:${user.institutionId}:${termId}:${user.id}`]);
    const forecast = await getStudentForecast(user.id, { termId, actor: user, db });
    const { rows: [assignment] } = await db.query(`SELECT office_id FROM duty_assignments WHERE user_id=$1 AND ends_on IS NULL FOR UPDATE`, [user.id]);
    if (!assignment) throw new AppError(403, 'NOT_ASSIGNED', 'You must be assigned to an office to request recovery shifts.');
    const available = await candidateSlots({ studentId: user.id, termId, institutionId: user.institutionId, officeId: assignment.office_id, forecast, db });
    const valid = new Map(available.slots.map((slot) => [`${slot.date}|${slot.startsAt}|${slot.endsAt}`, slot]));
    if (!slots.length || slots.some((slot) => !valid.has(`${slot.date}|${slot.startsAt}|${slot.endsAt}`)))
      throw new AppError(409, 'RECOVERY_SLOTS_CHANGED', 'One or more selected shifts are no longer available. Refresh suggestions and try again.');
    const total = slots.reduce((n, slot) => n + valid.get(`${slot.date}|${slot.startsAt}|${slot.endsAt}`).durationHours, 0);
    if (total > Number(forecast.remainingHours ?? 0)) throw new AppError(400, 'EXCEEDS_REMAINING', 'Selected shifts exceed your remaining duty-hour requirement.');
    const { rows: [plan] } = await db.query(
      `INSERT INTO duty_recovery_plans (institution_id,term_id,student_id,office_id,created_by)
       VALUES ($1,$2,$3,$4,$3) RETURNING *`, [user.institutionId, termId, user.id, assignment.office_id]);
    for (const selected of slots) {
      const slot = valid.get(`${selected.date}|${selected.startsAt}|${selected.endsAt}`);
      await db.query(`INSERT INTO duty_recovery_shifts (plan_id,institution_id,student_id,office_id,shift_date,starts_at,ends_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [plan.id,user.institutionId,user.id,assignment.office_id,slot.date,slot.startsAt,slot.endsAt]);
    }
    await notifyOfficeSupervisors(db,{officeId:assignment.office_id,institutionId:user.institutionId,type:'recovery_plan_pending_review',
      title:'Recovery plan needs review',message:'A Student Assistant submitted a missed-hours recovery plan for review.',
      relatedType:'duty_recovery_plan',relatedId:plan.id,important:true,dedupeKey:`recovery-plan:${plan.id}:pending-review`});
    await recordAudit({ actorId:user.id, institutionId:user.institutionId, action:'recovery_plan.submitted', targetType:'duty_recovery_plan', targetId:plan.id,
      after:{ shiftCount:slots.length, proposedHours:total }, ip }, db);
    return planDetail(plan.id, db);
  });
}

async function planDetail(id, db = { query }) {
  const { rows: [plan] } = await db.query(`SELECT p.*, u.full_name AS student_name, o.name AS office_name
    FROM duty_recovery_plans p JOIN users u ON u.id=p.student_id JOIN offices o ON o.id=p.office_id WHERE p.id=$1`, [id]);
  if (!plan) return null;
  const { rows: shifts } = await db.query(`SELECT id, shift_date::text, starts_at::text, ends_at::text, status
    FROM duty_recovery_shifts WHERE plan_id=$1 ORDER BY shift_date, starts_at`, [id]);
  return { id:plan.id, studentId:plan.student_id, studentName:plan.student_name, officeId:plan.office_id, officeName:plan.office_name,
    status:plan.status, createdAt:plan.created_at, reviewedAt:plan.reviewed_at, reviewReason:plan.review_reason,
    shifts:shifts.map(s=>({id:s.id,date:s.shift_date,startsAt:s.starts_at.slice(0,5),endsAt:s.ends_at.slice(0,5),durationHours:hours(s.starts_at,s.ends_at),status:s.status})) };
}

export async function mine(user) {
  const { rows } = await query(`SELECT id FROM duty_recovery_plans WHERE student_id=$1 AND institution_id=$2 ORDER BY created_at DESC LIMIT 50`, [user.id,user.institutionId]);
  return Promise.all(rows.map((r)=>planDetail(r.id)));
}

export async function queue(actor) {
  const params = [actor.institutionId];
  const scope = actor.role === 'supervisor' ? ` AND p.office_id=$2` : '';
  if (scope) params.push(actor.office?.id ?? null);
  const { rows } = await query(`SELECT p.id FROM duty_recovery_plans p WHERE p.institution_id=$1${scope} ORDER BY (p.status='pending_review') DESC,p.created_at DESC LIMIT 100`, params);
  return Promise.all(rows.map((r)=>planDetail(r.id)));
}

export async function decide({ actor, id, decision, reason, ip }) {
  try { return await withTransaction(async (db) => {
    const { rows: [plan] } = await db.query(`SELECT * FROM duty_recovery_plans WHERE id=$1 FOR UPDATE`, [id]);
    if (!plan || plan.institution_id !== actor.institutionId || (actor.role==='supervisor' && plan.office_id !== actor.office?.id)) throw notFound();
    if (plan.status !== 'pending_review') throw new AppError(409,'INVALID_TRANSITION','This recovery request is no longer pending review.');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`recovery-office:${plan.institution_id}:${plan.office_id}:${plan.term_id}`]);
    if (decision === 'approve') {
      const { rows: shifts } = await db.query(`SELECT * FROM duty_recovery_shifts WHERE plan_id=$1 ORDER BY shift_date,starts_at FOR UPDATE`, [id]);
      const forecast = await getStudentForecast(plan.student_id,{termId:plan.term_id,actor:{...actor,role:'admin'},db});
      const available = await candidateSlots({studentId:plan.student_id,termId:plan.term_id,institutionId:plan.institution_id,officeId:plan.office_id,forecast,db,excludePlanId:id});
      const keys = new Set(available.slots.map(s=>`${s.date}|${s.startsAt}|${s.endsAt}`));
      if (shifts.some(s=>!keys.has(`${s.shift_date}|${s.starts_at.slice(0,5)}|${s.ends_at.slice(0,5)}`)))
        throw new AppError(409,'RECOVERY_CONFLICT','Availability or capacity changed. Review the request again after the student submits updated shifts.');
      await db.query(`UPDATE duty_recovery_shifts SET status='approved' WHERE plan_id=$1`,[id]);
    } else await db.query(`UPDATE duty_recovery_shifts SET status='rejected' WHERE plan_id=$1`,[id]);
    await db.query(`UPDATE duty_recovery_plans SET status=$2,reviewed_by=$3,reviewed_at=now(),review_reason=$4 WHERE id=$1`,[id,decision==='approve'?'approved':'rejected',actor.id,reason||null]);
    await db.query(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,now()),updated_at=now()
      WHERE related_type='duty_recovery_plan' AND related_id=$1 AND type IN('recovery_plan_pending_review','recovery_plan_conflict','recovery_plan_modification_required')`,[id]);
    await createNotification(db,{recipientId:plan.student_id,institutionId:plan.institution_id,type:`recovery_plan_${decision==='approve'?'approved':'rejected'}`,
      title:decision==='approve'?'Recovery plan approved':'Recovery plan rejected',
      message:reason|| (decision==='approve'?'Your recovery shifts are approved. Attendance is still required for the hours to count.':'Your recovery plan was not approved. Review supervisor feedback and submit an updated proposal if appropriate.'),
      relatedType:'duty_recovery_plan',relatedId:id,important:true,dedupeKey:`recovery-plan:${id}:${decision}`});
    await recordAudit({actorId:actor.id,institutionId:actor.institutionId,action:`recovery_plan.${decision==='approve'?'approved':'rejected'}`,targetType:'duty_recovery_plan',targetId:id,before:{status:plan.status},after:{status:decision==='approve'?'approved':'rejected',reason:reason||null},ip},db);
    return planDetail(id,db);
  }); } catch(error) {
    if(error.code==='RECOVERY_CONFLICT'){
      const {rows:[plan]}=await query('SELECT id,student_id,institution_id,office_id FROM duty_recovery_plans WHERE id=$1 AND institution_id=$2',[id,actor.institutionId]);
      if(plan) await withTransaction(async db=>{
        const message='Your proposed recovery periods no longer fit the approved schedule or office capacity. Withdraw this request and submit revised shifts for review.';
        await createNotification(db,{recipientId:plan.student_id,institutionId:plan.institution_id,type:'recovery_plan_modification_required',
          title:'Recovery shifts need modification',message,relatedType:'duty_recovery_plan',relatedId:id,important:true,severity:'warning',
          actionUrl:'/student/schedule',dedupeKey:`recovery-plan:${id}:modification-required`});
        await notifyOfficeSupervisors(db,{officeId:plan.office_id,institutionId:plan.institution_id,type:'recovery_plan_conflict',
          title:'Recovery plan needs updated availability',message:'An approved recovery proposal no longer fits the duty schedule or office capacity. The request remains unchanged.',
          relatedType:'duty_recovery_plan',relatedId:id,important:true,severity:'warning',actionUrl:'/supervisor/recovery-review',
          dedupeKey:`recovery-plan:${id}:conflict-review`});
      });
    }
    throw error;
  }
}

export async function withdraw({user,id,ip}) {
  return withTransaction(async(db)=>{
    const {rows:[plan]}=await db.query(`SELECT * FROM duty_recovery_plans WHERE id=$1 FOR UPDATE`,[id]);
    if(!plan||plan.student_id!==user.id||plan.institution_id!==user.institutionId) throw notFound();
    if(plan.status!=='pending_review') throw new AppError(409,'INVALID_TRANSITION','Only a pending request can be withdrawn.');
    await db.query(`UPDATE duty_recovery_plans SET status='withdrawn' WHERE id=$1`,[id]);
    await db.query(`UPDATE duty_recovery_shifts SET status='cancelled' WHERE plan_id=$1`,[id]);
    await db.query(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,now()),updated_at=now()
      WHERE related_type='duty_recovery_plan' AND related_id=$1 AND type IN('recovery_plan_pending_review','recovery_plan_conflict','recovery_plan_modification_required')`,[id]);
    await recordAudit({actorId:user.id,institutionId:user.institutionId,action:'recovery_plan.withdrawn',targetType:'duty_recovery_plan',targetId:id,before:{status:plan.status},after:{status:'withdrawn'},ip},db);
    return planDetail(id,db);
  });
}
