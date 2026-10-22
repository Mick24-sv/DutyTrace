-- DutyTrace migration 0019: add configurable forecast historical window to institution settings
ALTER TABLE institution_duty_requirement_settings
  ADD COLUMN IF NOT EXISTS forecast_historical_weeks integer NOT NULL DEFAULT 4
  CHECK (forecast_historical_weeks BETWEEN 1 AND 16);

