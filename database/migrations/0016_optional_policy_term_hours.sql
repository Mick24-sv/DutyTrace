-- Term-hour totals can be assigned per Student Assistant under Academic Terms.
-- Keep shared policies useful for days, daily limits and time windows without
-- requiring one institution-wide total.
ALTER TABLE duty_requirement_policies
  ALTER COLUMN required_term_hours DROP NOT NULL;
