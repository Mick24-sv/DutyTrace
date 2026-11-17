import { query } from '../../db/pool.js';

// Reconcile the bell with current actionable records, including entries created
// before notifications were enabled. One scoped statement avoids per-item reads.
export async function syncStudentAttention(user, db = { query }) {
  if (user.role !== 'student') return;
  await db.query(`WITH candidates AS (
    SELECT 'student_duty_preference_'||s.status AS type,
      CASE s.status WHEN 'approved' THEN 'Duty preferences approved'
        WHEN 'rejected' THEN 'Duty preferences not approved' ELSE 'Duty preferences need changes' END AS title,
      CASE s.status WHEN 'approved' THEN 'Your supervisor approved your duty preferences. Review your confirmed duty times.'
        WHEN 'rejected' THEN 'Your supervisor did not approve these duty preferences. Review the feedback before submitting again.'
        ELSE 'Your supervisor requested changes to your duty preferences. Update them and submit again.' END
        ||CASE WHEN s.review_reason IS NOT NULL THEN ' Supervisor note: '||s.review_reason ELSE '' END AS message,
      'student_duty_schedule'::text AS related_type,s.id AS related_id,
      'student-preference:'||s.id::text||':'||s.status||':'||s.reviewed_at::text AS dedupe_key,
      '/student/attendance'::text AS action_url,
      CASE WHEN s.status='approved' THEN 'informational' ELSE 'warning' END AS severity
    FROM student_duty_schedules s
    JOIN academic_terms t ON t.id=s.term_id AND t.institution_id=s.institution_id
    WHERE s.institution_id=$2 AND s.student_id=$1
      AND s.status IN ('approved','rejected','change_requested') AND s.reviewed_at IS NOT NULL
      AND t.finalized_at IS NULL AND s.effective_ends_on >= (now() AT TIME ZONE t.timezone)::date
      AND s.id=(SELECT latest.id FROM student_duty_schedules latest
        WHERE latest.student_id=$1 AND latest.institution_id=$2 AND latest.term_id=s.term_id
        ORDER BY latest.version DESC LIMIT 1)
    UNION ALL
    SELECT 'student_agenda_event_reminder','Upcoming agenda event',
      e.title||' ? '||e.event_date::text||'. Check your agenda and prepare for this event.',
      'personal_agenda_event',e.id,
      'student-agenda:'||e.id::text||':'||e.event_date::text,
      '/student?agendaDate='||e.event_date::text,'warning'
    FROM personal_agenda_events e JOIN institutions i ON i.id=e.institution_id
    WHERE e.institution_id=$2 AND e.owner_id=$1
      AND e.event_date BETWEEN (now() AT TIME ZONE i.timezone)::date
        AND (now() AT TIME ZONE i.timezone)::date+7
  ), resolved AS (
    UPDATE notifications n SET resolved_at=now(),updated_at=now()
    WHERE n.recipient_id=$1 AND n.institution_id=$2 AND n.resolved_at IS NULL
      AND n.type IN ('student_duty_preference_approved','student_duty_preference_rejected','student_duty_preference_change_requested','student_agenda_event_reminder')
      AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.dedupe_key=n.dedupe_key)
    RETURNING n.id
  ), created AS (
    INSERT INTO notifications(recipient_id,institution_id,type,title,message,related_type,related_id,
      important,dedupe_key,severity,action_url)
    SELECT $1,$2,type,title,message,related_type,related_id,true,dedupe_key,severity,action_url FROM candidates
    ON CONFLICT(recipient_id,dedupe_key) DO UPDATE SET
      title=EXCLUDED.title,message=EXCLUDED.message,action_url=EXCLUDED.action_url,
      resolved_at=NULL,updated_at=now(),
      read_at=CASE WHEN notifications.resolved_at IS NOT NULL THEN NULL ELSE notifications.read_at END
    WHERE notifications.title IS DISTINCT FROM EXCLUDED.title
      OR notifications.message IS DISTINCT FROM EXCLUDED.message
      OR notifications.action_url IS DISTINCT FROM EXCLUDED.action_url
      OR notifications.resolved_at IS NOT NULL
    RETURNING id
  )
  INSERT INTO notification_deliveries(notification_id,channel,status)
    SELECT id,'in_app','sent' FROM created
    ON CONFLICT(notification_id,channel) DO NOTHING`, [user.id, user.institutionId]);
}
