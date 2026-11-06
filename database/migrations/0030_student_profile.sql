-- Optional student academic details. Existing accounts remain valid.
ALTER TABLE users
  ADD COLUMN year_level smallint CHECK (year_level BETWEEN 1 AND 8),
  ADD COLUMN course varchar(160) CHECK (course IS NULL OR length(btrim(course)) BETWEEN 1 AND 160);
