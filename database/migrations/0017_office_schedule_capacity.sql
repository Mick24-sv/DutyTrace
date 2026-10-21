-- Maximum simultaneous Student Assistants assigned to an office duty period.
-- Existing offices default to one student per overlapping time slot.
ALTER TABLE offices
  ADD COLUMN schedule_capacity integer NOT NULL DEFAULT 1
  CHECK (schedule_capacity > 0 AND schedule_capacity <= 500);

COMMENT ON COLUMN offices.schedule_capacity IS
  'Maximum number of distinct Student Assistants assigned to overlapping weekly duty periods in this office.';
