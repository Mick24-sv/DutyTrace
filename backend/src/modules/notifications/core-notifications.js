// Keep archived workflow messages out of the simplified app and email queue.
export const CORE_NOTIFICATION_SQL = `COALESCE(related_type,'') NOT IN ('duty_schedule','duty_recovery_plan','semester_transition')
  AND type !~ '^(completion|upcoming|recovery|schedule|semester_transition)'`;
