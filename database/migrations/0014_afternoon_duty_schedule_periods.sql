-- Add an optional afternoon period to each selected weekday while preserving
-- existing morning preferences and historical schedule versions.
ALTER TABLE student_duty_schedule_days
  ADD COLUMN afternoon_starts_at time,
  ADD COLUMN afternoon_ends_at time,
  ADD CONSTRAINT student_duty_schedule_afternoon_pair CHECK (
    (afternoon_starts_at IS NULL AND afternoon_ends_at IS NULL)
    OR (
      afternoon_starts_at IS NOT NULL
      AND afternoon_ends_at IS NOT NULL
      AND ends_at <= afternoon_starts_at
      AND afternoon_starts_at < afternoon_ends_at
    )
  );

COMMENT ON COLUMN student_duty_schedule_days.afternoon_starts_at IS
  'Optional second, afternoon preference period. Preferences never count as attendance.';
