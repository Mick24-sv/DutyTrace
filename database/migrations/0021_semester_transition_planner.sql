-- Transitions preserve source-term balances and never silently copy requirements.
ALTER TABLE institution_duty_requirement_settings
  ADD COLUMN semester_transition_policy text
    CHECK (semester_transition_policy IS NULL OR semester_transition_policy = 'keep_original');

CREATE TABLE semester_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  source_term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  destination_term_id uuid NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','finalized','cancelled')),
  policy text NOT NULL CHECK (policy = 'keep_original'),
  policy_snapshot jsonb NOT NULL,
  source_fingerprint text NOT NULL,
  preview_data jsonb NOT NULL,
  previewed_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  previewed_at timestamptz NOT NULL DEFAULT now(),
  finalized_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  finalized_at timestamptz,
  cancelled_by uuid REFERENCES users(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT semester_transition_distinct_terms CHECK (source_term_id <> destination_term_id),
  CONSTRAINT semester_transition_finalized_consistent CHECK
    ((status = 'finalized' AND finalized_by IS NOT NULL AND finalized_at IS NOT NULL)
      OR (status <> 'finalized' AND finalized_by IS NULL AND finalized_at IS NULL)),
  CONSTRAINT semester_transition_cancelled_consistent CHECK
    ((status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
      OR (status <> 'cancelled' AND cancelled_by IS NULL AND cancelled_at IS NULL)),
  CONSTRAINT semester_transition_identity UNIQUE (institution_id, source_term_id, destination_term_id)
);
CREATE INDEX semester_transitions_institution_idx ON semester_transitions (institution_id, created_at DESC);

CREATE TABLE semester_transition_students (
  transition_id uuid NOT NULL REFERENCES semester_transitions(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  student_status text NOT NULL CHECK (student_status IN ('continued','review_required')),
  source_required_hours numeric(8,2),
  source_completed_hours numeric(8,2) NOT NULL,
  source_remaining_hours numeric(8,2),
  destination_required_hours numeric(8,2),
  pending_recovery_shifts integer NOT NULL DEFAULT 0,
  unresolved_dtr_count integer NOT NULL DEFAULT 0,
  incomplete_session_count integer NOT NULL DEFAULT 0,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (transition_id, student_id)
);
CREATE INDEX semester_transition_students_student_idx ON semester_transition_students (student_id, created_at DESC);
ALTER TABLE semester_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE semester_transition_students ENABLE ROW LEVEL SECURITY;
COMMENT ON COLUMN institution_duty_requirement_settings.semester_transition_policy IS
  'NULL blocks transition finalization. keep_original closes the source term with its outstanding balance intact and never copies that balance into the destination requirement.';
