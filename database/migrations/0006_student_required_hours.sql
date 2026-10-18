-- DutyTrace migration 0006: Student assistant specific required duty hours
-- Allows administrators to configure individual required monthly duty hours per student.
-- If NULL, falls back to the institutional policy_settings.required_monthly_hours.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS required_hours numeric(6,2)
  CONSTRAINT users_required_hours_range CHECK (required_hours IS NULL OR (required_hours > 0 AND required_hours <= 744));

COMMENT ON COLUMN users.required_hours IS 'Configured monthly duty-hour requirement for this student. If NULL, policy_settings applies.';

