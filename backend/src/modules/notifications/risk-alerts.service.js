import { query, withTransaction, withAdvisoryLock } from '../../db/pool.js';
import { getInstitutionForecasts } from '../forecast/forecast.service.js';
import { sendRiskAlertEmail, emailConfigured } from '../auth/email.service.js';

const severityRank = { informational: 1, warning: 2, critical: 3 };

export async function createRiskAlert(db, alert) {
  const {
    recipientId, institutionId, type, title, message, relatedType = null, relatedId = null,
    severity = 'informational', actionUrl = null, riskKey,
  } = alert;
  if (!riskKey) throw new Error('Risk alerts require a stable riskKey.');
  const { rows: [policy] } = await db.query(
    `INSERT INTO institution_alert_policies(institution_id) VALUES($1)
     ON CONFLICT(institution_id) DO UPDATE SET institution_id=EXCLUDED.institution_id
     RETURNING enabled_categories,email_enabled,email_minimum_severity,notification_cooldown_hours`, [institutionId]);
  const category = type.startsWith('completion') ? 'completion_risk'
    : type.startsWith('upcoming') ? 'upcoming_shift'
      : type.startsWith('missed') ? 'missed_shift'
        : type.startsWith('attendance') ? 'attendance'
          : type.startsWith('semester_requirement') ? 'semester_requirement'
            : type.split('_')[0];
  if (policy.enabled_categories && !policy.enabled_categories.includes(category) && !policy.enabled_categories.includes(type)) return null;
  const {rows:[previous]}=await db.query(`SELECT created_at,resolved_at,dismissed_at FROM notifications
    WHERE recipient_id=$1 AND dedupe_key=$2`,[recipientId,riskKey]);
  if(previous&&(previous.resolved_at||previous.dismissed_at)){
    const closedAt=previous.resolved_at??previous.dismissed_at??previous.created_at;
    const elapsed=await db.query('SELECT now()-$1::timestamptz >= ($2::text||\' hours\')::interval AS elapsed',[closedAt,policy.notification_cooldown_hours]);
    if(!elapsed.rows[0].elapsed)return null;
  }
  const { rows: [notification] } = await db.query(
    `INSERT INTO notifications(recipient_id,institution_id,type,title,message,related_type,related_id,important,dedupe_key,severity,action_url,risk_key)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$9)
     ON CONFLICT(recipient_id,dedupe_key) DO UPDATE SET
       type=EXCLUDED.type,title=EXCLUDED.title,message=EXCLUDED.message,related_type=EXCLUDED.related_type,
       related_id=EXCLUDED.related_id,important=EXCLUDED.important,severity=EXCLUDED.severity,
       action_url=EXCLUDED.action_url,risk_key=EXCLUDED.risk_key,
       read_at=CASE WHEN notifications.title IS DISTINCT FROM EXCLUDED.title OR notifications.message IS DISTINCT FROM EXCLUDED.message
         OR notifications.severity IS DISTINCT FROM EXCLUDED.severity OR notifications.resolved_at IS NOT NULL
         OR notifications.dismissed_at IS NOT NULL THEN NULL ELSE notifications.read_at END,
       resolved_at=NULL,dismissed_at=NULL,updated_at=now()
     WHERE notifications.title IS DISTINCT FROM EXCLUDED.title OR notifications.message IS DISTINCT FROM EXCLUDED.message
       OR notifications.severity IS DISTINCT FROM EXCLUDED.severity OR notifications.action_url IS DISTINCT FROM EXCLUDED.action_url
       OR notifications.resolved_at IS NOT NULL OR notifications.dismissed_at IS NOT NULL
     RETURNING id,created_at`,
    [recipientId,institutionId,type,title,message,relatedType,relatedId,severity !== 'informational',riskKey,severity,actionUrl]);
  if (!notification) return null;
  await db.query(`INSERT INTO notification_deliveries(notification_id,channel,status)
    VALUES($1,'in_app','sent') ON CONFLICT(notification_id,channel) DO UPDATE SET status='sent',updated_at=now()`, [notification.id]);
  const preference = await db.query('SELECT email_reminders FROM notification_preferences WHERE user_id=$1 AND institution_id=$2',[recipientId,institutionId]);
  const wantsEmail = preference.rows[0]?.email_reminders === true;
  if (policy.email_enabled && wantsEmail && severityRank[severity] >= severityRank[policy.email_minimum_severity]) {
    await db.query(`INSERT INTO notification_deliveries(notification_id,channel,status)
      VALUES($1,'email',$2) ON CONFLICT(notification_id,channel) DO UPDATE SET
        status=CASE WHEN notification_deliveries.status IN ('sent','processing') THEN notification_deliveries.status ELSE 'pending' END,
        next_attempt_at=now(),updated_at=now()`, [notification.id,emailConfigured()?'pending':'skipped']);
  }
  return notification.id;
}

export async function resolveRiskAlert(db, { recipientId, institutionId, riskKey }) {
  const { rowCount } = await db.query(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,now()),updated_at=now()
    WHERE recipient_id=$1 AND institution_id=$2 AND risk_key=$3 AND resolved_at IS NULL`, [recipientId,institutionId,riskKey]);
  return rowCount;
}

export async function getNotificationPreferences(user) {
  const { rows: [prefs] } = await query(`INSERT INTO notification_preferences(user_id,institution_id)
    VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET institution_id=EXCLUDED.institution_id
    RETURNING email_reminders,upcoming_shift_reminders`, [user.id,user.institutionId]);
  return { emailReminders:prefs.email_reminders,upcomingShiftReminders:prefs.upcoming_shift_reminders,emailAvailable:emailConfigured() };
}

export async function updateNotificationPreferences(user, data) {
  const { rows: [prefs] } = await query(`INSERT INTO notification_preferences(user_id,institution_id,email_reminders,upcoming_shift_reminders)
    VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET institution_id=EXCLUDED.institution_id,
      email_reminders=EXCLUDED.email_reminders,upcoming_shift_reminders=EXCLUDED.upcoming_shift_reminders,updated_at=now()
    RETURNING email_reminders,upcoming_shift_reminders`, [user.id,user.institutionId,data.emailReminders,data.upcomingShiftReminders]);
  return { emailReminders:prefs.email_reminders,upcomingShiftReminders:prefs.upcoming_shift_reminders,emailAvailable:emailConfigured() };
}

export async function getAlertPolicy(user) {
  const { rows: [policy] } = await query(`INSERT INTO institution_alert_policies(institution_id) VALUES($1)
    ON CONFLICT(institution_id) DO UPDATE SET institution_id=EXCLUDED.institution_id
    RETURNING *`, [user.institutionId]);
  return {...toPolicy(policy),emailAvailable:emailConfigured()};
}

export async function updateAlertPolicy(user, data) {
  const { rows: [policy] } = await query(`INSERT INTO institution_alert_policies(
    institution_id,completion_risk_warning_days,critical_completion_risk_days,deadline_reminder_days,upcoming_shift_reminder_hours,
    notification_cooldown_hours,enabled_categories,email_enabled,email_minimum_severity,escalation_after_hours,updated_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(institution_id) DO UPDATE SET completion_risk_warning_days=EXCLUDED.completion_risk_warning_days,
      critical_completion_risk_days=EXCLUDED.critical_completion_risk_days,deadline_reminder_days=EXCLUDED.deadline_reminder_days,upcoming_shift_reminder_hours=EXCLUDED.upcoming_shift_reminder_hours,
      notification_cooldown_hours=EXCLUDED.notification_cooldown_hours,enabled_categories=EXCLUDED.enabled_categories,
      email_enabled=EXCLUDED.email_enabled,email_minimum_severity=EXCLUDED.email_minimum_severity,
      escalation_after_hours=EXCLUDED.escalation_after_hours,updated_by=EXCLUDED.updated_by,updated_at=now()
    RETURNING *`, [user.institutionId,data.completionRiskWarningDays,data.criticalCompletionRiskDays,data.deadlineReminderDays,data.upcomingShiftReminderHours,
      data.notificationCooldownHours,data.enabledCategories,data.emailEnabled,data.emailMinimumSeverity,data.escalationAfterHours,user.id]);
  return {...toPolicy(policy),emailAvailable:emailConfigured()};
}

function toPolicy(p) { return { completionRiskWarningDays:p.completion_risk_warning_days,criticalCompletionRiskDays:p.critical_completion_risk_days,deadlineReminderDays:p.deadline_reminder_days,
  upcomingShiftReminderHours:p.upcoming_shift_reminder_hours,notificationCooldownHours:p.notification_cooldown_hours,
  enabledCategories:p.enabled_categories,emailEnabled:p.email_enabled,emailMinimumSeverity:p.email_minimum_severity,
  escalationAfterHours:p.escalation_after_hours }; }

export async function alertSummary(user) {
  const alertArgs=[user.institutionId,user.id];
  const { rows:[own] }=await query(`SELECT count(*) FILTER(WHERE resolved_at IS NULL AND dismissed_at IS NULL)::int AS active,
      count(*) FILTER(WHERE severity='critical' AND resolved_at IS NULL AND dismissed_at IS NULL)::int AS critical,
      count(*) FILTER(WHERE read_at IS NULL)::int AS unread,
      count(*) FILTER(WHERE type LIKE 'completion_risk%' AND resolved_at IS NULL AND dismissed_at IS NULL)::int AS completion_risks
    FROM notifications WHERE institution_id=$1 AND recipient_id=$2`,alertArgs);
  let alertScope='n.institution_id=$1',alertArgsScoped=[user.institutionId];
  if(user.role==='student'){alertScope+=' AND n.recipient_id=$2';alertArgsScoped.push(user.id);}
  else if(user.role==='supervisor'){
    alertScope+=' AND (n.recipient_id=$2 OR da.office_id=$3)';alertArgsScoped.push(user.id,user.office?.id??null);
  }
  const {rows:[scopedAlerts]}=await query(`SELECT count(DISTINCT n.id) FILTER(WHERE n.resolved_at IS NULL AND n.dismissed_at IS NULL)::int AS active,
      count(DISTINCT n.id) FILTER(WHERE n.severity='critical' AND n.resolved_at IS NULL AND n.dismissed_at IS NULL)::int AS critical,
      count(DISTINCT n.id) FILTER(WHERE n.type LIKE 'completion_risk%' AND n.resolved_at IS NULL AND n.dismissed_at IS NULL)::int AS completion_risks
    FROM notifications n LEFT JOIN duty_assignments da ON da.user_id=n.recipient_id AND da.ends_on IS NULL
    WHERE ${alertScope}`,alertArgsScoped);
  let recordScope='institution_id=$1',recordArgs=[user.institutionId];
  if(user.role==='student'){recordScope+=' AND student_id=$2';recordArgs.push(user.id);}
  else if(user.role==='supervisor'){recordScope+=' AND office_id=$2';recordArgs.push(user.office?.id??null);}
  const [discrepancies,missedShifts,recovery,transitions]=await Promise.all([
    query(`SELECT count(*)::int AS count FROM attendance_discrepancies WHERE ${recordScope} AND status IN('open','explanation_submitted','under_review')`,recordArgs),
    query(`SELECT count(*)::int AS count FROM attendance_discrepancies WHERE ${recordScope} AND discrepancy_type='scheduled_no_attendance' AND status IN('open','explanation_submitted','under_review')`,recordArgs),
    query(`SELECT count(*)::int AS count FROM duty_recovery_plans WHERE ${recordScope} AND status='pending_review'`,recordArgs),
    user.role==='admin'?query(`SELECT count(DISTINCT t.id)::int AS count FROM semester_transitions t
      JOIN semester_transition_students s ON s.transition_id=t.id WHERE t.institution_id=$1 AND t.status='previewed'
      AND s.student_status='review_required'`,[user.institutionId]):Promise.resolve({rows:[{count:0}]}),
  ]);
  const officeTrends=user.role==='admin'?(await query(`SELECT o.id,o.name,
      count(DISTINCT n.id) FILTER(WHERE n.created_at>=now()-interval '30 days')::int AS last30Days,
      count(DISTINCT n.id) FILTER(WHERE n.created_at>=now()-interval '60 days' AND n.created_at<now()-interval '30 days')::int AS prior30Days,
      count(DISTINCT n.id) FILTER(WHERE n.severity='critical' AND n.resolved_at IS NULL AND n.dismissed_at IS NULL)::int AS criticalActive
    FROM offices o LEFT JOIN duty_assignments da ON da.office_id=o.id AND da.ends_on IS NULL
    LEFT JOIN notifications n ON n.institution_id=o.institution_id AND n.created_at>=now()-interval '60 days'
      AND (n.recipient_id=da.user_id OR (n.related_type='student' AND n.related_id=da.user_id))
    WHERE o.institution_id=$1 GROUP BY o.id,o.name ORDER BY o.name`,[user.institutionId])).rows.map(r=>({officeId:r.id,officeName:r.name,
      last30Days:r.last30days,prior30Days:r.prior30days,criticalActive:r.criticalactive})):[];
  return {...scopedAlerts,unread:own.unread,discrepancies:discrepancies.rows[0].count,missedShifts:missedShifts.rows[0].count,
    recovery:recovery.rows[0].count,transitions:transitions.rows[0].count,officeTrends};
}

export async function runRiskDetectionSweep() {
  return withAdvisoryLock('dutytrace-risk-alert-sweep', runRiskDetectionSweepUnlocked);
}

async function runRiskDetectionSweepUnlocked() {
  const { rows: institutions }=await query('SELECT id FROM institutions ORDER BY id');
  const result={institutions:institutions.length,forecastsChecked:0,alertsCreated:0,upcomingShifts:0,emailsSent:0,emailFailures:0};
  for(const {id:institutionId} of institutions){
    const {rows:[policy]}=await query(`INSERT INTO institution_alert_policies(institution_id) VALUES($1)
      ON CONFLICT(institution_id) DO UPDATE SET institution_id=EXCLUDED.institution_id RETURNING *`,[institutionId]);
    const actor={id:null,role:'admin',institutionId};
    let offset=0,page;
    do {
    const forecast=await getInstitutionForecasts({actor,limit:200,offset});
    page=forecast.items;
    for(const item of page){
      result.forecastsChecked++;
      const studentId=item.student.id, officeId=item.student.officeId;
      if(!officeId || !forecast.term) continue;
      const daysLeft=Number(item.daysUntilDeadline ?? 0);
      const key=`completion-risk:${forecast.term.id}:${studentId}`;
      if(item.status==='at_risk' && daysLeft<=Number(policy.completion_risk_warning_days)){
        const severity=daysLeft<=Number(policy.critical_completion_risk_days)?'critical':'warning';
        const remaining=Number(item.remainingHours??0).toFixed(2);
        const pace=Number(item.requiredWeeklyPace??0).toFixed(2);
        const actualPace=Number(item.actualWeeklyPace??0).toFixed(2);
        const message=`You have ${remaining} duty hours remaining and ${Math.max(0,daysLeft)} days before the deadline. Your current pace is ${actualPace} hours per week; about ${pace} hours per week are required to finish on time.`;
        await withTransaction(async db=>{
          await createRiskAlert(db,{recipientId:studentId,institutionId,type:'completion_risk',title:'Duty-hour completion at risk',message,
          relatedType:'academic_term',relatedId:forecast.term.id,severity,actionUrl:'/student',riskKey:key});
          const supervisors=await db.query(`SELECT DISTINCT u.id FROM users u JOIN duty_assignments da ON da.user_id=u.id AND da.ends_on IS NULL
            WHERE u.institution_id=$1 AND u.role='supervisor' AND u.status='active' AND da.office_id=$2`,[institutionId,officeId]);
          for(const supervisor of supervisors.rows) await createRiskAlert(db,{recipientId:supervisor.id,institutionId,type:'completion_risk_supervisor',
            title:'Student Assistant may miss duty-hour deadline',message:`${item.student.fullName} has ${remaining} verified hours remaining; estimated required pace is ${pace} hours per week.`,
            relatedType:'student',relatedId:studentId,severity,actionUrl:`/supervisor/assistants/${studentId}`,riskKey:`${key}:supervisor:${supervisor.id}`});
          const admins=await db.query(`SELECT id FROM users WHERE institution_id=$1 AND role='admin' AND status='active'`,[institutionId]);
          for(const admin of admins.rows) await createRiskAlert(db,{recipientId:admin.id,institutionId,type:'completion_risk_admin',
            title:'Student duty-hour completion at risk',message:`${item.student.fullName} has ${remaining} verified hours remaining; deadline ${item.deadline}.`,
            relatedType:'student',relatedId:studentId,severity,actionUrl:'/admin/duty-requirements',riskKey:`${key}:admin:${admin.id}`});
        });
        result.alertsCreated++;
      } else if(item.status!=='at_risk' || daysLeft>Number(policy.completion_risk_warning_days)) {
        await withTransaction(async db=>{
          await resolveRiskAlert(db,{recipientId:studentId,institutionId,riskKey:key});
          await db.query(`UPDATE notifications SET resolved_at=COALESCE(resolved_at,now()),updated_at=now()
            WHERE institution_id=$1 AND risk_key LIKE $2 AND resolved_at IS NULL`,[institutionId,`${key}:%`]);
        });
      }
    }
    offset+=200;
    } while(page.length===200);
    result.upcomingShifts+=await notifyUpcomingApprovedShifts(institutionId,policy);
  }
  result.escalations=await escalateUnresolvedCriticalAlerts();
  const delivery=await deliverPendingEmailAlerts();
  result.emailsSent=delivery.sent;result.emailFailures=delivery.failed;
  return result;
}

async function escalateUnresolvedCriticalAlerts(){
  const {rows}=await query(`SELECT n.id,n.institution_id,n.type,n.title,n.related_type,n.related_id,n.risk_key,
      s.id AS student_id,s.full_name,da.office_id,p.escalation_after_hours
    FROM notifications n JOIN users s ON s.id=n.recipient_id AND s.role='student' AND s.status='active'
    JOIN duty_assignments da ON da.user_id=s.id AND da.ends_on IS NULL
    JOIN institution_alert_policies p ON p.institution_id=n.institution_id
    WHERE n.severity='critical' AND n.resolved_at IS NULL AND n.dismissed_at IS NULL
      AND n.created_at<=now()-(p.escalation_after_hours::text||' hours')::interval
    ORDER BY n.created_at LIMIT 500`);
  let escalated=0;
  for(const alert of rows){
    const supervisors=await query(`SELECT DISTINCT u.id FROM users u JOIN duty_assignments da ON da.user_id=u.id AND da.ends_on IS NULL
      WHERE u.institution_id=$1 AND u.role='supervisor' AND u.status='active' AND da.office_id=$2`,[alert.institution_id,alert.office_id]);
    const admins=await query(`SELECT id FROM users WHERE institution_id=$1 AND role='admin' AND status='active'`,[alert.institution_id]);
    const targets=[...supervisors.rows.map(r=>({id:r.id,role:'supervisor'})),...admins.rows.map(r=>({id:r.id,role:'admin'}))];
    const alertType=alert.type.startsWith('completion')?'completion_risk_escalated':alert.type.startsWith('attendance')?'attendance_escalated':
      alert.type.startsWith('recovery')?'recovery_escalated':alert.type.startsWith('dtr')?'dtr_escalated':
      alert.type.startsWith('semester')?'semester_requirement_escalated':'missed_shift_escalated';
    for(const target of targets){
      await withTransaction(db=>createRiskAlert(db,{recipientId:target.id,institutionId:alert.institution_id,type:alertType,
        title:'Unresolved critical Student Assistant alert',message:`${alert.full_name} still has an unresolved critical alert: ${alert.title}.`,
        relatedType:'student',relatedId:alert.student_id,severity:'critical',actionUrl:target.role==='supervisor'?`/supervisor/assistants/${alert.student_id}`:'/admin/users',
        riskKey:`risk-escalation:${alert.id}:${target.id}`}));
      escalated++;
    }
  }
  return escalated;
}

async function notifyUpcomingApprovedShifts(institutionId,policy){
  const {rows:shifts}=await query(`WITH upcoming AS (
      SELECT s.id AS schedule_id,s.student_id,s.institution_id,s.term_id,s.office_id,t.timezone,
        ((now() AT TIME ZONE t.timezone)::date + ((d.weekday - extract(isodow FROM now() AT TIME ZONE t.timezone)::int + 7) % 7)) AS shift_date,
        d.starts_at::text,d.ends_at::text,u.full_name,
        (((now() AT TIME ZONE t.timezone)::date + ((d.weekday - extract(isodow FROM now() AT TIME ZONE t.timezone)::int + 7) % 7)) + d.starts_at) AT TIME ZONE t.timezone AS starts_at_utc
      FROM student_duty_schedules s JOIN student_duty_schedule_days d ON d.schedule_id=s.id
      JOIN academic_terms t ON t.id=s.term_id JOIN users u ON u.id=s.student_id
      WHERE s.institution_id=$1 AND s.status='approved' AND u.status='active'
        AND (now() AT TIME ZONE t.timezone)::date BETWEEN s.effective_starts_on AND s.effective_ends_on
    ) SELECT up.*,pref.upcoming_shift_reminders FROM upcoming up
      LEFT JOIN notification_preferences pref ON pref.user_id=up.student_id
      WHERE up.starts_at_utc>now() AND up.starts_at_utc<=now()+($2::text||' hours')::interval
      ORDER BY up.starts_at_utc LIMIT 1000`,[institutionId,policy.upcoming_shift_reminder_hours]);
  let created=0;
  for(const shift of shifts){
    if(shift.upcoming_shift_reminders===false) continue;
    const date=String(shift.shift_date).slice(0,10),key=`upcoming-duty:${shift.schedule_id}:${date}:${shift.starts_at}`;
    await withTransaction(db=>createRiskAlert(db,{recipientId:shift.student_id,institutionId,type:'upcoming_shift',title:'Upcoming approved duty assignment',
      message:`You have an approved duty assignment on ${date} from ${shift.starts_at.slice(0,5)} to ${shift.ends_at.slice(0,5)}.`,
      relatedType:'duty_schedule',relatedId:shift.schedule_id,severity:'informational',actionUrl:'/student/schedule',riskKey:key}));
    created++;
  }
  const {rows:recoveryShifts}=await query(`SELECT r.id,r.plan_id,r.student_id,r.shift_date::text,r.starts_at::text,r.ends_at::text,t.timezone,
      (((r.shift_date+r.starts_at) AT TIME ZONE t.timezone)) AS starts_at_utc,pref.upcoming_shift_reminders
    FROM duty_recovery_shifts r JOIN duty_recovery_plans p ON p.id=r.plan_id
    JOIN academic_terms t ON t.id=p.term_id JOIN users u ON u.id=r.student_id
    LEFT JOIN notification_preferences pref ON pref.user_id=r.student_id
    WHERE r.institution_id=$1 AND r.status='approved' AND u.status='active'
      AND r.shift_date >= (now() AT TIME ZONE t.timezone)::date
      AND (((r.shift_date+r.starts_at) AT TIME ZONE t.timezone)>now())
      AND (((r.shift_date+r.starts_at) AT TIME ZONE t.timezone)<=now()+($2::text||' hours')::interval)
    ORDER BY starts_at_utc LIMIT 500`,[institutionId,policy.upcoming_shift_reminder_hours]);
  for(const shift of recoveryShifts){
    if(shift.upcoming_shift_reminders===false)continue;
    const date=String(shift.shift_date).slice(0,10);
    await withTransaction(db=>createRiskAlert(db,{recipientId:shift.student_id,institutionId,type:'upcoming_shift_recovery',title:'Upcoming approved recovery shift',
      message:`You have an approved recovery shift on ${date} from ${shift.starts_at.slice(0,5)} to ${shift.ends_at.slice(0,5)}.`,
      relatedType:'duty_recovery_plan',relatedId:shift.plan_id,severity:'informational',actionUrl:'/student/schedule',riskKey:`upcoming-recovery:${shift.id}`}));
    created++;
  }
  return created;
}

async function deliverPendingEmailAlerts(limit=50){
  if(!emailConfigured()) return {sent:0,failed:0};
  await query(`UPDATE notification_deliveries SET status='failed',next_attempt_at=now(),updated_at=now(),
      last_error=COALESCE(last_error,'Previous worker exited before confirming delivery')
    WHERE channel='email' AND status='processing' AND last_attempt_at<now()-interval '10 minutes'`);
  let sent=0,failed=0;
  for(let i=0;i<limit;i++){
    const claimed=await withTransaction(async db=>{
      const {rows:[delivery]}=await db.query(`SELECT d.id,d.notification_id,n.title,n.message,n.action_url,u.email
        FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.recipient_id
        WHERE d.channel='email' AND d.status IN('pending','failed') AND d.attempt_count<8 AND d.next_attempt_at<=now()
        ORDER BY d.next_attempt_at,d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`);
      if(!delivery)return null;
      await db.query(`UPDATE notification_deliveries SET status='processing',attempt_count=attempt_count+1,last_attempt_at=now(),updated_at=now() WHERE id=$1`,[delivery.id]);
      return delivery;
    });
    if(!claimed)break;
    try{
      await sendRiskAlertEmail({to:claimed.email,title:claimed.title,message:claimed.message,actionUrl:claimed.action_url,notificationId:claimed.notification_id});
      await query(`UPDATE notification_deliveries SET status='sent',handed_off_at=now(),last_error=NULL,updated_at=now() WHERE id=$1`,[claimed.id]);sent++;
    }catch(error){
      await query(`UPDATE notification_deliveries SET status='failed',last_error=$2,next_attempt_at=now()+LEAST(3600,power(2,attempt_count)*60)*interval '1 second',updated_at=now() WHERE id=$1`,[claimed.id,String(error.message).slice(0,500)]);failed++;
    }
  }
  return {sent,failed};
}
