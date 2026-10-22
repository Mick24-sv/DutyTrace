-- Institution-owned, versioned policy templates. Applying a version records a
-- dated scope assignment and immutable configuration snapshot; it never edits
-- student-hour assignments or historical attendance/DTR records.
ALTER TABLE duty_requirement_policies
  ADD COLUMN maximum_weekly_hours numeric(5,2)
    CHECK (maximum_weekly_hours IS NULL OR (maximum_weekly_hours > 0 AND maximum_weekly_hours <= 168));

ALTER TABLE attendance_events
  ADD COLUMN policy_version_id uuid,
  ADD COLUMN policy_snapshot jsonb;
ALTER TABLE student_duty_schedules
  ADD COLUMN policy_version_id uuid,
  ADD COLUMN policy_snapshot jsonb;

CREATE TABLE institution_policy_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived','superseded')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,institution_id)
);
CREATE UNIQUE INDEX institution_policy_template_name_unique
  ON institution_policy_templates(institution_id,lower(name)) WHERE status <> 'archived';
CREATE INDEX institution_policy_templates_scope_idx
  ON institution_policy_templates(institution_id,status,updated_at DESC);

CREATE TABLE institution_policy_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived','superseded')),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration)='object'),
  change_reason text NOT NULL CHECK (length(btrim(change_reason)) BETWEEN 5 AND 1000),
  previous_version_id uuid REFERENCES institution_policy_template_versions(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (template_id,version_number),
  UNIQUE (id,institution_id),
  UNIQUE (id,template_id,institution_id),
  FOREIGN KEY (template_id,institution_id)
    REFERENCES institution_policy_templates(id,institution_id) ON DELETE RESTRICT,
  FOREIGN KEY (previous_version_id,template_id,institution_id)
    REFERENCES institution_policy_template_versions(id,template_id,institution_id) ON DELETE RESTRICT,
  CONSTRAINT institution_policy_version_publication CHECK (
    (status='draft' AND published_by IS NULL AND published_at IS NULL)
    OR (status IN ('published','archived','superseded') AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);
CREATE INDEX institution_policy_versions_template_idx
  ON institution_policy_template_versions(template_id,version_number DESC);
ALTER TABLE duty_requirement_policies
  ADD COLUMN template_version_id uuid,
  ADD CONSTRAINT duty_requirement_policy_template_version_fk
    FOREIGN KEY (template_version_id,institution_id)
    REFERENCES institution_policy_template_versions(id,institution_id) ON DELETE RESTRICT;

CREATE FUNCTION institution_policy_version_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' AND (
       NEW.configuration IS DISTINCT FROM OLD.configuration
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
       OR NEW.change_reason IS DISTINCT FROM OLD.change_reason
       OR NEW.previous_version_id IS DISTINCT FROM OLD.previous_version_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('archived','superseded'))
  ) THEN
    RAISE EXCEPTION 'Published policy versions are immutable; create a new draft version'
      USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_version_immutable
  BEFORE UPDATE ON institution_policy_template_versions
  FOR EACH ROW EXECUTE FUNCTION institution_policy_version_guard();
CREATE FUNCTION institution_policy_version_no_delete() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Policy version history cannot be deleted' USING ERRCODE='integrity_constraint_violation'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_version_no_delete
  BEFORE DELETE OR TRUNCATE ON institution_policy_template_versions
  FOR EACH STATEMENT EXECUTE FUNCTION institution_policy_version_no_delete();

CREATE TABLE institution_policy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('institution','office','student')),
  scope_id uuid NOT NULL,
  version_id uuid NOT NULL,
  template_name_snapshot text NOT NULL CHECK (length(btrim(template_name_snapshot)) BETWEEN 1 AND 120),
  effective_starts_on date NOT NULL,
  effective_ends_on date NOT NULL,
  configuration_snapshot jsonb NOT NULL CHECK (jsonb_typeof(configuration_snapshot)='object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 1000),
  applied_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institution_policy_assignment_dates CHECK (effective_ends_on >= effective_starts_on),
  FOREIGN KEY (version_id,institution_id)
    REFERENCES institution_policy_template_versions(id,institution_id) ON DELETE RESTRICT
);
CREATE INDEX institution_policy_assignment_lookup_idx
  ON institution_policy_assignments(institution_id,term_id,scope_type,scope_id,effective_starts_on,effective_ends_on);

CREATE FUNCTION institution_policy_assignment_validate() RETURNS trigger AS $$
DECLARE term_institution uuid; term_start date; term_end date; term_finalized timestamptz; target_institution uuid;
  actor_role user_role; actor_institution uuid; version_status text;
BEGIN
  SELECT institution_id,starts_on,ends_on,finalized_at INTO term_institution,term_start,term_end,term_finalized
    FROM academic_terms WHERE id=NEW.term_id;
  IF term_institution IS DISTINCT FROM NEW.institution_id THEN
    RAISE EXCEPTION 'Policy assignment term must belong to the same institution' USING ERRCODE='foreign_key_violation';
  END IF;
  IF term_finalized IS NOT NULL THEN
    RAISE EXCEPTION 'A finalized term cannot receive a policy assignment' USING ERRCODE='integrity_constraint_violation';
  END IF;
  SELECT role,institution_id INTO actor_role,actor_institution FROM users WHERE id=NEW.applied_by AND status='active';
  SELECT status INTO version_status FROM institution_policy_template_versions
    WHERE id=NEW.version_id AND institution_id=NEW.institution_id;
  IF actor_role IS DISTINCT FROM 'admin'::user_role OR actor_institution IS DISTINCT FROM NEW.institution_id
     OR version_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Only an institutional administrator may apply a published policy version' USING ERRCODE='foreign_key_violation';
  END IF;
  IF NEW.effective_starts_on < term_start OR NEW.effective_ends_on > term_end THEN
    RAISE EXCEPTION 'Policy assignment dates must fall within the academic term' USING ERRCODE='check_violation';
  END IF;
  IF NEW.scope_type='institution' THEN
    IF NEW.scope_id IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Institution policy scope must use the institution id' USING ERRCODE='foreign_key_violation';
    END IF;
  ELSIF NEW.scope_type='office' THEN
    SELECT institution_id INTO target_institution FROM offices WHERE id=NEW.scope_id;
    IF target_institution IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Office policy scope must belong to the institution' USING ERRCODE='foreign_key_violation';
    END IF;
  ELSE
    SELECT institution_id INTO target_institution FROM users WHERE id=NEW.scope_id AND role='student';
    IF target_institution IS DISTINCT FROM NEW.institution_id THEN
      RAISE EXCEPTION 'Student policy scope must belong to the institution' USING ERRCODE='foreign_key_violation';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('policy-assignment:'||NEW.term_id::text||':'||NEW.scope_type||':'||NEW.scope_id::text));
  IF EXISTS (SELECT 1 FROM institution_policy_assignments a WHERE a.term_id=NEW.term_id
      AND a.scope_type=NEW.scope_type AND a.scope_id=NEW.scope_id AND a.id<>NEW.id
      AND daterange(a.effective_starts_on,a.effective_ends_on,'[]') && daterange(NEW.effective_starts_on,NEW.effective_ends_on,'[]')) THEN
    RAISE EXCEPTION 'Policy assignments for the same scope cannot overlap' USING ERRCODE='exclusion_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_assignment_validate
  BEFORE INSERT OR UPDATE ON institution_policy_assignments
  FOR EACH ROW EXECUTE FUNCTION institution_policy_assignment_validate();
CREATE FUNCTION institution_policy_assignment_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Policy assignments are append-only; use an explicit superseding assignment' USING ERRCODE='integrity_constraint_violation'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_assignment_no_update_delete
  BEFORE UPDATE OR DELETE ON institution_policy_assignments
  FOR EACH ROW EXECUTE FUNCTION institution_policy_assignment_immutable();
CREATE TRIGGER institution_policy_assignment_no_truncate
  BEFORE TRUNCATE ON institution_policy_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION institution_policy_assignment_immutable();

ALTER TABLE attendance_events
  ADD CONSTRAINT attendance_events_policy_version_fk
  FOREIGN KEY (policy_version_id) REFERENCES institution_policy_template_versions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT attendance_events_policy_snapshot_object
  CHECK (policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot)='object');
ALTER TABLE student_duty_schedules
  ADD CONSTRAINT student_duty_schedules_policy_version_fk
    FOREIGN KEY(policy_version_id,institution_id) REFERENCES institution_policy_template_versions(id,institution_id) ON DELETE RESTRICT,
  ADD CONSTRAINT student_duty_schedules_policy_snapshot_object
    CHECK (policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot)='object');

ALTER TABLE absence_notices
  ADD COLUMN policy_version_id uuid,
  ADD COLUMN policy_snapshot jsonb,
  ADD CONSTRAINT absence_notices_policy_version_fk
    FOREIGN KEY(policy_version_id) REFERENCES institution_policy_template_versions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT absence_notices_policy_snapshot_object
    CHECK (policy_snapshot IS NULL OR jsonb_typeof(policy_snapshot)='object');

CREATE FUNCTION attendance_event_policy_version_guard() RETURNS trigger AS $$
DECLARE event_institution uuid; version_institution uuid;
BEGIN
  IF NEW.policy_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT institution_id INTO event_institution FROM users WHERE id=NEW.user_id;
  SELECT institution_id INTO version_institution FROM institution_policy_template_versions WHERE id=NEW.policy_version_id;
  IF event_institution IS DISTINCT FROM version_institution THEN
    RAISE EXCEPTION 'Attendance policy snapshot must belong to the attendance user institution' USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_event_policy_version_guard
  BEFORE INSERT OR UPDATE OF policy_version_id,user_id ON attendance_events
  FOR EACH ROW EXECUTE FUNCTION attendance_event_policy_version_guard();

CREATE FUNCTION absence_policy_version_guard() RETURNS trigger AS $$
DECLARE notice_institution uuid; version_institution uuid;
BEGIN
  IF NEW.policy_version_id IS NULL THEN RETURN NEW; END IF;
  SELECT institution_id INTO notice_institution FROM users WHERE id=NEW.user_id;
  SELECT institution_id INTO version_institution FROM institution_policy_template_versions WHERE id=NEW.policy_version_id;
  IF notice_institution IS DISTINCT FROM version_institution THEN
    RAISE EXCEPTION 'Absence policy snapshot must belong to the notice user institution' USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER absence_policy_version_guard
  BEFORE INSERT OR UPDATE OF policy_version_id,user_id ON absence_notices
  FOR EACH ROW EXECUTE FUNCTION absence_policy_version_guard();

ALTER TABLE institution_policy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_policy_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_policy_assignments ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION institution_policy_template_actor_guard() RETURNS trigger AS $$
DECLARE creator_institution uuid; updater_institution uuid; creator_role user_role; updater_role user_role;
BEGIN
  SELECT institution_id,role INTO creator_institution,creator_role FROM users WHERE id=NEW.created_by AND status='active';
  SELECT institution_id,role INTO updater_institution,updater_role FROM users WHERE id=NEW.updated_by AND status='active';
  IF creator_institution IS DISTINCT FROM NEW.institution_id OR creator_role IS DISTINCT FROM 'admin'::user_role
     OR updater_institution IS DISTINCT FROM NEW.institution_id OR updater_role IS DISTINCT FROM 'admin'::user_role THEN
    RAISE EXCEPTION 'Policy templates must be managed by active administrators from their own institution' USING ERRCODE='foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_template_actor_guard
  BEFORE INSERT OR UPDATE ON institution_policy_templates
  FOR EACH ROW EXECUTE FUNCTION institution_policy_template_actor_guard();

CREATE FUNCTION institution_policy_version_actor_guard() RETURNS trigger AS $$
DECLARE creator_institution uuid; creator_role user_role; publisher_institution uuid; publisher_role user_role;
BEGIN
  SELECT institution_id,role INTO creator_institution,creator_role FROM users WHERE id=NEW.created_by AND status='active';
  IF creator_institution IS DISTINCT FROM NEW.institution_id OR creator_role IS DISTINCT FROM 'admin'::user_role THEN
    RAISE EXCEPTION 'Policy versions must be created by an administrator from their own institution' USING ERRCODE='foreign_key_violation';
  END IF;
  IF NEW.published_by IS NOT NULL THEN
    SELECT institution_id,role INTO publisher_institution,publisher_role FROM users WHERE id=NEW.published_by AND status='active';
    IF publisher_institution IS DISTINCT FROM NEW.institution_id OR publisher_role IS DISTINCT FROM 'admin'::user_role THEN
      RAISE EXCEPTION 'Policy versions must be published by an administrator from their own institution' USING ERRCODE='foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER institution_policy_version_actor_guard
  BEFORE INSERT OR UPDATE ON institution_policy_template_versions
  FOR EACH ROW EXECUTE FUNCTION institution_policy_version_actor_guard();

COMMENT ON TABLE institution_policy_assignments IS 'Append-only, dated institution/office/student policy assignments with immutable configuration snapshots.';
