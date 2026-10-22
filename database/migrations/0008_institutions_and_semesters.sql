-- Institutions own their academic calendars. Semester requirements are separate
-- from monthly DTR requirements and each assignment is retained as a version.
CREATE TABLE institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_timezone_not_blank CHECK (length(btrim(timezone)) > 0)
);

INSERT INTO institutions (name)
SELECT 'Default Institution'
WHERE NOT EXISTS (SELECT 1 FROM institutions);
CREATE UNIQUE INDEX institutions_name_unique ON institutions (lower(name));

ALTER TABLE users ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;
ALTER TABLE offices ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;

UPDATE users SET institution_id = (SELECT id FROM institutions ORDER BY created_at, id LIMIT 1);
UPDATE offices SET institution_id = (SELECT id FROM institutions ORDER BY created_at, id LIMIT 1);

ALTER TABLE users ALTER COLUMN institution_id SET NOT NULL;
ALTER TABLE offices ALTER COLUMN institution_id SET NOT NULL;
CREATE INDEX users_institution_role_idx ON users (institution_id, role, status);
CREATE INDEX offices_institution_idx ON offices (institution_id, is_active);
DROP INDEX offices_code_unique;
CREATE UNIQUE INDEX offices_institution_code_unique ON offices (institution_id, lower(code));

CREATE FUNCTION duty_assignments_same_institution() RETURNS trigger AS $$
DECLARE
  user_institution uuid;
  office_institution uuid;
BEGIN
  SELECT institution_id INTO user_institution FROM users WHERE id = NEW.user_id;
  SELECT institution_id INTO office_institution FROM offices WHERE id = NEW.office_id;
  IF user_institution IS NULL OR user_institution <> office_institution THEN
    RAISE EXCEPTION 'User and office must belong to the same institution'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER duty_assignments_same_institution_trg
  BEFORE INSERT OR UPDATE OF user_id, office_id ON duty_assignments
  FOR EACH ROW EXECUTE FUNCTION duty_assignments_same_institution();

CREATE TABLE academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  academic_year text NOT NULL CHECK (length(btrim(academic_year)) > 0),
  semester text NOT NULL CHECK (semester IN ('first', 'second', 'summer')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  completion_deadline date,
  timezone text NOT NULL,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_terms_dates_valid CHECK (ends_on >= starts_on),
  CONSTRAINT academic_terms_deadline_valid CHECK (completion_deadline IS NULL OR completion_deadline >= starts_on),
  CONSTRAINT academic_terms_finalized_consistent CHECK ((finalized_at IS NULL) = (finalized_by IS NULL)),
  CONSTRAINT academic_terms_unique UNIQUE (institution_id, academic_year, semester)
);
CREATE INDEX academic_terms_institution_dates_idx ON academic_terms (institution_id, starts_on, ends_on);
CREATE TRIGGER academic_terms_set_updated_at BEFORE UPDATE ON academic_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION academic_terms_prevent_overlap() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('academic-term:' || NEW.institution_id::text));
  IF EXISTS (
    SELECT 1 FROM academic_terms t
    WHERE t.institution_id = NEW.institution_id
      AND t.id <> NEW.id
      AND daterange(t.starts_on, t.ends_on, '[]') && daterange(NEW.starts_on, NEW.ends_on, '[]')
  ) THEN
    RAISE EXCEPTION 'Academic terms for one institution cannot overlap'
      USING ERRCODE = 'exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER academic_terms_no_overlap
  BEFORE INSERT OR UPDATE OF institution_id, starts_on, ends_on ON academic_terms
  FOR EACH ROW EXECUTE FUNCTION academic_terms_prevent_overlap();

CREATE FUNCTION academic_terms_prevent_finalized_changes() RETURNS trigger AS $$
BEGIN
  IF OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'A finalized academic term cannot be changed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.finalized_at IS NOT NULL AND OLD.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'An academic term can only be finalized once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER academic_terms_finalized_immutable
  BEFORE UPDATE OR DELETE ON academic_terms
  FOR EACH ROW EXECUTE FUNCTION academic_terms_prevent_finalized_changes();

CREATE TABLE semester_requirement_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,
  required_hours numeric(8,2) CHECK (required_hours IS NULL OR (required_hours > 0 AND required_hours <= 10000)),
  assigned_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX semester_requirements_student_idx
  ON semester_requirement_assignments (student_id, term_id, assigned_at DESC);
CREATE INDEX semester_requirements_term_office_idx
  ON semester_requirement_assignments (term_id, office_id, student_id);

CREATE FUNCTION semester_requirement_assignments_validate() RETURNS trigger AS $$
DECLARE
  term_institution uuid;
  student_institution uuid;
  office_institution uuid;
  term_finalized timestamptz;
BEGIN
  SELECT institution_id, finalized_at INTO term_institution, term_finalized
    FROM academic_terms WHERE id = NEW.term_id;
  SELECT institution_id INTO student_institution FROM users WHERE id = NEW.student_id AND role = 'student';
  SELECT institution_id INTO office_institution FROM offices WHERE id = NEW.office_id;

  IF term_institution IS NULL OR term_institution <> student_institution OR term_institution <> office_institution THEN
    RAISE EXCEPTION 'Term, student, and office must belong to the same institution, and student must be a Student Assistant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF term_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'Requirements cannot be changed for a finalized academic term'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER semester_requirement_assignments_validate_trg
  BEFORE INSERT ON semester_requirement_assignments
  FOR EACH ROW EXECUTE FUNCTION semester_requirement_assignments_validate();

CREATE FUNCTION semester_requirement_assignments_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Semester requirement assignments are immutable; add a new assignment version'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER semester_requirement_assignments_no_update_delete
  BEFORE UPDATE OR DELETE ON semester_requirement_assignments
  FOR EACH ROW EXECUTE FUNCTION semester_requirement_assignments_immutable();
CREATE TRIGGER semester_requirement_assignments_no_truncate
  BEFORE TRUNCATE ON semester_requirement_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_changes();

COMMENT ON TABLE academic_terms IS 'Institution-specific academic terms; finalized terms are immutable.';
COMMENT ON TABLE semester_requirement_assignments IS 'Append-only version history of individual student duty-hour requirements per term.';
