// Keep archived workflow messages out of the simplified app and email queue.
export const CORE_NOTIFICATION_SQL = `COALESCE(related_type,'') NOT IN ('duty_schedule','duty_recovery_plan','semester_transition')
  AND type !~ '^(completion|upcoming|recovery|schedule|semester_transition)'
  AND (type NOT IN ('historical_credit_review_requested','agenda_event_reminder','admin_term_deadline_reminder',
      'duty_preference_review_requested','supervisor_agenda_event_reminder','supervisor_term_deadline_reminder',
      'student_duty_preference_approved','student_duty_preference_rejected',
      'student_duty_preference_change_requested','student_agenda_event_reminder')
    OR resolved_at IS NULL)`;
