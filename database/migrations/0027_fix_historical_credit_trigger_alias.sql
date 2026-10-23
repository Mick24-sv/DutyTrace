-- OLD is a special trigger record in PL/pgSQL, so it cannot also be used as a
-- table alias in the amendment validation query.
CREATE OR REPLACE FUNCTION historical_duty_credit_validate() RETURNS trigger AS $$
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
    SELECT 1 FROM historical_duty_credits prior_credit WHERE prior_credit.id=NEW.amends_id
      AND prior_credit.student_id=NEW.student_id AND prior_credit.term_id=NEW.term_id AND prior_credit.credit_month=NEW.credit_month
      AND prior_credit.status='approved' AND prior_credit.granularity=NEW.granularity
      AND prior_credit.work_date IS NOT DISTINCT FROM NEW.work_date
  ) THEN
    RAISE EXCEPTION 'amendments must reference an approved matching credit';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
