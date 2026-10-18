-- Row-level triggers do not fire on TRUNCATE, so the DTR history and records could still be
-- wiped in one statement. Block that too (same approach as audit_logs).
CREATE FUNCTION dtr_block_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dtr_revisions_no_truncate BEFORE TRUNCATE ON dtr_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER dtr_events_no_truncate BEFORE TRUNCATE ON dtr_events
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
CREATE TRIGGER monthly_dtrs_no_truncate BEFORE TRUNCATE ON monthly_dtrs
  FOR EACH STATEMENT EXECUTE FUNCTION dtr_block_truncate();
