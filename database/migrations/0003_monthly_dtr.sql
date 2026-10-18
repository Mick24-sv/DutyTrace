-- Phase 4: Monthly DTR management.
--   policy_settings  : single-row, admin-editable policy values (required monthly hours).
--   monthly_dtrs     : one DTR per student per month; holds the workflow status.
--   dtr_revisions    : immutable snapshots. Every (re)generation adds a revision; none is ever changed.
--   dtr_events       : immutable who/what/when history (generated, submitted, returned with reason, ...).
-- Existing tables and data are untouched.

CREATE TYPE dtr_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'needs_correction');
CREATE TYPE dtr_event_action AS ENUM
  ('generated', 'regenerated', 'submitted', 'review_started', 'approved', 'returned');

-- ---------------------------------------------------------------- policy
-- PLACEHOLDER value. ADNU has not confirmed required hours (docs/open-questions.md #1).
CREATE TABLE policy_settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),   -- forces a single row
  required_monthly_hours numeric(6,2) NOT NULL DEFAULT 40 CHECK (required_monthly_hours > 0 AND required_monthly_hours <= 744),
  updated_by             uuid REFERENCES users(id) ON DELETE RESTRICT,
  updated_at             timestamptz NOT NULL DEFAULT now()
);
INSERT INTO policy_settings (id) VALUES (true);

-- ------------------------------------------------------------------ DTRs
CREATE TABLE monthly_dtrs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  office_id        uuid NOT NULL REFERENCES offices(id) ON DELETE RESTRICT,  -- office at generation time
  month            char(7) NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status           dtr_status NOT NULL DEFAULT 'draft',
  current_revision integer NOT NULL DEFAULT 1 CHECK (current_revision >= 1),
  -- Supervisor-verified time. Only set by approval; NULL otherwise. Never copied from "recorded" automatically.
  verified_seconds integer CHECK (verified_seconds >= 0),
  verified_revision integer,
  decided_by       uuid REFERENCES users(id) ON DELETE RESTRICT,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month),
  CONSTRAINT approved_has_verification CHECK (
    status <> 'approved' OR (verified_seconds IS NOT NULL AND verified_revision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT only_approved_is_verified CHECK (status = 'approved' OR verified_seconds IS NULL),
  CONSTRAINT no_self_decision CHECK (decided_by IS NULL OR decided_by <> user_id)
);
CREATE INDEX monthly_dtrs_office_status ON monthly_dtrs (office_id, status, month);

CREATE TABLE dtr_revisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dtr_id       uuid NOT NULL REFERENCES monthly_dtrs(id) ON DELETE RESTRICT,
  revision_no  integer NOT NULL CHECK (revision_no >= 1),
  snapshot     jsonb NOT NULL,                       -- days, sessions, totals, required hours, flags (see dtr.service.js)
  generated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dtr_id, revision_no)
);

CREATE TABLE dtr_events (
  id          bigserial PRIMARY KEY,
  dtr_id      uuid NOT NULL REFERENCES monthly_dtrs(id) ON DELETE RESTRICT,
  revision_no integer NOT NULL,
  action      dtr_event_action NOT NULL,
  from_status dtr_status,
  to_status   dtr_status NOT NULL,
  actor_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT returned_needs_reason CHECK (action <> 'returned' OR length(btrim(coalesce(reason, ''))) > 0)
);
CREATE INDEX dtr_events_dtr ON dtr_events (dtr_id, id);

-- ------------------------------------------------------------ guards
-- History is append-only.
CREATE FUNCTION dtr_history_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dtr_revisions_append_only BEFORE UPDATE OR DELETE ON dtr_revisions
  FOR EACH ROW EXECUTE FUNCTION dtr_history_block_changes();
CREATE TRIGGER dtr_events_append_only BEFORE UPDATE OR DELETE ON dtr_events
  FOR EACH ROW EXECUTE FUNCTION dtr_history_block_changes();

-- Defence in depth for the workflow (the API enforces the same rules first):
--   * DTR rows are never deleted;
--   * an approved DTR can never change again;
--   * owner and month never change;
--   * only these status moves are allowed.
CREATE FUNCTION monthly_dtrs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DTRs cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'An approved DTR cannot be changed' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.user_id <> OLD.user_id OR NEW.month <> OLD.month THEN
    RAISE EXCEPTION 'A DTR cannot change owner or month' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
       (OLD.status = 'draft'            AND NEW.status = 'submitted')
    OR (OLD.status = 'submitted'        AND NEW.status = 'under_review')
    OR (OLD.status = 'under_review'     AND NEW.status IN ('approved', 'needs_correction'))
    OR (OLD.status = 'needs_correction' AND NEW.status IN ('draft', 'submitted'))
  ) THEN
    RAISE EXCEPTION 'Invalid DTR status change: % -> %', OLD.status, NEW.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.status = OLD.status AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'A % DTR cannot be modified', OLD.status USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER monthly_dtrs_guard_trg BEFORE UPDATE OR DELETE ON monthly_dtrs
  FOR EACH ROW EXECUTE FUNCTION monthly_dtrs_guard();
