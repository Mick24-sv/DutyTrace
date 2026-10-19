-- Extend duty policies and schedule review with explicit daily caps and supervisor suggestions.
ALTER TABLE duty_requirement_policies
  ADD COLUMN maximum_daily_hours numeric(4,2)
    CHECK (maximum_daily_hours IS NULL OR (maximum_daily_hours > 0 AND maximum_daily_hours <= 24)),
  ADD CONSTRAINT duty_requirement_daily_hours_order
    CHECK (maximum_daily_hours IS NULL OR minimum_daily_hours IS NULL OR maximum_daily_hours >= minimum_daily_hours);

ALTER TABLE student_duty_schedules
  ADD COLUMN suggested_days jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(suggested_days) = 'array' AND jsonb_array_length(suggested_days) <= 7);

COMMENT ON COLUMN student_duty_schedules.suggested_days IS
  'Optional reviewer-proposed alternatives; never overwrite the student submitted preferences.';

CREATE FUNCTION duty_requirement_daily_cap_validate() RETURNS trigger AS $$
DECLARE
  institution_default numeric(4,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('duty-default:' || NEW.institution_id::text));
  SELECT default_minimum_daily_hours INTO institution_default
    FROM institution_duty_requirement_settings WHERE institution_id = NEW.institution_id;
  IF NEW.maximum_daily_hours IS NOT NULL
     AND NEW.maximum_daily_hours < COALESCE(NEW.minimum_daily_hours, institution_default, 3) THEN
    RAISE EXCEPTION 'Maximum daily duty hours must be at least the effective minimum'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER duty_requirement_daily_cap_validate_trg
  BEFORE INSERT OR UPDATE ON duty_requirement_policies
  FOR EACH ROW EXECUTE FUNCTION duty_requirement_daily_cap_validate();

CREATE FUNCTION duty_requirement_default_daily_cap_validate() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('duty-default:' || NEW.institution_id::text));
  IF EXISTS (
    SELECT 1 FROM duty_requirement_policies p
    WHERE p.institution_id = NEW.institution_id AND p.maximum_daily_hours IS NOT NULL
      AND p.minimum_daily_hours IS NULL AND p.maximum_daily_hours < NEW.default_minimum_daily_hours
  ) THEN
    RAISE EXCEPTION 'The default minimum exceeds a configured policy maximum'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER duty_requirement_default_daily_cap_validate_trg
  BEFORE INSERT OR UPDATE ON institution_duty_requirement_settings
  FOR EACH ROW EXECUTE FUNCTION duty_requirement_default_daily_cap_validate();
