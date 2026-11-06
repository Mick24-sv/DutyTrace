CREATE TABLE attendance_session_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES institutions(id),
  student_id uuid NOT NULL REFERENCES users(id),
  supervisor_id uuid NOT NULL REFERENCES users(id),
  office_id uuid NOT NULL REFERENCES offices(id),
  session_id text NOT NULL,
  work_date date NOT NULL,
  time_in timestamptz NOT NULL,
  time_out timestamptz NOT NULL CHECK (time_out > time_in),
  seconds integer NOT NULL CHECK (seconds > 0),
  explanation text NOT NULL CHECK (length(explanation) BETWEEN 5 AND 2000),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, session_id, time_in, time_out)
);
CREATE INDEX attendance_session_verifications_student_date ON attendance_session_verifications(student_id,work_date);
