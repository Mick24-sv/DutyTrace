-- Dated recovery requests are separate from attendance and weekly preferences.
CREATE TABLE duty_recovery_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','rejected','withdrawn')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text,
  CONSTRAINT duty_recovery_plan_review CHECK
    ((status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
      OR (status IN ('pending_review','withdrawn') AND reviewed_by IS NULL AND reviewed_at IS NULL))
);
CREATE INDEX duty_recovery_plans_student_idx ON duty_recovery_plans (student_id, created_at DESC);
CREATE INDEX duty_recovery_plans_queue_idx ON duty_recovery_plans (office_id, status, created_at);

CREATE TABLE duty_recovery_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES duty_recovery_plans(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  shift_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duty_recovery_shift_time CHECK (starts_at < ends_at),
  CONSTRAINT duty_recovery_shift_duration CHECK (ends_at - starts_at <= interval '12 hours'),
  CONSTRAINT duty_recovery_shift_unique UNIQUE (plan_id, shift_date, starts_at, ends_at)
);
CREATE INDEX duty_recovery_shifts_date_idx ON duty_recovery_shifts (institution_id, office_id, shift_date, status);
CREATE INDEX duty_recovery_shifts_student_idx ON duty_recovery_shifts (student_id, shift_date, status);
ALTER TABLE duty_recovery_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_recovery_shifts ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE duty_recovery_plans IS 'Student requests for dated recovery shifts. Only approved rows represent future scheduled hours; attendance remains the source of completed hours.';
