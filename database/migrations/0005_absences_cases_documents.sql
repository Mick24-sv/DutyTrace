-- Phase 5: absence notifications, compliance cases, document submissions.
--
-- IMPORTANT (by design): nothing here excuses an absence, changes required hours, or marks a
-- student compliant/noncompliant. An absence notice is a record plus a review conversation.
-- A case is opened by a person; the database never derives one from hours or notices.
--
-- Append-only tables reuse dtr_history_block_changes() / dtr_block_truncate() from 0003/0004
-- (they are generic: they only report TG_TABLE_NAME).

CREATE TYPE absence_type AS ENUM ('planned', 'unexpected');
CREATE TYPE absence_status AS ENUM ('pending', 'acknowledged', 'reviewed', 'needs_follow_up');
CREATE TYPE absence_event_action AS ENUM
  ('submitted', 'acknowledged', 'reviewed', 'follow_up_requested', 'student_responded', 'document_added');

CREATE TYPE case_status AS ENUM
  ('open', 'documents_pending', 'under_review', 'needs_correction', 'resolved', 'closed');
CREATE TYPE case_event_action AS ENUM
  ('created', 'requirement_added', 'requirement_waived', 'document_added', 'receipt_recorded',
   'submitted_for_review', 'review_started', 'correction_requested', 'student_responded',
   'resolved', 'reopened', 'closed', 'note_added');

CREATE TYPE submission_method AS ENUM ('online', 'email', 'in_person');

-- ------------------------------------------------------------- absence notices
CREATE TABLE absence_notices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id    uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,   -- office at submission
  absence_type absence_type NOT NULL,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  reason       text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  status       absence_status NOT NULL DEFAULT 'pending',
  response     text CHECK (response IS NULL OR length(response) <= 2000),
  responded_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  responded_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),                       -- server clock only
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absence_dates_ordered CHECK (end_date >= start_date),
  CONSTRAINT absence_span_sane CHECK (end_date - start_date <= 30),      -- technical sanity, not policy
  CONSTRAINT absence_not_self_response CHECK (responded_by IS NULL OR responded_by <> user_id)
);
CREATE INDEX absence_notices_office_status ON absence_notices (office_id, status, submitted_at DESC);
CREATE INDEX absence_notices_user ON absence_notices (user_id, submitted_at DESC);

CREATE TABLE absence_events (
  id          bigserial PRIMARY KEY,
  absence_id  uuid NOT NULL REFERENCES absence_notices(id) ON DELETE RESTRICT,
  action      absence_event_action NOT NULL,
  from_status absence_status,
  to_status   absence_status NOT NULL,
  actor_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_up_needs_note CHECK
    (action NOT IN ('follow_up_requested', 'reviewed') OR length(btrim(coalesce(note, ''))) > 0)
);
CREATE INDEX absence_events_absence ON absence_events (absence_id, id);

-- ------------------------------------------------------------------ case types
-- Administrator-configured. required_documents is a TEMPLATE (array of labels) copied into each new
-- case, so editing a type later never changes existing cases.
CREATE TABLE case_types (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code               text NOT NULL CHECK (code ~ '^[A-Za-z0-9_-]{2,30}$'),
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description        text CHECK (description IS NULL OR length(description) <= 1000),
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_documents) = 'array'),
  is_active          boolean NOT NULL DEFAULT true,
  created_by         uuid REFERENCES users(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX case_types_code_unique ON case_types (lower(code));
CREATE TRIGGER case_types_set_updated_at BEFORE UPDATE ON case_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------ cases
CREATE SEQUENCE case_reference_seq;

CREATE TABLE compliance_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference       text NOT NULL UNIQUE CHECK (reference ~ '^CC-\d{4}-\d{6}$'),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id       uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,   -- office at creation
  case_type_id    uuid NOT NULL REFERENCES case_types(id) ON DELETE RESTRICT,
  description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  status          case_status NOT NULL DEFAULT 'open',
  decision        text CHECK (decision IS NULL OR length(decision) <= 4000),
  resolution_date date,
  resolved_by     uuid REFERENCES users(id) ON DELETE RESTRICT,
  resolved_at     timestamptz,
  closed_by       uuid REFERENCES users(id) ON DELETE RESTRICT,
  closed_at       timestamptz,
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_period_ordered CHECK (period_end >= period_start),
  CONSTRAINT resolved_has_decision CHECK
    (status <> 'resolved' OR (decision IS NOT NULL AND length(btrim(decision)) > 0 AND resolution_date IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  CONSTRAINT closed_has_closer CHECK (status <> 'closed' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL)),
  CONSTRAINT case_not_self_resolved CHECK (resolved_by IS NULL OR resolved_by <> user_id)
);
CREATE INDEX compliance_cases_office_status ON compliance_cases (office_id, status, created_at DESC);
CREATE INDEX compliance_cases_user ON compliance_cases (user_id, created_at DESC);

CREATE TABLE case_requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       uuid NOT NULL REFERENCES compliance_cases(id) ON DELETE RESTRICT,
  label         text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  is_required   boolean NOT NULL DEFAULT true,
  waived_at     timestamptz,
  waived_by     uuid REFERENCES users(id) ON DELETE RESTRICT,
  waived_reason text,
  created_by    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waiver_complete CHECK
    ((waived_at IS NULL AND waived_by IS NULL AND waived_reason IS NULL)
     OR (waived_at IS NOT NULL AND waived_by IS NOT NULL AND length(btrim(coalesce(waived_reason, ''))) > 0))
);
CREATE INDEX case_requirements_case ON case_requirements (case_id);

CREATE TABLE case_events (
  id             bigserial PRIMARY KEY,
  case_id        uuid NOT NULL REFERENCES compliance_cases(id) ON DELETE RESTRICT,
  action         case_event_action NOT NULL,
  from_status    case_status,
  to_status      case_status,
  actor_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note           text,
  requirement_id uuid REFERENCES case_requirements(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_event_needs_note CHECK
    (action NOT IN ('correction_requested', 'reopened', 'requirement_waived', 'closed', 'resolved')
     OR length(btrim(coalesce(note, ''))) > 0)
);
CREATE INDEX case_events_case ON case_events (case_id, id);

-- ------------------------------------------------------------------- documents
-- A "document" is one submission to an absence notice or a case. Online submissions always carry a
-- file. Email / in-person submissions are recorded by staff (received date, receiving staff member,
-- notes) and MAY carry a scanned file. Files live OUTSIDE the database in a private directory; only
-- a random stored_name is kept here, and it is never returned by the API.
CREATE TABLE documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,     -- the student the record is about
  absence_id     uuid REFERENCES absence_notices(id) ON DELETE RESTRICT,
  case_id        uuid REFERENCES compliance_cases(id) ON DELETE RESTRICT,
  requirement_id uuid REFERENCES case_requirements(id) ON DELETE RESTRICT,
  method         submission_method NOT NULL,
  original_name  text,
  stored_name    text UNIQUE,
  mime_type      text,
  size_bytes     integer CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 52428800),
  sha256         text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  received_date  date,
  received_by    uuid REFERENCES users(id) ON DELETE RESTRICT,
  receipt_notes  text CHECK (receipt_notes IS NULL OR length(receipt_notes) <= 2000),
  uploaded_by    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_one_parent CHECK ((absence_id IS NULL) <> (case_id IS NULL)),
  CONSTRAINT document_requirement_is_case CHECK (requirement_id IS NULL OR case_id IS NOT NULL),
  CONSTRAINT document_file_complete CHECK
    (stored_name IS NULL
     OR (original_name IS NOT NULL AND mime_type IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL)),
  CONSTRAINT online_has_file CHECK
    (method <> 'online' OR (stored_name IS NOT NULL AND received_date IS NULL AND uploaded_by = owner_id)),
  CONSTRAINT manual_has_receipt CHECK
    (method = 'online' OR (received_date IS NOT NULL AND received_by IS NOT NULL AND uploaded_by <> owner_id))
);
CREATE INDEX documents_absence ON documents (absence_id) WHERE absence_id IS NOT NULL;
CREATE INDEX documents_case ON documents (case_id) WHERE case_id IS NOT NULL;

-- ---------------------------------------------------------------------- guards
-- History and documents are append-only.
CREATE TRIGGER absence_events_append_only BEFORE UPDATE OR DELETE ON absence_events
  FOR EACH ROW EXECUTE FUNCTION dtr_history_block_changes();
CREATE TRIGGER case_events_append_only BEFORE UPDATE OR DELETE ON case_events
  FOR EACH ROW EXECUTE FUNCTION dtr_history_block_changes();
CREATE TRIGGER documents_append_only BEFORE UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION dtr_history_block_changes();

CREATE TRIGGER absence_events_no_truncate BEFORE TRUNCATE ON absence_events
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER case_events_no_truncate BEFORE TRUNCATE ON case_events
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER documents_no_truncate BEFORE TRUNCATE ON documents
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER absence_notices_no_truncate BEFORE TRUNCATE ON absence_notices
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER compliance_cases_no_truncate BEFORE TRUNCATE ON compliance_cases
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER case_requirements_no_truncate BEFORE TRUNCATE ON case_requirements
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();

-- Absence notices: never deleted; what the student submitted never changes; only valid status moves.
CREATE FUNCTION absence_notices_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Absence notices cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.office_id <> OLD.office_id OR NEW.absence_type <> OLD.absence_type
     OR NEW.start_date <> OLD.start_date OR NEW.end_date <> OLD.end_date OR NEW.reason <> OLD.reason
     OR NEW.submitted_at <> OLD.submitted_at THEN
    RAISE EXCEPTION 'The submitted details of an absence notice cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = OLD.status OR NOT (
       (OLD.status = 'pending'         AND NEW.status IN ('acknowledged', 'reviewed', 'needs_follow_up'))
    OR (OLD.status = 'acknowledged'    AND NEW.status IN ('reviewed', 'needs_follow_up'))
    OR (OLD.status = 'needs_follow_up' AND NEW.status IN ('pending', 'reviewed'))
  ) THEN
    RAISE EXCEPTION 'Invalid absence status change: % -> %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER absence_notices_guard_trg BEFORE UPDATE OR DELETE ON absence_notices
  FOR EACH ROW EXECUTE FUNCTION absence_notices_guard();

-- Cases: never deleted; identity fields never change; only valid status moves; a closed case is final.
CREATE FUNCTION compliance_cases_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cases cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'A closed case cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.reference <> OLD.reference OR NEW.user_id <> OLD.user_id OR NEW.office_id <> OLD.office_id
     OR NEW.case_type_id <> OLD.case_type_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.period_start <> OLD.period_start OR NEW.period_end <> OLD.period_end OR NEW.description <> OLD.description THEN
    RAISE EXCEPTION 'The identity of a case cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = OLD.status OR NOT (
       (OLD.status = 'open'              AND NEW.status IN ('documents_pending', 'under_review', 'closed'))
    OR (OLD.status = 'documents_pending' AND NEW.status IN ('under_review', 'closed'))
    OR (OLD.status = 'under_review'      AND NEW.status IN ('documents_pending', 'needs_correction', 'resolved', 'closed'))
    OR (OLD.status = 'needs_correction'  AND NEW.status IN ('under_review', 'closed'))
    OR (OLD.status = 'resolved'          AND NEW.status IN ('under_review', 'closed'))
  ) THEN
    RAISE EXCEPTION 'Invalid case status change: % -> %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER compliance_cases_guard_trg BEFORE UPDATE OR DELETE ON compliance_cases
  FOR EACH ROW EXECUTE FUNCTION compliance_cases_guard();

-- Requirements: never deleted; the only allowed change is a one-time waiver.
CREATE FUNCTION case_requirements_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Case requirements cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.waived_at IS NOT NULL OR NEW.case_id <> OLD.case_id OR NEW.label <> OLD.label
     OR NEW.is_required <> OLD.is_required OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'A case requirement can only be waived once and is otherwise fixed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER case_requirements_guard_trg BEFORE UPDATE OR DELETE ON case_requirements
  FOR EACH ROW EXECUTE FUNCTION case_requirements_guard();
