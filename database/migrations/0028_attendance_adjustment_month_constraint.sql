-- Correct the attendance adjustment month check. The original migration used
-- an over-escaped digit class, which rejected valid YYYY-MM values whenever a
-- correction was applied to an approved monthly DTR.
ALTER TABLE attendance_adjustments
  DROP CONSTRAINT attendance_adjustment_month;

ALTER TABLE attendance_adjustments
  ADD CONSTRAINT attendance_adjustment_month
    CHECK (dtr_month IS NULL OR dtr_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
