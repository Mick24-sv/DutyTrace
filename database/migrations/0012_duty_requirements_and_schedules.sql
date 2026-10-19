-- Configurable term duty rules and versioned Student Assistant schedule proposals.
-- Schedule preferences are review/compliance data; they do not authorize or block scans.

CREATE TABLE institution_duty_requirement_settings (
  institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE RESTRICT,
  default_minimum_daily_hours numeric(4,2) NOT NULL DEFAULT 3
    CHECK (default_minimum_daily_hours > 0 AND default_minimum_daily_hours <= 24),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO institution_duty_requirement_settings (institution_id)
SELECT id FROM institutions;

CREATE TABLE duty_requirement_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('institution', 'office', 'student')),
  scope_id uuid NOT NULL,
  effective_starts_on date NOT NULL,
  effective_ends_on date NOT NULL,
  required_term_hours numeric(8,2) NOT NULL CHECK (required_term_hours > 0 AND required_term_hours <= 10000),
  minimum_daily_hours numeric(4,2) CHECK (minimum_daily_hours IS NULL OR (minimum_daily_hours > 0 AND minimum_daily_hours <= 24)),
  permitted_weekdays smallint[] NOT NULL,
  permitted_time_windows jsonb NOT NULL,
  exception_reason text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duty_requirement_policy_dates CHECK (effective_ends_on >= effective_starts_on),
  CONSTRAINT duty_requirement_policy_days CHECK (
    cardinality(permitted_weekdays) BETWEEN 1 AND 7
    AND array_position(permitted_weekdays, NULL) IS NULL
    AND permitted_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT duty_requirement_policy_windows CHECK (
    jsonb_typeof(permitted_time_windows) = 'array'
    AND jsonb_array_length(permitted_time_windows) BETWEEN 1 AND 8
  ),
  CONSTRAINT duty_requirement_policy_exception CHECK (
    (scope_type = 'student' AND length(btrim(COALESCE(exception_reason, ''))) >= 5)
    OR (scope_type <> 'student' AND exception_reason IS NULL)
  )
);
CREATE INDEX duty_requirement_policy_lookup_idx
  ON duty_requirement_policies (term_id, scope_type, scope_id, effective_starts_on, effective_ends_on);
CREATE TRIGGER duty_requirement_policies_updated_at
  BEFORE UPDATE ON duty_requirement_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION duty_requirement_policy_validate() RETURNS trigger AS $$
DECLARE
  term_institution uuid;
  term_start date;
  term_end date;
  term_finalized timestamptz;
  target_institution uuid;
  actor_role user_role;
  actor_institution uuid;
  item jsonb;
  prior jsonb;
  window_start time;
  window_end time;
  prior_start time;
  prior_end time;
  distinct_days integer;
BEGIN
  SELECT institution_id, starts_on, ends_on, finalized_at
    INTO term_institution, term_start, term_end, term_finalized
    FROM academic_terms WHERE id = NEW.term_id;
  SELECT role, institution_id INTO actor_role, actor_institution
    FROM users WHERE id = NEW.updated_by AND status = 'active';
  IF term_institution IS NULL OR term_institution <> NEW.institution_id
     OR actor_role IS DISTINCT FROM 'admin'::user_role OR actor_institution <> NEW.institution_id THEN
    RAISE EXCEPTION 'Duty policy term, institution and administrator must match'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF term_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'Duty requirements cannot change for a finalized term'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.effective_starts_on < term_start OR NEW.effective_ends_on > term_end THEN
    RAISE EXCEPTION 'Duty policy effective dates must be within the academic term'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.scope_type = 'institution' THEN
    IF NEW.scope_id <> NEW.institution_id THEN
      RAISE EXCEPTION 'Institution policy scope must be the policy institution'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.scope_type = 'office' THEN
    SELECT institution_id INTO target_institution FROM offices WHERE id = NEW.scope_id;
    IF target_institution IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Office policy must belong to the policy institution'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSE
    SELECT institution_id INTO target_institution FROM users WHERE id = NEW.scope_id AND role = 'student';
    IF target_institution IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Student exception must belong to the policy institution'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  SELECT count(DISTINCT day) INTO distinct_days FROM unnest(NEW.permitted_weekdays) AS day;
  IF distinct_days <> cardinality(NEW.permitted_weekdays)
     OR EXISTS (SELECT 1 FROM unnest(NEW.permitted_weekdays) AS day WHERE day < 1 OR day > 7) THEN
    RAISE EXCEPTION 'Duty policy weekdays must be unique ISO weekdays from 1 to 7'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR item IN SELECT w.value FROM jsonb_array_elements(NEW.permitted_time_windows) AS w(value) LOOP
    IF jsonb_typeof(item) <> 'object' OR NOT (item ? 'startTime') OR NOT (item ? 'endTime') THEN
      RAISE EXCEPTION 'Duty policy windows need startTime and endTime'
        USING ERRCODE = 'check_violation';
    END IF;
    BEGIN
      window_start := (item->>'startTime')::time;
      window_end := (item->>'endTime')::time;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Duty policy time window is invalid'
        USING ERRCODE = 'check_violation';
    END;
    IF window_start >= window_end THEN
      RAISE EXCEPTION 'Overnight or zero-length duty policy windows are not supported'
        USING ERRCODE = 'check_violation';
    END IF;
    FOR prior IN SELECT w.value FROM jsonb_array_elements(NEW.permitted_time_windows) AS w(value) LOOP
      CONTINUE WHEN prior = item;
      BEGIN
        prior_start := (prior->>'startTime')::time;
        prior_end := (prior->>'endTime')::time;
      EXCEPTION WHEN OTHERS THEN
        CONTINUE;
      END;
      IF window_start < prior_end AND prior_start < window_end THEN
        RAISE EXCEPTION 'Duty policy time windows cannot overlap'
          USING ERRCODE = 'exclusion_violation';
      END IF;
    END LOOP;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('duty-policy:' || NEW.term_id::text || ':' || NEW.scope_type || ':' || NEW.scope_id::text));
  IF EXISTS (
    SELECT 1 FROM duty_requirement_policies p
    WHERE p.term_id = NEW.term_id AND p.scope_type = NEW.scope_type AND p.scope_id = NEW.scope_id
      AND p.id <> NEW.id
      AND daterange(p.effective_starts_on, p.effective_ends_on, '[]')
          && daterange(NEW.effective_starts_on, NEW.effective_ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'Duty policies for the same scope cannot overlap in effective dates'
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER duty_requirement_policies_validate
  BEFORE INSERT OR UPDATE ON duty_requirement_policies
  FOR EACH ROW EXECUTE FUNCTION duty_requirement_policy_validate();

CREATE TABLE student_duty_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  request_kind text NOT NULL CHECK (request_kind IN ('initial', 'change')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'change_requested')),
  effective_starts_on date NOT NULL,
  effective_ends_on date NOT NULL,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_reason text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_duty_schedule_dates CHECK (effective_ends_on >= effective_starts_on),
  CONSTRAINT student_duty_schedule_version UNIQUE (student_id, term_id, version),
  CONSTRAINT student_duty_schedule_review CHECK (
    (status IN ('approved', 'rejected', 'change_requested') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status IN ('draft', 'pending_review') AND reviewed_by IS NULL AND reviewed_at IS NULL)
  )
);
CREATE INDEX student_duty_schedules_office_idx
  ON student_duty_schedules (institution_id, office_id, status, term_id, updated_at DESC);
CREATE INDEX student_duty_schedules_student_idx
  ON student_duty_schedules (student_id, term_id, version DESC);
CREATE UNIQUE INDEX student_duty_schedules_one_open_per_term
  ON student_duty_schedules (student_id, term_id)
  WHERE status IN ('draft', 'pending_review', 'change_requested');
CREATE TRIGGER student_duty_schedules_updated_at
  BEFORE UPDATE ON student_duty_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION student_duty_schedule_validate() RETURNS trigger AS $$
DECLARE
  term_institution uuid;
  term_start date;
  term_end date;
  term_finalized timestamptz;
  student_institution uuid;
  student_role user_role;
  office_institution uuid;
  current_office uuid;
  reviewer_role user_role;
  reviewer_institution uuid;
BEGIN
  SELECT institution_id, starts_on, ends_on, finalized_at
    INTO term_institution, term_start, term_end, term_finalized
    FROM academic_terms WHERE id = NEW.term_id;
  SELECT institution_id, role INTO student_institution, student_role FROM users WHERE id = NEW.student_id;
  SELECT institution_id INTO office_institution FROM offices WHERE id = NEW.office_id;
  SELECT office_id INTO current_office FROM duty_assignments WHERE user_id = NEW.student_id AND ends_on IS NULL;
  IF term_institution IS NULL OR student_institution <> term_institution OR office_institution <> term_institution
     OR NEW.institution_id <> term_institution OR student_role <> 'student' OR current_office <> NEW.office_id THEN
    RAISE EXCEPTION 'Schedule student, current office and term must belong to the same institution'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.effective_starts_on < term_start OR NEW.effective_ends_on > term_end THEN
    RAISE EXCEPTION 'Schedule dates must be within its academic term' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id <> OLD.student_id OR NEW.term_id <> OLD.term_id OR NEW.institution_id <> OLD.institution_id
       OR NEW.office_id <> OLD.office_id OR NEW.version <> OLD.version OR NEW.request_kind <> OLD.request_kind THEN
      RAISE EXCEPTION 'Schedule identity fields are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NOT (
      (OLD.status IN ('draft', 'rejected', 'change_requested') AND NEW.status = OLD.status)
      OR (OLD.status IN ('rejected', 'change_requested') AND NEW.status = 'draft')
      OR (OLD.status IN ('draft', 'rejected', 'change_requested') AND NEW.status = 'pending_review')
      OR (OLD.status = 'pending_review' AND NEW.status IN ('approved', 'rejected', 'change_requested'))
    ) THEN
      RAISE EXCEPTION 'Invalid student duty schedule status transition' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status IN ('approved', 'rejected', 'change_requested') THEN
      SELECT role, institution_id INTO reviewer_role, reviewer_institution FROM users WHERE id = NEW.reviewed_by;
      IF reviewer_role IS NULL OR reviewer_role NOT IN ('admin', 'supervisor') OR reviewer_institution <> NEW.institution_id THEN
        RAISE EXCEPTION 'Schedule reviewer must be institutional staff' USING ERRCODE = 'foreign_key_violation';
      END IF;
    END IF;
    IF term_finalized IS NOT NULL AND NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'Schedule decisions cannot change for a finalized term' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  ELSIF NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'New duty schedules must start as drafts' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER student_duty_schedules_validate
  BEFORE INSERT OR UPDATE ON student_duty_schedules
  FOR EACH ROW EXECUTE FUNCTION student_duty_schedule_validate();

CREATE TABLE student_duty_schedule_days (
  schedule_id uuid NOT NULL REFERENCES student_duty_schedules(id) ON DELETE RESTRICT,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  PRIMARY KEY (schedule_id, weekday),
  CONSTRAINT student_duty_schedule_day_time CHECK (starts_at < ends_at)
);

CREATE FUNCTION student_duty_schedule_day_editable() RETURNS trigger AS $$
DECLARE
  schedule_status text;
BEGIN
  SELECT status INTO schedule_status FROM student_duty_schedules WHERE id = COALESCE(NEW.schedule_id, OLD.schedule_id);
  IF schedule_status IS NULL OR schedule_status NOT IN ('draft', 'rejected', 'change_requested') THEN
    RAISE EXCEPTION 'Only an editable schedule proposal can change its duty days'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER student_duty_schedule_days_editable
  BEFORE INSERT OR UPDATE OR DELETE ON student_duty_schedule_days
  FOR EACH ROW EXECUTE FUNCTION student_duty_schedule_day_editable();

-- These records are accessed through the backend only, never from the public Supabase API.
ALTER TABLE institution_duty_requirement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE duty_requirement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_duty_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_duty_schedule_days ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE duty_requirement_policies IS 'Institution, office or authorized individual duty rules. Precedence is individual policy, office policy, institution policy; explicit per-student semester-hour assignments override policy total hours unless an individual exception policy exists.';
COMMENT ON TABLE student_duty_schedules IS 'Versioned weekly schedule preferences. An approved preference is for monitoring only and never authorizes or rejects QR attendance scans.';
