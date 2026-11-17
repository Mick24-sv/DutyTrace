import { query } from '../../db/pool.js';

// Reconcile the bell with current actionable records, including entries created
// before notifications were enabled. One scoped statement avoids per-item reads.
export async function syncSupervisorAttention(user, db = { query }) {
  if (user.role !== 'supervisor') return;
  await db.query(`WITH candidates AS (
    SELECT 'duty_preference_review_requested'::text AS type,
      'Duty preferences need review'::text AS title,
      u.full_name||' submitted duty preferences. Check the proposed hours and office capacity before approving.' AS message,
      'student_duty_schedule'::text AS related_type,s.id AS related_id,
      'supervisor-schedule:'||s.id::text||':'||s.version::text AS dedupe_key,
      '/supervisor/schedule-review'::text AS action_url
    FROM student_duty_schedules s
    JOIN users u ON u.id=s.student_id AND u.institution_id=s.institution_id
    JOIN academic_terms t ON t.id=s.term_id AND t.institution_id=s.institution_id
    WHERE s.institution_id=$2 AND s.office_id=$3 AND s.status='pending_review'
      AND u.status='active' AND t.finalized_at IS NULL
    UNION ALL
    SELECT 'supervisor_agenda_event_reminder','Upcoming agenda event',
      e.title||' ? '||e.event_date::text||'. Check your agenda and prepare for this event.',
      'personal_agenda_event',e.id,
      'supervisor-agenda:'||e.id::text||':'||e.event_date::text,
      '/supervisor?agendaDate='||e.event_date::text
    FROM personal_agenda_events e JOIN institutions i ON i.id=e.institution_id
    WHERE e.institution_id=$2 AND e.owner_id=$1
      AND e.event_date BETWEEN (now() AT TIME ZONE i.timezone)::date
        AND (now() AT TIME ZONE i.timezone)::date+7
    UNION ALL
    SELECT 'supervisor_term_deadline_reminder','Office duty completion deadline approaching',
      t.academic_year||' ? '||t.semester||' semester ? deadline '||t.completion_deadline::text||
        '. Review your office students and outstanding duty records.',
      'academic_term',t.id,
      'supervisor-term-deadline:'||t.id::text||':'||t.completion_deadline::text,
      '/supervisor/assistants'
    FROM academic_terms t
    WHERE t.institution_id=$2 AND t.finalized_at IS NULL
      AND t.completion_deadline BETWEEN (now() AT TIME ZONE t.timezone)::date
        AND (now() AT TIME ZONE t.timezone)::date+7
      AND EXISTS (SELECT 1 FROM semester_requirement_assignments a
        JOIN users u ON u.id=a.student_id AND u.institution_id=t.institution_id AND u.status='active'
        WHERE a.term_id=t.id AND a.office_id=$3
          AND a.id=(SELECT latest.id FROM semester_requirement_assignments latest
            WHERE latest.term_id=a.term_id AND latest.student_id=a.student_id
            ORDER BY latest.assigned_at DESC,latest.id DESC LIMIT 1))
  ), resolved AS (
    UPDATE notifications n SET resolved_at=now(),updated_at=now()
    WHERE n.recipient_id=$1 AND n.institution_id=$2 AND n.resolved_at IS NULL
      AND n.type IN ('duty_preference_review_requested','supervisor_agenda_event_reminder','supervisor_term_deadline_reminder')
      AND NOT EXISTS (SELECT 1 FROM candidates c WHERE c.dedupe_key=n.dedupe_key)
    RETURNING n.id
  ), created AS (
    INSERT INTO notifications(recipient_id,institution_id,type,title,message,related_type,related_id,
      important,dedupe_key,severity,action_url)
    SELECT $1,$2,type,title,message,related_type,related_id,true,dedupe_key,'warning',action_url FROM candidates
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
    ON CONFLICT(notification_id,channel) DO NOTHING`, [user.id, user.institutionId, user.office?.id ?? null]);
}
