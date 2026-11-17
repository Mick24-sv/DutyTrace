import { query } from '../../db/pool.js';

// Reconcile the bell with current actionable records, including entries created
// before notifications were enabled. One scoped statement avoids per-item reads.
export async function syncAdminAttention(user, db = { query }) {
  if (user.role !== 'admin') return;
  await db.query(`WITH candidates AS (
    SELECT 'historical_credit_review_requested'::text AS type,
      'Historical duty credit needs review'::text AS title,
      u.full_name||' · '||o.name||' · '||c.hours::text||' hours for '||c.credit_month||
        '. Review the supporting record before approving or rejecting.' AS message,
      'historical_duty_credit'::text AS related_type,c.id AS related_id,
      'historical-duty-credit:'||c.id::text||':review' AS dedupe_key,
      '/admin/historical-hours?creditId='||c.id::text AS action_url
    FROM historical_duty_credits c
    JOIN users u ON u.id=c.student_id AND u.institution_id=c.institution_id
    JOIN offices o ON o.id=c.office_id AND o.institution_id=c.institution_id
    WHERE c.institution_id=$2 AND c.status='pending_admin'
    UNION ALL
    SELECT 'agenda_event_reminder','Upcoming agenda event',
      e.title||' · '||e.event_date::text||'. Check your agenda and prepare for this event.',
      'personal_agenda_event',e.id,
      'admin-agenda:'||e.id::text||':'||e.event_date::text,
      '/admin?agendaDate='||e.event_date::text
    FROM personal_agenda_events e JOIN institutions i ON i.id=e.institution_id
    WHERE e.institution_id=$2 AND e.owner_id=$1
      AND e.event_date BETWEEN (now() AT TIME ZONE i.timezone)::date
        AND (now() AT TIME ZONE i.timezone)::date+7
    UNION ALL
    SELECT 'admin_term_deadline_reminder','Duty completion deadline approaching',
      t.academic_year||' · '||t.semester||' semester · deadline '||t.completion_deadline::text||
        '. Review student requirements and outstanding duty records.',
      'academic_term',t.id,
      'admin-term-deadline:'||t.id::text||':'||t.completion_deadline::text,
      '/admin/semesters'
    FROM academic_terms t
    WHERE t.institution_id=$2 AND t.finalized_at IS NULL
      AND t.completion_deadline BETWEEN (now() AT TIME ZONE t.timezone)::date
        AND (now() AT TIME ZONE t.timezone)::date+7
  ), resolved AS (
    UPDATE notifications n SET resolved_at=now(),updated_at=now()
    WHERE n.recipient_id=$1 AND n.institution_id=$2 AND n.resolved_at IS NULL
      AND n.type IN ('historical_credit_review_requested','agenda_event_reminder','admin_term_deadline_reminder')
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
    ON CONFLICT(notification_id,channel) DO NOTHING`, [user.id, user.institutionId]);
}
