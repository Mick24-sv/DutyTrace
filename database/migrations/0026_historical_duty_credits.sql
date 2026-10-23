-- Historical paper-DTR credits are explicit verified totals, never QR events.
CREATE TABLE historical_duty_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  credit_month char(7) NOT NULL CHECK (credit_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  granularity text NOT NULL CHECK (granularity IN ('monthly_total','daily')),
  work_date date,
  hours numeric(7,2) NOT NULL CHECK (hours > 0 AND hours <= 744),
  verification_source text NOT NULL CHECK (length(btrim(verification_source)) BETWEEN 3 AND 200),
  verification_reference text NOT NULL CHECK (length(btrim(verification_reference)) BETWEEN 3 AND 500),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  exceptional boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('pending_admin','approved','rejected','superseded')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  review_note text,
  amends_id uuid REFERENCES historical_duty_credits(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT historical_credit_granularity_date CHECK (
    (granularity='monthly_total' AND work_date IS NULL) OR
    (granularity='daily' AND work_date IS NOT NULL AND to_char(work_date,'YYYY-MM')=credit_month)
  ),
  CONSTRAINT historical_credit_daily_hours CHECK (granularity<>'daily' OR hours<=24),
  CONSTRAINT historical_credit_review_state CHECK (
    (status='pending_admin' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
    (status IN ('approved','rejected','superseded') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE INDEX historical_credits_term_student_month_idx
  ON historical_duty_credits(institution_id,term_id,student_id,credit_month,status);
CREATE INDEX historical_credits_admin_queue_idx
  ON historical_duty_credits(institution_id,created_at DESC) WHERE status='pending_admin';
CREATE UNIQUE INDEX historical_credits_pending_amendment_unique
  ON historical_duty_credits(amends_id) WHERE amends_id IS NOT NULL AND status='pending_admin';

CREATE TABLE historical_duty_credit_history (
  id bigserial PRIMARY KEY,
  credit_id uuid NOT NULL REFERENCES historical_duty_credits(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX historical_credit_history_item_idx ON historical_duty_credit_history(credit_id,created_at,id);

CREATE FUNCTION historical_duty_credit_validate() RETURNS trigger AS $$
DECLARE
  t academic_terms%ROWTYPE;
  student_institution uuid;
  office_institution uuid;
  month_start date;
  month_end date;
BEGIN
  SELECT * INTO t FROM academic_terms WHERE id=NEW.term_id;
  SELECT institution_id INTO student_institution FROM users WHERE id=NEW.student_id AND role='student';
  SELECT institution_id INTO office_institution FROM offices WHERE id=NEW.office_id;
  IF t.id IS NULL OR t.institution_id IS DISTINCT FROM NEW.institution_id
     OR student_institution IS DISTINCT FROM NEW.institution_id
     OR office_institution IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION 'historical credit institution, term, student, and office must match';
  END IF;
  month_start := (NEW.credit_month || '-01')::date;
  month_end := (month_start + interval '1 month - 1 day')::date;
  IF NEW.work_date IS NOT NULL AND (NEW.work_date<t.starts_on OR NEW.work_date>t.ends_on) THEN
    RAISE EXCEPTION 'historical credit date must be within the selected term';
  END IF;
  IF NEW.granularity='monthly_total' AND (month_start<t.starts_on OR month_end>t.ends_on) THEN
    RAISE EXCEPTION 'monthly total must fit entirely inside the selected term';
  END IF;
  IF NEW.credit_month >= to_char(now() AT TIME ZONE t.timezone,'YYYY-MM') THEN
    RAISE EXCEPTION 'historical credits are only allowed for completed months';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('historical-credit:'||NEW.student_id::text||':'||NEW.term_id::text||':'||NEW.credit_month));
  IF EXISTS (
    SELECT 1 FROM historical_duty_credits c
    WHERE c.student_id=NEW.student_id AND c.term_id=NEW.term_id AND c.credit_month=NEW.credit_month
      AND c.status IN ('approved','pending_admin') AND c.id IS DISTINCT FROM NEW.id
      AND c.id IS DISTINCT FROM NEW.amends_id
      AND (NEW.granularity='monthly_total' OR c.granularity='monthly_total')
  ) THEN
    RAISE EXCEPTION 'a monthly total cannot overlap another historical credit';
  END IF;
  IF NEW.granularity='daily' AND EXISTS (
    SELECT 1 FROM historical_duty_credits c WHERE c.student_id=NEW.student_id AND c.term_id=NEW.term_id
      AND c.work_date=NEW.work_date AND c.granularity='daily' AND c.status IN ('approved','pending_admin')
      AND c.id IS DISTINCT FROM NEW.amends_id
  ) THEN
    RAISE EXCEPTION 'a daily historical credit already exists for this student and date';
  END IF;
  IF NEW.amends_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM historical_duty_credits old WHERE old.id=NEW.amends_id
      AND old.student_id=NEW.student_id AND old.term_id=NEW.term_id AND old.credit_month=NEW.credit_month
      AND old.status='approved' AND old.granularity=NEW.granularity AND old.work_date IS NOT DISTINCT FROM NEW.work_date
  ) THEN
    RAISE EXCEPTION 'amendments must reference an approved matching credit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER historical_duty_credit_validate_trg
  BEFORE INSERT ON historical_duty_credits FOR EACH ROW EXECUTE FUNCTION historical_duty_credit_validate();

CREATE FUNCTION historical_duty_credit_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'historical duty credits are append-only'; END IF;
  IF (to_jsonb(NEW)-'status'-'reviewed_by'-'reviewed_at'-'review_note') IS DISTINCT FROM
     (to_jsonb(OLD)-'status'-'reviewed_by'-'reviewed_at'-'review_note') THEN
    RAISE EXCEPTION 'historical credit details are immutable; create an amendment';
  END IF;
  IF NOT ((OLD.status='pending_admin' AND NEW.status IN ('approved','rejected')) OR
          (OLD.status='approved' AND NEW.status='superseded')) THEN
    RAISE EXCEPTION 'invalid historical credit status transition';
  END IF;
  IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
    RAISE EXCEPTION 'a reviewer and review timestamp are required';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER historical_duty_credit_no_mutation
  BEFORE UPDATE OR DELETE ON historical_duty_credits FOR EACH ROW EXECUTE FUNCTION historical_duty_credit_immutable();
CREATE FUNCTION historical_duty_credit_no_truncate() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'historical duty credits are append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER historical_duty_credit_no_truncate_trg
  BEFORE TRUNCATE ON historical_duty_credits FOR EACH STATEMENT EXECUTE FUNCTION historical_duty_credit_no_truncate();

CREATE FUNCTION historical_duty_credit_history_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'historical duty credit history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER historical_duty_credit_history_no_mutation
  BEFORE UPDATE OR DELETE ON historical_duty_credit_history FOR EACH ROW EXECUTE FUNCTION historical_duty_credit_history_immutable();
CREATE TRIGGER historical_duty_credit_history_no_truncate
  BEFORE TRUNCATE ON historical_duty_credit_history FOR EACH STATEMENT EXECUTE FUNCTION historical_duty_credit_history_immutable();
ALTER TABLE historical_duty_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_duty_credit_history ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE historical_duty_credits IS 'Explicit supervisor-verified non-QR historical duty hour credits, with immutable amendment and approval history.';
