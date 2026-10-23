-- Attendance discrepancy workflow. Raw QR attendance_events remain append-only;
-- approved changes are represented by separate effective-event adjustments.
ALTER TABLE institutions
  ADD COLUMN attendance_discrepancy_grace_minutes integer NOT NULL DEFAULT 30
    CHECK (attendance_discrepancy_grace_minutes BETWEEN 0 AND 1440),
  ADD COLUMN attendance_early_tolerance_minutes integer NOT NULL DEFAULT 15
    CHECK (attendance_early_tolerance_minutes BETWEEN 0 AND 1440),
  ADD COLUMN attendance_late_tolerance_minutes integer NOT NULL DEFAULT 15
    CHECK (attendance_late_tolerance_minutes BETWEEN 0 AND 1440);

CREATE TABLE attendance_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid REFERENCES offices(id) ON DELETE RESTRICT,
  schedule_id uuid REFERENCES student_duty_schedules(id) ON DELETE RESTRICT,
  attendance_event_id uuid REFERENCES attendance_events(id) ON DELETE RESTRICT,
  shift_date date,
  discrepancy_type text NOT NULL CHECK (discrepancy_type IN
    ('scheduled_no_attendance','missing_clock_out','outside_assigned_shift','duplicate_or_overlap')),
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','explanation_submitted','under_review','approved_correction','rejected','resolved','cancelled','superseded')),
  original_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  detection_reason text NOT NULL,
  student_explanation text,
  proposed_correction jsonb,
  supervisor_decision text,
  supervisor_remarks text,
  reviewer_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  detected_at timestamptz NOT NULL DEFAULT now(),
  explanation_submitted_at timestamptz,
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, dedupe_key)
);
CREATE INDEX attendance_discrepancies_student_idx ON attendance_discrepancies (student_id, detected_at DESC);
CREATE INDEX attendance_discrepancies_office_status_idx ON attendance_discrepancies (institution_id, office_id, status, detected_at DESC);
CREATE INDEX attendance_discrepancies_type_date_idx ON attendance_discrepancies (institution_id, discrepancy_type, shift_date DESC);

CREATE TABLE attendance_discrepancy_history (
  id bigserial PRIMARY KEY,
  discrepancy_id uuid NOT NULL REFERENCES attendance_discrepancies(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  from_status text,
  to_status text,
  note text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attendance_discrepancy_history_item_idx ON attendance_discrepancy_history(discrepancy_id, created_at, id);

CREATE TABLE attendance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discrepancy_id uuid NOT NULL UNIQUE REFERENCES attendance_discrepancies(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid REFERENCES offices(id) ON DELETE RESTRICT,
  effective_events jsonb NOT NULL,
  dtr_month char(7),
  verified_delta_seconds integer NOT NULL DEFAULT 0,
  approved_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_adjustment_month CHECK (dtr_month IS NULL OR dtr_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
CREATE INDEX attendance_adjustments_student_idx ON attendance_adjustments(institution_id, student_id, approved_at);
CREATE TABLE attendance_adjustment_sources (
  adjustment_id uuid NOT NULL REFERENCES attendance_adjustments(id) ON DELETE RESTRICT,
  event_id uuid NOT NULL REFERENCES attendance_events(id) ON DELETE RESTRICT,
  PRIMARY KEY (adjustment_id,event_id)
);
CREATE INDEX attendance_adjustment_sources_event_idx ON attendance_adjustment_sources(event_id);

CREATE FUNCTION attendance_discrepancy_history_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'attendance discrepancy history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_discrepancy_history_no_mutation
  BEFORE UPDATE OR DELETE ON attendance_discrepancy_history
  FOR EACH ROW EXECUTE FUNCTION attendance_discrepancy_history_immutable();
CREATE TRIGGER attendance_discrepancy_history_no_truncate
  BEFORE TRUNCATE ON attendance_discrepancy_history
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_discrepancy_history_immutable();

CREATE FUNCTION attendance_discrepancy_transition_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('approved_correction','rejected','resolved','cancelled','superseded')
     AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'a final attendance discrepancy cannot be changed';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status='open' AND NEW.status IN ('explanation_submitted','under_review','resolved','cancelled','superseded')) OR
    (OLD.status='explanation_submitted' AND NEW.status IN ('open','under_review','approved_correction','rejected','resolved','cancelled','superseded')) OR
    (OLD.status='under_review' AND NEW.status IN ('open','explanation_submitted','approved_correction','rejected','resolved','cancelled','superseded'))
  ) THEN
    RAISE EXCEPTION 'invalid attendance discrepancy status transition: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_discrepancy_transition_guard_trg
  BEFORE UPDATE ON attendance_discrepancies FOR EACH ROW EXECUTE FUNCTION attendance_discrepancy_transition_guard();

CREATE FUNCTION attendance_adjustments_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'approved attendance adjustments are append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_adjustments_no_mutation
  BEFORE UPDATE OR DELETE ON attendance_adjustments
  FOR EACH ROW EXECUTE FUNCTION attendance_adjustments_immutable();
CREATE TRIGGER attendance_adjustments_no_truncate
  BEFORE TRUNCATE ON attendance_adjustments
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_adjustments_immutable();
CREATE TRIGGER attendance_adjustment_sources_no_mutation
  BEFORE UPDATE OR DELETE ON attendance_adjustment_sources
  FOR EACH ROW EXECUTE FUNCTION attendance_adjustments_immutable();
CREATE TRIGGER attendance_adjustment_sources_no_truncate
  BEFORE TRUNCATE ON attendance_adjustment_sources
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_adjustments_immutable();
ALTER TABLE attendance_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_discrepancy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_adjustment_sources ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE attendance_adjustments IS 'Approved overlays over immutable QR events; effective_events are applied only to calculated attendance.';
