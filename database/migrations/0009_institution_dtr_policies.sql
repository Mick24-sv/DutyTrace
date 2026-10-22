-- Keep monthly DTR targets (a separate workflow from semester completion)
-- configurable per institution instead of sharing one global policy row.
CREATE TABLE institution_dtr_policies (
  institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE RESTRICT,
  required_monthly_hours numeric(6,2) NOT NULL DEFAULT 40
    CHECK (required_monthly_hours > 0 AND required_monthly_hours <= 744),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO institution_dtr_policies (institution_id, required_monthly_hours, updated_by, updated_at)
SELECT i.id, p.required_monthly_hours, p.updated_by, p.updated_at
FROM institutions i CROSS JOIN policy_settings p
ON CONFLICT (institution_id) DO NOTHING;
