-- Centralized, institution-configurable risk alerts and delivery state.
ALTER TABLE notifications
  ADD COLUMN severity text NOT NULL DEFAULT 'informational'
    CHECK (severity IN ('informational','warning','critical')),
  ADD COLUMN action_url text,
  ADD COLUMN risk_key text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN dismissed_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE notifications SET severity='warning' WHERE important=true;
UPDATE notifications SET risk_key='attendance-discrepancy:'||related_id::text
  WHERE related_type='attendance_discrepancy' AND related_id IS NOT NULL;

CREATE INDEX notifications_active_scope_idx
  ON notifications (institution_id, severity, created_at DESC)
  WHERE resolved_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX notifications_risk_key_idx
  ON notifications (recipient_id, risk_key) WHERE risk_key IS NOT NULL;

CREATE TABLE institution_alert_policies (
  institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE RESTRICT,
  completion_risk_warning_days integer NOT NULL DEFAULT 30 CHECK (completion_risk_warning_days BETWEEN 1 AND 180),
  critical_completion_risk_days integer NOT NULL DEFAULT 7 CHECK (critical_completion_risk_days BETWEEN 0 AND 30),
  deadline_reminder_days integer[] NOT NULL DEFAULT ARRAY[7,3,1] CHECK (cardinality(deadline_reminder_days) BETWEEN 1 AND 10),
  upcoming_shift_reminder_hours integer NOT NULL DEFAULT 24 CHECK (upcoming_shift_reminder_hours BETWEEN 1 AND 168),
  notification_cooldown_hours integer NOT NULL DEFAULT 24 CHECK (notification_cooldown_hours BETWEEN 1 AND 720),
  enabled_categories text[] NOT NULL DEFAULT ARRAY['completion_risk','deadline','upcoming_shift','attendance','missed_shift','recovery','transition','schedule_conflict','dtr','absence','compliance','documents','semester_requirement'],
  email_enabled boolean NOT NULL DEFAULT false,
  email_minimum_severity text NOT NULL DEFAULT 'critical' CHECK(email_minimum_severity IN ('informational','warning','critical')),
  escalation_after_hours integer NOT NULL DEFAULT 48 CHECK(escalation_after_hours BETWEEN 1 AND 720),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO institution_alert_policies(institution_id) SELECT id FROM institutions ON CONFLICT DO NOTHING;
CREATE FUNCTION seed_institution_alert_policy() RETURNS trigger AS $$
BEGIN
  INSERT INTO institution_alert_policies(institution_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institutions_seed_alert_policy_trg AFTER INSERT ON institutions
  FOR EACH ROW EXECUTE FUNCTION seed_institution_alert_policy();

CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  email_reminders boolean NOT NULL DEFAULT false,
  upcoming_shift_reminders boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_preferences_institution_idx ON notification_preferences(institution_id,user_id);

CREATE TABLE notification_deliveries (
  id bigserial PRIMARY KEY,
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN ('in_app','email')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  handed_off_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id,channel)
);
CREATE INDEX notification_deliveries_due_idx ON notification_deliveries(next_attempt_at,id)
  WHERE status IN ('pending','failed');

INSERT INTO notification_deliveries(notification_id,channel,status)
SELECT id,'in_app','sent' FROM notifications ON CONFLICT(notification_id,channel) DO NOTHING;

COMMENT ON TABLE notification_deliveries IS 'Idempotent per-channel delivery outbox. Email is marked sent only after SMTP confirms handoff.';
