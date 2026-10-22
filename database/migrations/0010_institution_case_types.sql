-- Case type catalogs are institution policy, not a globally shared list.
ALTER TABLE case_types ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE RESTRICT;

UPDATE case_types
SET institution_id = (SELECT id FROM institutions ORDER BY created_at, id LIMIT 1);

ALTER TABLE case_types ALTER COLUMN institution_id SET NOT NULL;
DROP INDEX case_types_code_unique;
CREATE UNIQUE INDEX case_types_institution_code_unique
  ON case_types (institution_id, lower(code));
CREATE INDEX case_types_institution_active_idx ON case_types (institution_id, is_active, name);
