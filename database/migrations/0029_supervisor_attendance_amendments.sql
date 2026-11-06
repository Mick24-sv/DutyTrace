-- An amendment may replace an earlier correction without mutating its history.
CREATE TABLE attendance_adjustment_replacements (
  adjustment_id uuid NOT NULL REFERENCES attendance_adjustments(id) ON DELETE RESTRICT,
  replaced_adjustment_id uuid NOT NULL UNIQUE REFERENCES attendance_adjustments(id) ON DELETE RESTRICT,
  PRIMARY KEY (adjustment_id, replaced_adjustment_id),
  CHECK (adjustment_id <> replaced_adjustment_id)
);
CREATE TRIGGER attendance_adjustment_replacements_no_mutation
  BEFORE UPDATE OR DELETE ON attendance_adjustment_replacements
  FOR EACH ROW EXECUTE FUNCTION attendance_adjustments_immutable();
CREATE TRIGGER attendance_adjustment_replacements_no_truncate
  BEFORE TRUNCATE ON attendance_adjustment_replacements
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_adjustments_immutable();
ALTER TABLE attendance_adjustment_replacements ENABLE ROW LEVEL SECURITY;
